//! Explicit per-file recovery. All writes require the exact reviewed snapshots.
use super::*;

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileReview {
    name: String,
    local_text: String,
    local_revision: String,
    remote_text: String,
    remote_revision: String,
    remote_name: String,
    drive_id: String,
    account: String,
    parent: String,
}
fn review(drive: &Drive, root: &Path, path: &str, account: &str) -> Result<FileReview, String> {
    let registry = crate::read_registry(root)?;
    if registry["cloudSpace"]["account"].as_str() != Some(account) {
        return Err("Reconnect this Cloud space’s account first.".into());
    }
    let identity = identities::at_path(&registry, account, path);
    let file_id = id(identity)?;
    let folder = registry["cloudSpace"]["id"]
        .as_str()
        .ok_or("Not a Cloud space")?;
    let remote = reconcile::remote_tree(drive, folder)?;
    let entry = remote
        .iter()
        .find(|entry| entry.file["id"] == file_id)
        .ok_or("This note is no longer in its Cloud space. Refresh Cloud first.")?;
    if entry.path != path {
        return Err("The file moved or was renamed. Refresh Cloud first.".into());
    }
    let metadata = || -> Result<Value, String> {
        checked(
            drive
                .client
                .get(format!("{}/{file_id}", drive.v2))
                .query(&[("fields", "etag,title,parents(id)")])
                .bearer_auth(&drive.token)
                .send()
                .map_err(network)?,
        )?
        .json()
        .map_err(network)
    };
    let before = metadata()?;
    if before["title"] != entry.file["name"]
        || before["parents"].as_array().map(Vec::len) != Some(1)
        || before["parents"][0]["id"] != entry.file["parents"][0]
    {
        return Err("Drive moved or renamed this file during review. Refresh Cloud first.".into());
    }
    let mut bytes = Vec::new();
    checked(
        drive
            .client
            .get(format!("{}/{file_id}", drive.api))
            .query(&[("alt", "media")])
            .bearer_auth(&drive.token)
            .send()
            .map_err(network)?,
    )?
    .take(crate::MAX_FILE + 1)
    .read_to_end(&mut bytes)
    .map_err(crate::err)?;
    if bytes.len() as u64 > crate::MAX_FILE {
        return Err("Drive copy exceeds the note size limit.".into());
    }
    if before != metadata()? {
        return Err("Drive changed during review. Retry.".into());
    }
    let local = crate::scoped_path(root, path)?;
    let local_bytes = fs::read(local).map_err(crate::err)?;
    if local_bytes.len() as u64 > crate::MAX_FILE {
        return Err("Device copy exceeds the note size limit.".into());
    }
    Ok(FileReview {
        name: path.into(),
        local_revision: crate::revision(&local_bytes),
        local_text: String::from_utf8(local_bytes).map_err(crate::err)?,
        remote_text: String::from_utf8(bytes).map_err(crate::err)?,
        remote_revision: before["etag"]
            .as_str()
            .filter(|v| !v.is_empty())
            .ok_or("Drive returned no revision guard")?
            .into(),
        remote_name: before["title"]
            .as_str()
            .ok_or("Missing Drive filename")?
            .into(),
        drive_id: file_id,
        account: account.into(),
        parent: id(&json!({"id":before["parents"][0]["id"]}))?,
    })
}
fn check_review(current: &FileReview, reviewed: &FileReview) -> Result<(), String> {
    if current != reviewed {
        return Err("This file changed. Review both copies again.".into());
    }
    Ok(())
}
fn recovery(data: &Path, reviewed: &FileReview, direction: &str) -> Result<(), String> {
    let directory = data
        .join("Cloud Recovery")
        .join(crate::revision(reviewed.account.as_bytes()))
        .join(&reviewed.drive_id);
    fs::create_dir_all(&directory).map_err(crate::err)?;
    let text = if direction == "pull" || direction == "delete" {
        &reviewed.local_text
    } else {
        &reviewed.remote_text
    };
    let name = format!("{}-{}.txt", direction, crate::revision(text.as_bytes()));
    crate::atomic_write(&directory.join(name), text.as_bytes())
}
#[tauri::command]
pub async fn drive_file_review(
    root: String,
    path: String,
    access: State<'_, Access>,
    auth: State<'_, DriveAuth>,
) -> Result<FileReview, String> {
    let root = crate::root_path(&access, &root)?;
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        review(&Drive::new()?, &root, &path, &drive_auth::account_key()?)
    })
    .await
    .map_err(crate::err)?
}
#[tauri::command]
pub async fn drive_file_apply(
    root: String,
    path: String,
    reviewed: FileReview,
    direction: String,
    protected_paths: Vec<String>,
    app: tauri::AppHandle,
    access: State<'_, Access>,
    auth: State<'_, DriveAuth>,
) -> Result<(), String> {
    if !["pull", "push", "delete"].contains(&direction.as_str()) {
        return Err("Unknown Cloud action".into());
    }
    let root = crate::root_path(&access, &root)?;
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let drive = Drive::new()?;
        let account = drive_auth::account_key()?;
        check_review(&review(&drive, &root, &path, &account)?, &reviewed)?;
        let access = app.state::<Access>();
        let _lock = access.writes.lock().map_err(crate::err)?;
        let data = app.path().app_data_dir().map_err(crate::err)?;
        if protected_paths.contains(&path) || reconcile::saved_draft(&data, &root, &path)? {
            return Err("Save or discard this note’s unsaved changes first.".into());
        }
        let latest_registry = crate::read_registry(&root)?;
        if id(identities::at_path(&latest_registry, &account, &path))? != reviewed.drive_id
            || crate::revision(&fs::read(crate::scoped_path(&root, &path)?).map_err(crate::err)?)
                != reviewed.local_revision
        {
            return Err("Device copy changed. Review it again.".into());
        }
        recovery(&data, &reviewed, &direction)?;
        let mut registry = crate::read_registry(&root)?;
        let source = crate::scoped_path(&root, &path)?;
        if direction == "push" {
            checked(
                drive
                    .client
                    .put(format!("{}/{}", drive.upload_v2, reviewed.drive_id))
                    .query(&[("uploadType", "media")])
                    .bearer_auth(&drive.token)
                    .header("If-Match", &reviewed.remote_revision)
                    .header("Content-Type", "text/plain;charset=UTF-8")
                    .body(reviewed.local_text.clone())
                    .send()
                    .map_err(network)?,
            )?;
        } else if direction == "pull" {
            crate::atomic_write(&source, reviewed.remote_text.as_bytes())?;
        } else {
            let space = registry["cloudSpace"]["id"]
                .as_str()
                .ok_or("Not a Cloud space")?;
            let destination = drive.folder(space, "nova-deleted-v1", ".deleted")?;
            checked(
                drive
                    .client
                    .patch(format!("{}/{}", drive.v2, reviewed.drive_id))
                    .query(&[
                        ("addParents", destination.as_str()),
                        ("removeParents", reviewed.parent.as_str()),
                    ])
                    .bearer_auth(&drive.token)
                    .header("If-Match", &reviewed.remote_revision)
                    .json(&json!({}))
                    .send()
                    .map_err(network)?,
            )?;
            identities::relocate(&mut registry, &path, None)?;
            registry["driveObjects"][&account][&reviewed.drive_id]["cloudArchived"] = json!(true);
            fs::remove_file(&source).map_err(crate::err)?;
        }
        if direction != "delete" {
            let hash = if direction == "pull" {
                crate::revision(reviewed.remote_text.as_bytes())
            } else {
                reviewed.local_revision.clone()
            };
            identities::record(
                &mut registry,
                &account,
                &reviewed.drive_id,
                &path,
                &path,
                &hash,
                &Value::Null,
            );
        }
        let stars = crate::registry_stars(&registry)?
            .into_iter()
            .filter(|p| direction != "delete" || p != &path)
            .collect::<Vec<_>>();
        crate::write_registry(&root, registry, &stars)?;
        Ok(())
    })
    .await
    .map_err(crate::err)?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn copy() -> FileReview {
        FileReview {
            name: "a.md".into(),
            local_text: "local".into(),
            local_revision: "l".into(),
            remote_text: "remote".into(),
            remote_revision: "r".into(),
            remote_name: "a.md".into(),
            drive_id: "id".into(),
            account: "a".into(),
            parent: "p".into(),
        }
    }
    #[test]
    fn rejects_unreviewed_edits_and_identity_changes() {
        let reviewed = copy();
        assert!(check_review(&reviewed, &reviewed).is_ok());
        for field in ["local", "remote", "account", "id"] {
            let mut changed = reviewed.clone();
            match field {
                "local" => changed.local_text.push('!'),
                "remote" => changed.remote_revision.push('!'),
                "account" => changed.account.push('!'),
                _ => changed.drive_id.push('!'),
            }
            assert!(check_review(&changed, &reviewed).is_err());
        }
    }
    #[test]
    fn recovery_keeps_both_replacement_directions_outside_workspace() {
        let data = tempfile::tempdir().unwrap();
        let reviewed = copy();
        recovery(data.path(), &reviewed, "pull").unwrap();
        recovery(data.path(), &reviewed, "push").unwrap();
        let dir = data
            .path()
            .join("Cloud Recovery")
            .join(crate::revision(b"a"))
            .join("id");
        assert_eq!(
            fs::read_to_string(dir.join(format!("pull-{}.txt", crate::revision(b"local"))))
                .unwrap(),
            "local"
        );
        assert_eq!(
            fs::read_to_string(dir.join(format!("push-{}.txt", crate::revision(b"remote"))))
                .unwrap(),
            "remote"
        );
    }
    fn deletion_fixture(dirty: bool, protected: bool) -> (tempfile::TempDir, Report) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            for body in [
                r#"{"files":[{"id":"deleted-folder","mimeType":"application/vnd.google-apps.folder"}]}"#,
                r#"{"files":[{"id":"note-id"}]}"#,
            ] {
                let (mut socket, _) = listener.accept().unwrap();
                let mut buffer = [0; 4096];
                socket.read(&mut buffer).unwrap();
                write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
            }
        });
        let root = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        fs::write(
            root.path().join("a.md"),
            if dirty {
                "my unsynced edit"
            } else {
                "baseline"
            },
        )
        .unwrap();
        let mut registry = json!({"syncPolicy":{"version":1,"rules":{"":true}},"starred":["a.md"]});
        identities::record(
            &mut registry,
            "a",
            "note-id",
            "a.md",
            "a.md",
            &crate::revision(b"baseline"),
            &Value::Null,
        );
        crate::write_registry(root.path(), registry, &["a.md".into()]).unwrap();
        let drive = Drive {
            client: Client::new(),
            token: "test".into(),
            api: url.clone(),
            v2: url.clone(),
            upload_v2: url.clone(),
            upload_v3: url,
        };
        let mut report = Report {
            root: "test".into(),
            folder_url: String::new(),
            items: vec![],
            changes: vec![],
            uploaded: false,
        };
        receive_deletions(
            &drive,
            root.path(),
            "space",
            "a",
            data.path(),
            &std::sync::Mutex::new(()),
            &if protected {
                vec!["a.md".into()]
            } else {
                vec![]
            },
            &mut report,
            None,
        )
        .unwrap();
        server.join().unwrap();
        (root, report)
    }
    #[test]
    fn cloud_deletion_removes_only_clean_unprotected_device_copies() {
        let (clean, report) = deletion_fixture(false, false);
        assert!(!clean.path().join("a.md").exists());
        assert_eq!(report.items[0].state, "deleted");
        assert!(
            crate::registry_stars(&crate::read_registry(clean.path()).unwrap())
                .unwrap()
                .is_empty()
        );
        for (dirty, protected) in [(true, false), (false, true)] {
            let (root, report) = deletion_fixture(dirty, protected);
            assert!(root.path().join("a.md").exists());
            assert_eq!(report.items[0].state, "error");
            assert!(
                identities::at_path(&crate::read_registry(root.path()).unwrap(), "a", "a.md")
                    .is_object()
            );
        }
    }
}

