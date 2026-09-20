//! Managed cloud workspaces. Physical directory names never become display names.
use super::*;

#[tauri::command]
pub async fn cloud_setup(app: tauri::AppHandle, access: State<'_, Access>, auth: State<'_, DriveAuth>) -> Result<Vec<String>, String> {
    let guard = drive_auth::transfer_guard(&auth)?;
    let data = app.path().app_data_dir().map_err(crate::err)?;
    let roots = tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let drive = Drive::new()?;
        let account = drive_auth::account_key()?;
        let base = base_folder(&drive)?;
        let parent = data.join("Synced");
        fs::create_dir_all(&parent).map_err(crate::err)?;
        let parent = parent.canonicalize().map_err(crate::err)?;
        let mut remote = drive.children(&base)?;
        remote.retain(|v| v["mimeType"] == "application/vnd.google-apps.folder" && v["appProperties"]["novaKey"].is_string());
        if remote.is_empty() {
            drive.folder(&base, "nova-cloud-default-v2", "Notes")?;
            remote = drive.children(&base)?;
            remote.retain(|v| v["mimeType"] == "application/vnd.google-apps.folder" && v["appProperties"]["novaKey"].is_string());
        }
        let mut roots = Vec::new();
        for space in remote {
            let remote_id = id(&space)?;
            let name = space["name"].as_str().unwrap_or("Notes");
            let key = crate::revision(format!("{account}/{remote_id}").as_bytes());
            let destination = parent.join(&key);
            if !destination.exists() {
                let temporary = tempfile::Builder::new().prefix(".download-").tempdir_in(&parent).map_err(crate::err)?;
                let mut rules = serde_json::Map::new();
                let mut budget = 512 * 1024 * 1024;
                restore_tree(&drive, &remote_id, temporary.path(), "", &mut rules, &mut budget, 0)?;
                let mut receipts = serde_json::Map::new();
                for path in rules.keys() { receipts.insert(path.clone(), json!(crate::revision(&fs::read(temporary.path().join(path)).map_err(crate::err)?))); }
                let mut registry = json!({"cloudSpace":{"id":remote_id,"name":name,"account":account},"driveWorkspace":{"id":remote_id,"account":account},"syncPolicy":{"version":1,"rules":{"":true}},"starred":[]});
                for entry in reconcile::remote_tree(&drive, &remote_id)? {
                    if let Some(hash) = receipts.get(&entry.path).and_then(Value::as_str) {
                        identities::record(&mut registry, &account, &id(&entry.file)?, &entry.path, &entry.path, hash, &entry.file);
                    }
                }
                fs::write(temporary.path().join(".nova"), serde_json::to_vec(&registry).map_err(crate::err)?).map_err(crate::err)?;
                fs::rename(temporary.path(), &destination).map_err(crate::err)?;
            } else {
                if fs::symlink_metadata(&destination).map_err(crate::err)?.file_type().is_symlink() { return Err("Cloud storage must not be a symbolic link.".into()); }
                let registry = crate::read_registry(&destination)?;
                if registry["cloudSpace"]["id"].as_str() != Some(&remote_id) || registry["cloudSpace"]["account"].as_str() != Some(&account) {
                    return Err("Cloud storage identity does not match. Your files were left unchanged.".into());
                }
            }
            roots.push((destination, name.to_owned()));
        }
        Ok::<_, String>(roots)
    }).await.map_err(crate::err)??;
    let mut result = Vec::new();
    for (root, name) in roots {
        {
            let _lock = access.writes.lock().map_err(crate::err)?;
            let mut registry = crate::read_registry(&root)?;
            if registry["cloudSpace"]["name"].as_str() != Some(&name) {
                registry["cloudSpace"]["name"] = json!(name);
            }
            let stars = crate::registry_stars(&registry)?;
            crate::write_registry(&root, registry, &stars)?;
        }
        access.roots.lock().map_err(crate::err)?.insert(root.clone());
        #[cfg(desktop)] result.push(root.to_string_lossy().into_owned());
        #[cfg(target_os = "ios")] result.push(crate::mobile_storage::identity(&app.path().app_data_dir().map_err(crate::err)?, &root)?);
    }
    Ok(result)
}

#[tauri::command]
pub async fn cloud_move_in(app: tauri::AppHandle, access: State<'_, Access>, source: String, path: String, target: String) -> Result<String, String> {
    let from = crate::root_path(&access, &source)?;
    let to = crate::root_path(&access, &target)?;
    let _lock = access.writes.lock().map_err(crate::err)?;
    if crate::read_registry(&from)?["cloudSpace"].is_object() { return Err("This note is already in Cloud.".into()); }
    if !crate::read_registry(&to)?["cloudSpace"].is_object() { return Err("Choose a Cloud workspace.".into()); }
    let draft = crate::draft_path(&app.path().app_data_dir().map_err(crate::err)?.join("drafts"), &source, &path);
    if draft.exists() && !serde_json::from_slice::<Value>(&fs::read(draft).map_err(crate::err)?).map_err(crate::err)?.is_null() {
        return Err("Open and save this note before moving it to Cloud.".into());
    }
    let original = crate::scoped_path(&from, &path)?;
    let name = original.file_name().and_then(|n| n.to_str()).ok_or("Invalid note name.")?;
    let destination = to.join(name);
    let old_meta = crate::metadata_path(&app, &original)?;
    let new_meta = crate::metadata_path(&app, &destination)?;
    move_saved_note(&original, &destination, &old_meta, &new_meta, Some(&to))?;
    Ok(name.to_owned())
}

