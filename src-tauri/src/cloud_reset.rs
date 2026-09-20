//! A mobile recovery reset downloads first, then replaces local note state.
//! No remote writes and no dependency on the old registry's schema or health.
use super::*;

#[cfg(target_os = "ios")]
#[tauri::command]
pub async fn cloud_reset_local(app: tauri::AppHandle, auth: State<'_, DriveAuth>) -> Result<(), String> {
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let data = app.path().app_data_dir().map_err(crate::err)?;
        let staging = tempfile::Builder::new().prefix(".cloud-reset-").tempdir_in(&data).map_err(crate::err)?;
        download_snapshot(&Drive::new()?, &drive_auth::account_key()?, staging.path())?;
        let access = app.state::<Access>();
        let _writes = access.writes.lock().map_err(crate::err)?;
        replace_local_state(&data, staging.path())?;
        access.roots.lock().map_err(crate::err)?.clear();
        Ok(())
    }).await.map_err(crate::err)?
}

fn download_snapshot(drive: &Drive, account: &str, staging: &Path) -> Result<(), String> {
    // Unlike ordinary setup, recovery must never create/rename anything in Drive.
    let base = drive.find("root", "nova-notes-v1")?.ok_or("No Nova backup was found in this Google Drive account. Local notes were kept.")?;
    if base["mimeType"] != "application/vnd.google-apps.folder" { return Err("Nova’s Drive folder is not a folder. Local notes were kept.".into()); }
    for name in ["Synced", "Notes", "drafts", "bookmarks"] { fs::create_dir(staging.join(name)).map_err(crate::err)?; }
    let mut folders = Vec::new();
    let mut budget = 512_u64 * 1024 * 1024;
    let mut count = 0;
    for space in drive.children(&id(&base)?)? {
        if space["mimeType"] != "application/vnd.google-apps.folder" || !space["appProperties"]["novaKey"].is_string() { continue; }
        let remote_id = id(&space)?;
        let key = crate::revision(format!("{account}/{remote_id}").as_bytes());
        let root = staging.join("Synced").join(&key);
        fs::create_dir(&root).map_err(crate::err)?;
        let name = space["name"].as_str().unwrap_or("Notes");
        let mut registry = json!({"cloudSpace":{"id":remote_id,"name":name,"account":account},"driveWorkspace":{"id":remote_id,"account":account},"syncPolicy":{"version":1,"rules":{"":true}},"starred":[]});
        let mut paths = std::collections::HashSet::new();
        for entry in reconcile::remote_tree(drive, &remote_id)? {
            if !paths.insert(entry.path.to_lowercase()) { return Err("Drive contains colliding note names. Local notes were kept.".into()); }
            count += 1;
            if count > 50_000 { return Err("Too many notes to restore. Local notes were kept.".into()); }
            let file_id = id(&entry.file)?;
            let response = checked(drive.client.get(format!("{}/{file_id}", drive.api)).query(&[("alt", "media")]).bearer_auth(&drive.token).send().map_err(network)?)?;
            let mut bytes = Vec::new();
            response.take(crate::MAX_FILE + 1).read_to_end(&mut bytes).map_err(crate::err)?;
            if bytes.len() as u64 > crate::MAX_FILE || bytes.len() as u64 > budget { return Err("Restore exceeds the size limit. Local notes were kept.".into()); }
            budget -= bytes.len() as u64;
            std::str::from_utf8(&bytes).map_err(|_| "Drive note is not valid UTF-8. Local notes were kept.".to_string())?;
            let target = root.join(&entry.path);
            fs::create_dir_all(target.parent().ok_or("Invalid note path")?).map_err(crate::err)?;
            use std::io::Write;
            fs::OpenOptions::new().write(true).create_new(true).open(target).map_err(crate::err)?.write_all(&bytes).map_err(crate::err)?;
            crate::drive_registry::record(&mut registry, account, &file_id, &entry.path, &entry.path, &crate::revision(&bytes), &entry.file);
        }
        crate::write_registry(&root, registry, &[])?;
        folders.push(json!({"root":format!("mobile-sync/{key}"),"name":name}));
    }
    if folders.is_empty() { return Err("No Cloud spaces were found in Google Drive. Local notes were kept.".into()); }
    fs::write(staging.join("explorer.json"), serde_json::to_vec(&json!({"folders":folders,"active":null,"tabs":[],"mode":"edit"})).map_err(crate::err)?).map_err(crate::err)
}