// Only explicit .deleted membership authorizes removal; an incomplete listing,
// ordinary missing file, or remote move never implies deletion.
pub(super) fn receive_deletions(
    drive: &Drive,
    root: &Path,
    space: &str,
    account: &str,
    data: &Path,
    writes: &std::sync::Mutex<()>,
    protected: &[String],
    report: &mut Report,
    only: Option<&str>,
) -> Result<(), String> {
    let Some(folder) = drive.find(space, "nova-deleted-v1")? else {
        return Ok(());
    };
    let deleted = drive
        .children(&id(&folder)?)?
        .into_iter()
        .map(|file| id(&file))
        .collect::<Result<std::collections::HashSet<_>, _>>()?;
    let _lock = writes.lock().map_err(crate::err)?;
    let mut registry = crate::read_registry(root)?;
    let tracked = identities::paths(&registry, account);
    for (path, identity) in tracked {
        if only.is_some_and(|only| only != path) || !deleted.contains(&id(&identity)?) {
            continue;
        }
        let source = reconcile::local_target(root, &path)?;
        let dirty = source.exists()
            && identity["receipt"].as_str()
                != Some(crate::revision(&fs::read(&source).map_err(crate::err)?).as_str());
        if dirty || protected.contains(&path) || reconcile::saved_draft(data, root, &path)? {
            report.items.push(Item { path, state:"error".into(), message:"Deleted in Cloud. Your local edits are retained; export them or save a new note.".into(), missing_drive_id:None });
            continue;
        }
        // Keep a recovery copy even for a clean device copy before removing it.
        if source.exists() {
            let directory = data
                .join("Cloud Recovery")
                .join(crate::revision(account.as_bytes()))
                .join(id(&identity)?);
            fs::create_dir_all(&directory).map_err(crate::err)?;
            crate::atomic_write(
                &directory.join("deleted.txt"),
                &fs::read(&source).map_err(crate::err)?,
            )?;
            fs::remove_file(&source).map_err(crate::err)?;
        }
        identities::relocate(&mut registry, &path, None)?;
        registry["driveObjects"][account][id(&identity)?]["cloudArchived"] = json!(true);
        let stars = crate::registry_stars(&registry)?
            .into_iter()
            .filter(|p| p != &path)
            .collect::<Vec<_>>();
        crate::write_registry(root, registry.clone(), &stars)?;
        report.items.push(Item {
            path,
            state: "deleted".into(),
            message: "Moved to .deleted in Google Drive.".into(),
            missing_drive_id: None,
        });
    }
    Ok(())
}