fn move_saved_note(original: &Path, destination: &Path, old_meta: &Path, new_meta: &Path, cloud_root: Option<&Path>) -> Result<(), String> {
    if destination.exists() { return Err("Cloud already contains a note with this name. Rename one before moving.".into()); }
    let bytes = fs::read(original).map_err(crate::err)?;
    if bytes.len() as u64 > crate::MAX_FILE { return Err("This note exceeds the size limit.".into()); }
    // Copy first, then remove the source. Any failure leaves the original safe.
    publish_copy(destination, &bytes)?;
    if old_meta.exists() { crate::atomic_write(new_meta, &fs::read(old_meta).map_err(crate::err)?)?; }
    if fs::read(original).map_err(crate::err)? != bytes { return Err("The local note changed during the move. Both copies were kept.".into()); }
    if let Some(root) = cloud_root {
        let name = destination.file_name().and_then(|n| n.to_str()).ok_or("Invalid note name.")?;
        reset_imported_path(root, name)?;
    }
    fs::remove_file(original).map_err(|e| format!("Cloud copy saved, but the original could not be removed: {e}"))?;
    Ok(())
}

// An explicit new import must not inherit the deleted note's identity or opt-out.
fn reset_imported_path(root: &Path, path: &str) -> Result<(), String> {
    let mut registry = crate::read_registry(root)?;
    // Old deleted IDs remain tombstoned; a new import gets a new Drive ID.
    crate::drive_registry::relocate(&mut registry, path, None)?;
    if let Some(rules) = registry["syncPolicy"]["rules"].as_object_mut() { rules.remove(path); }
    let stars = crate::registry_stars(&registry)?;
    crate::write_registry(root, registry, &stars)
}

// Publish only complete bytes, and never replace an existing note.
fn publish_copy(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut file = tempfile::NamedTempFile::new_in(destination.parent().ok_or("Missing Cloud folder")?).map_err(crate::err)?;
    file.write_all(bytes).map_err(crate::err)?;
    file.as_file().sync_all().map_err(crate::err)?;
    file.persist_noclobber(destination).map_err(crate::err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_to_cloud_move_preserves_content_and_bookmarks() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("local.txt");
        let destination = dir.path().join("cloud.txt");
        let old_meta = dir.path().join("local.json");
        let new_meta = dir.path().join("cloud.json");
        fs::write(&original, "a fresh note").unwrap();
        fs::write(&old_meta, "[]").unwrap();
        move_saved_note(&original, &destination, &old_meta, &new_meta, None).unwrap();
        assert!(!original.exists());
        assert_eq!(fs::read_to_string(destination).unwrap(), "a fresh note");
        assert_eq!(fs::read_to_string(new_meta).unwrap(), "[]");
    }
    #[test]
    fn importing_a_reused_name_clears_only_its_deleted_identity() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        crate::write_registry(root, json!({
            "syncPolicy":{"version":1,"rules":{"":true,"Work.txt":false}},
            "syncDeletedPaths":{"Work.txt":true,"Other.txt":true},
            "driveFiles":{"account":{"Work.txt":{"id":"old","deleted":true},"Other.txt":{"id":"keep"}}},
            "driveReceipts":{"account":{"Work.txt":"old-hash","Other.txt":"keep-hash"}}
        }), &[]).unwrap();
        let original = root.join("source.txt");
        let destination = root.join("Work.txt");
        let meta = root.join("absent.json");
        fs::write(&original, "new local content").unwrap();
        move_saved_note(&original, &destination, &meta, &meta, Some(root)).unwrap();
        let registry = crate::read_registry(root).unwrap();
        assert!(registry["syncDeletedPaths"]["Work.txt"].is_null());
        assert!(registry["driveFiles"]["account"]["Work.txt"].is_null());
        assert!(registry["driveReceipts"]["account"]["Work.txt"].is_null());
        assert_eq!(registry["driveObjects"]["account"]["keep"]["id"], "keep");
        assert_eq!(registry["driveObjects"]["account"]["keep"]["deleted"], true);
        assert_eq!(registry["driveObjects"]["account"]["old"]["deleted"], true);
        assert!(crate::sync_policy::read(&registry).unwrap().included("Work.txt"));
        assert_eq!(fs::read_to_string(destination).unwrap(), "new local content");
        assert!(!original.exists());
    }
    #[test]
    fn failed_move_leaves_the_original_note_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("local.txt");
        let destination = dir.path().join("cloud.txt");
        let meta = dir.path().join("no-metadata.json");
        fs::write(&original, "local version").unwrap();
        fs::write(&destination, "cloud version").unwrap();
        assert!(move_saved_note(&original, &destination, &meta, &meta, None).is_err());
        assert_eq!(fs::read_to_string(original).unwrap(), "local version");
        assert_eq!(fs::read_to_string(destination).unwrap(), "cloud version");
    }
    #[test]
    fn moving_never_overwrites_a_colliding_cloud_note() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("same.txt");
        fs::write(&path, "existing cloud content").unwrap();
        assert!(publish_copy(&path, b"local content").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "existing cloud content");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn publishing_copies_all_bytes_without_temporary_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fresh.txt");
        let bytes = vec![123; 1024 * 1024];
        publish_copy(&path, &bytes).unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