const LOCAL_ITEMS: [&str; 5] = ["Synced", "Notes", "drafts", "bookmarks", "explorer.json"];
fn replace_local_state(data: &Path, staging: &Path) -> Result<(), String> {
    // Validate the entire replacement before moving any old data.
    for name in LOCAL_ITEMS { if !staging.join(name).exists() { return Err("Incomplete Cloud download. Local notes were kept.".into()); } }
    let backup = tempfile::Builder::new().prefix(".before-reset-").tempdir_in(data).map_err(crate::err)?;
    let mut moved = Vec::new();
    let mut installed = Vec::new();
    let result = (|| {
        for name in LOCAL_ITEMS {
            let old = data.join(name);
            if old.try_exists().map_err(crate::err)? {
                fs::rename(&old, backup.path().join(name)).map_err(crate::err)?;
                moved.push(name);
            }
            fs::rename(staging.join(name), &old).map_err(crate::err)?;
            installed.push(name);
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        let rollback = (|| {
            for name in installed.into_iter().rev() { fs::rename(data.join(name), staging.join(name)).map_err(crate::err)?; }
            for name in moved.into_iter().rev() { fs::rename(backup.path().join(name), data.join(name)).map_err(crate::err)?; }
            Ok::<_, String>(())
        })();
        if let Err(rollback) = rollback {
            let retained = backup.keep();
            return Err(format!("Reset failed: {error}. Recovery failed: {rollback}. Original data retained at {}.", retained.display()));
        }
        return Err(format!("Reset failed; local notes were kept: {error}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn mock_drive(fail_download: bool) -> (Drive, std::thread::JoinHandle<()>) {
        use std::net::TcpListener;
        use std::io::{BufRead, BufReader, Write};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let api = format!("http://{}/files", listener.local_addr().unwrap());
        let thread = std::thread::spawn(move || {
            let responses = [
                json!({"files":[{"id":"base","mimeType":"application/vnd.google-apps.folder"}]}).to_string(),
                json!({"files":[{"id":"space","name":"Notes","mimeType":"application/vnd.google-apps.folder","appProperties":{"novaKey":"space"}}]}).to_string(),
                json!({"files":[{"id":"workout-id","name":"Workout.txt","mimeType":"text/plain","version":"3","modifiedTime":"today","appProperties":{"novaKey":"note"}}]}).to_string(),
                "Cloud workout content".to_string(),
            ];
            for (index, body) in responses.iter().enumerate() {
                let (mut stream, _) = listener.accept().unwrap();
                stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new(); reader.read_line(&mut line).unwrap();
                assert!(line.starts_with("GET "), "Reset must only read Drive: {line}");
                loop { line.clear(); reader.read_line(&mut line).unwrap(); if line == "\r\n" { break; } }
                let status = if fail_download && index == 3 { "503 Service Unavailable" } else { "200 OK" };
                write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            }
        });
        (Drive { client:Client::builder().timeout(Duration::from_secs(5)).build().unwrap(), token:"test".into(), api, v2:String::new(), upload_v2:String::new(), upload_v3:String::new() }, thread)
    }
    #[test]
    fn restores_deleted_note_with_fresh_drive_id_registry_without_remote_writes() {
        let data = tempfile::tempdir().unwrap();
        fs::create_dir(data.path().join("Synced")).unwrap();
        fs::write(data.path().join("Synced/.nova"), "broken old registry").unwrap();
        let stage = tempfile::tempdir_in(data.path()).unwrap();
        let (drive, server) = mock_drive(false);
        download_snapshot(&drive, "account", stage.path()).unwrap();
        server.join().unwrap();
        replace_local_state(data.path(), stage.path()).unwrap();
        let root = data.path().join("Synced").join(crate::revision(b"account/space"));
        assert_eq!(fs::read_to_string(root.join("Workout.txt")).unwrap(), "Cloud workout content");
        let registry = crate::read_registry(&root).unwrap();
        assert_eq!(registry["driveObjects"]["account"]["workout-id"]["localPath"], "Workout.txt");
        assert!(registry["driveObjects"]["account"]["workout-id"]["deleted"].is_null());
        assert_eq!(fs::read_dir(data.path().join("drafts")).unwrap().count(), 0);
    }
    #[test]
    fn failed_remote_download_never_replaces_local_notes() {
        let data = tempfile::tempdir().unwrap();
        fs::create_dir(data.path().join("Synced")).unwrap();
        fs::write(data.path().join("Synced/local.txt"), "unsynced edits").unwrap();
        let stage = tempfile::tempdir_in(data.path()).unwrap();
        let (drive, server) = mock_drive(true);
        assert!(download_snapshot(&drive, "account", stage.path()).is_err());
        server.join().unwrap();
        assert_eq!(fs::read_to_string(data.path().join("Synced/local.txt")).unwrap(), "unsynced edits");
    }
    #[test]
    fn replaces_notes_and_all_recovery_state_but_keeps_other_settings() {
        let data = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir_in(data.path()).unwrap();
        for name in LOCAL_ITEMS {
            fs::write(data.path().join(name), "old state").unwrap();
            fs::write(stage.path().join(name), "fresh state").unwrap();
        }
        fs::write(data.path().join("settings.json"), "keep").unwrap();
        replace_local_state(data.path(), stage.path()).unwrap();
        for name in LOCAL_ITEMS { assert_eq!(fs::read_to_string(data.path().join(name)).unwrap(), "fresh state"); }
        assert_eq!(fs::read_to_string(data.path().join("settings.json")).unwrap(), "keep");
    }
    #[test]
    fn incomplete_download_keeps_original_state() {
        let data = tempfile::tempdir().unwrap();
        let stage = tempfile::tempdir_in(data.path()).unwrap();
        fs::write(data.path().join("Synced"), "Workout and drafts").unwrap();
        fs::write(stage.path().join("Synced"), "partial").unwrap();
        assert!(replace_local_state(data.path(), stage.path()).is_err());
        assert_eq!(fs::read_to_string(data.path().join("Synced")).unwrap(), "Workout and drafts");
    }
}