#[derive(Serialize)]
pub struct RecoveryCopy {
    name: String,
    text: String,
}
#[tauri::command]
pub async fn drive_file_recovery(
    root: String,
    path: String,
    app: tauri::AppHandle,
    access: State<'_, Access>,
    auth: State<'_, DriveAuth>,
) -> Result<Vec<RecoveryCopy>, String> {
    let root = crate::root_path(&access, &root)?;
    let _guard = drive_auth::transfer_guard(&auth)?;
    let registry = crate::read_registry(&root)?;
    let account = drive_auth::account_key()?;
    let identity = identities::at_path(&registry, &account, &path);
    let directory = app
        .path()
        .app_data_dir()
        .map_err(crate::err)?
        .join("Cloud Recovery")
        .join(crate::revision(account.as_bytes()))
        .join(id(identity)?);
    if !directory.exists() {
        return Ok(vec![]);
    }
    let mut copies = Vec::new();
    for entry in fs::read_dir(directory).map_err(crate::err)? {
        let entry = entry.map_err(crate::err)?;
        if entry.file_type().map_err(crate::err)?.is_file() {
            copies.push(RecoveryCopy {
                name: entry.file_name().to_string_lossy().into_owned(),
                text: fs::read_to_string(entry.path()).map_err(crate::err)?,
            });
        }
    }
    Ok(copies)
}
