//! Reconcile a complete Drive listing before uploading. Missing files never imply
//! permission to delete the other copy or to recreate a deleted file.
use super::*;
use std::collections::HashSet;

pub(super) struct Remote {
    pub path: String,
    pub file: Value,
}
pub(super) fn remote_tree(drive: &Drive, folder: &str) -> Result<Vec<Remote>, String> {
    fn walk(
        drive: &Drive,
        folder: &str,
        prefix: &str,
        depth: usize,
        out: &mut Vec<Remote>,
        names: &mut HashSet<String>,
    ) -> Result<(), String> {
        if depth > 32 {
            return Err("Drive folders are nested too deeply.".into());
        }
        for file in drive.children(folder)? {
            if !file["appProperties"]["novaKey"].is_string() {
                continue;
            }
            let name = file["name"].as_str().ok_or("Drive file has no name.")?;
            if !safe_name(name) {
                return Err(
                    "A Drive file has an unsafe local name. Rename it in Drive first.".into(),
                );
            }
            let path = if prefix.is_empty() {
                name.into()
            } else {
                format!("{prefix}/{name}")
            };
            if !names.insert(path.to_lowercase()) {
                return Err("Drive contains duplicate or case-colliding paths. Resolve them in Drive first.".into());
            }
            if names.len() > 50000 {
                return Err("Too many files in the Drive workspace.".into());
            }
            if file["mimeType"] == "application/vnd.google-apps.folder" {
                walk(drive, &id(&file)?, &path, depth + 1, out, names)?;
            } else if !file["mimeType"]
                .as_str()
                .unwrap_or("")
                .starts_with("application/vnd.google-apps.")
                && crate::supported(Path::new(&path))
            {
                out.push(Remote { path, file });
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    walk(drive, folder, "", 0, &mut files, &mut HashSet::new())?;
    Ok(files)
}

#[derive(Debug, PartialEq)]
enum Action {
    Agreed,
    Download,
    Upload,
    Conflict,
}
fn action(baseline: Option<&str>, local: &str, remote: &str) -> Action {
    if local == remote {
        Action::Agreed
    } else if baseline == Some(local) {
        Action::Download
    } else if baseline == Some(remote) {
        Action::Upload
    } else {
        Action::Conflict
    }
}
fn local_target(root: &Path, path: &str) -> Result<PathBuf, String> {
    if path.is_empty()
        || !path
            .split('/')
            .all(|part| safe_name(part) && !part.starts_with('.'))
    {
        return Err("Unsafe Drive path.".into());
    }
    let mut target = root.to_path_buf();
    for part in path.split('/') {
        target.push(part);
        match fs::symlink_metadata(&target) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err("Sync does not follow symbolic links.".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(crate::err(e)),
        }
    }
    Ok(target)
}
fn read_local(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(crate::err(e)),
    };
    let mut bytes = Vec::new();
    file.take(crate::MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(crate::err)?;
    if bytes.len() as u64 > crate::MAX_FILE {
        return Err("Local file exceeds the sync size limit; it was left unchanged.".into());
    }
    Ok(Some(bytes))
}
fn saved_draft(data_dir: &Path, root: &Path, path: &str) -> Result<bool, String> {
    let directory = data_dir.join("drafts");
    #[cfg(desktop)] let root_id = root.to_string_lossy().into_owned();
    #[cfg(target_os = "ios")] let root_id = crate::mobile_storage::identity(data_dir, root)?;
    let draft = crate::draft_path(&directory, &root_id, path);
    match fs::read(draft) {
        Ok(bytes) => Ok(!serde_json::from_slice::<Value>(&bytes)
            .map_err(crate::err)?
            .is_null()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(crate::err(e)),
    }
}
fn bookmark_path(data_dir: &Path, path: &Path) -> Result<PathBuf, String> {
    #[cfg(target_os = "ios")]
    let path = crate::mobile_storage::bookmark_identity(data_dir, path)?;
    let dir = data_dir.join("bookmarks");
    fs::create_dir_all(&dir).map_err(crate::err)?;
    Ok(dir.join(format!(
        "{}.json",
        crate::revision(path.to_string_lossy().as_bytes())
    )))
}
fn record(
    registry: &mut Value,
    account: &str,
    path: &str,
    entry: &Remote,
    hash: &str,
) -> Result<(), String> {
    registry["driveFiles"][account][path] =
        json!({"id":id(&entry.file)?,"remotePath":entry.path,"version":entry.file["version"]});
    registry["driveReceipts"][account][path] = json!(hash);
    Ok(())
}
fn persist(root: &Path, registry: Value) -> Result<(), String> {
    let stars = crate::registry_stars(&registry)?;
    crate::write_registry(root, registry, &stars)
}

pub(super) fn pull(
    app: &tauri::AppHandle,
    drive: &Drive,
    root: &Path,
    account: &str,
    remote: &[Remote],
    protected: &[String],
    report: &mut Report,
) -> Result<HashSet<String>, String> {
    let access = app.state::<Access>();
    let data_dir = app.path().app_data_dir().map_err(crate::err)?;
    pull_local(
        &data_dir,
        &access.writes,
        drive,
        root,
        account,
        remote,
        protected,
        report,
    )
}
fn pull_local(
    data_dir: &Path,
    writes: &std::sync::Mutex<()>,
    drive: &Drive,
    root: &Path,
    account: &str,
    remote: &[Remote],
    protected: &[String],
    report: &mut Report,
) -> Result<HashSet<String>, String> {
    let initial = {
        let _lock = writes.lock().map_err(crate::err)?;
        let mut registry = crate::read_registry(root)?;
        // Migrate receipts from the upload-only version before trusting a missing
        // remote path. Old novaKey values are path hashes, even after Drive renames.
        let receipts = registry["driveReceipts"][account]
            .as_object()
            .cloned()
            .unwrap_or_default();
        for path in receipts.keys() {
            if registry["driveFiles"][account][path]["id"].is_string() {
                continue;
            }
            let key = crate::revision(path.as_bytes());
            let matches = remote
                .iter()
                .filter(|r| r.file["appProperties"]["novaKey"].as_str() == Some(&key))
                .collect::<Vec<_>>();
            if matches.len() > 1 {
                return Err("Duplicate Drive identities found. Sync paused.".into());
            }
            if let Some(entry) = matches.first() {
                registry["driveFiles"][account][path] =
                    json!({"id":id(&entry.file)?,"remotePath":path});
            }
        }
        persist(root, registry.clone())?;
        registry
    };
    let tracked = initial["driveFiles"][account]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let mut blocked = HashSet::new();
    let mut handled = HashSet::new();
    if let Some(receipts) = initial["driveReceipts"][account].as_object() {
        for path in receipts.keys() {
            if !tracked.contains_key(path) && allowed(root, path)? {
                blocked.insert(path.clone());
                report.items.push(Item {path:path.clone(),state:"error".into(),message:"Previously synced Drive file is missing. Local copy retained; restore it in Drive before resuming.".into()});
            }
        }
    }
    // IDs that disappeared from a complete listing are not recreated by upload.
    for (path, identity) in &tracked {
        if identity["deleted"] == true {
            continue;
        }
        if !remote.iter().any(|r| r.file["id"] == identity["id"]) && allowed(root, path)? {
            blocked.insert(path.clone());
            report.items.push(Item { path:path.clone(),state:"error".into(),message:"Removed or moved outside this workspace in Drive. Local copy retained; restore the Drive copy to resume. Nothing was recreated.".into() });
        }
    }
    let mut download_budget = 512_u64 * 1024 * 1024;
    for entry in remote {
        let file_id = id(&entry.file)?;
        let matched = tracked
            .iter()
            .find(|(_, value)| value["id"].as_str() == Some(&file_id));
        if matched.is_some_and(|(_, value)| value["deleted"] == true) {
            continue;
        }
        let path = matched
            .map(|(path, _)| path.clone())
            .unwrap_or_else(|| entry.path.clone());
        if !handled.insert(path.clone()) {
            return Err("Several Drive files map to one local path. Sync paused.".into());
        }
        if blocked.contains(&path)
            || initial["syncDeletedPaths"][&path] == true
            || !allowed(root, &path)?
        {
            continue;
        }
        let result = (|| -> Result<(), String> {
            let local = local_target(root, &path)?;
            let registry = crate::read_registry(root)?;
            // A receipt with a missing file is a local deletion, not a new download.
            if !local.exists()
                && (matched.is_some() || registry["driveReceipts"][account][&path].is_string())
            {
                let _lock = writes.lock().map_err(crate::err)?;
                let mut registry = crate::read_registry(root)?;
                registry["driveFiles"][account][&path] =
                    json!({"id":file_id,"remotePath":entry.path,"deleted":true});
                persist(root, registry)?;
                return Err("Deleted locally. The Drive copy is retained and will not be downloaded again automatically.".into());
            }
            if protected.contains(&path) || saved_draft(data_dir, root, &path)? {
                return Err("Local edits are open or awaiting recovery. Save or discard them before syncing this file.".into());
            }
            let identity = &registry["driveFiles"][account][&path];
            if identity["version"].is_string()
                && identity["version"] == entry.file["version"]
                && identity["remotePath"].as_str() == Some(&path)
                && entry.path == path
                && read_local(&local)?.is_some_and(|bytes| {
                    registry["driveReceipts"][account][&path].as_str()
                        == Some(crate::revision(&bytes).as_str())
                })
            {
                blocked.insert(path.clone());
                report.items.push(Item {
                    path: path.clone(),
                    state: "uploaded".into(),
                    message: "Saved file is up to date in Drive.".into(),
                });
                return Ok(());
            }
            let response = checked(
                drive
                    .client
                    .get(format!("{}/{file_id}", drive.api))
                    .query(&[("alt", "media")])
                    .bearer_auth(&drive.token)
                    .send()
                    .map_err(network)?,
            )?;
            let mut bytes = Vec::new();
            response
                .take(crate::MAX_FILE + 1)
                .read_to_end(&mut bytes)
                .map_err(crate::err)?;
            if bytes.len() as u64 > crate::MAX_FILE || bytes.len() as u64 > download_budget {
                return Err("Drive download exceeds the file or workspace size limit.".into());
            }
            download_budget -= bytes.len() as u64;
            std::str::from_utf8(&bytes).map_err(|_| "Drive note is not UTF-8 text.".to_string())?;
            let remote_hash = crate::revision(&bytes);
            // Recheck selection and disk under the same lock as local saves/renames.
            let _lock = writes.lock().map_err(crate::err)?;
            let mut registry = crate::read_registry(root)?;
            if !crate::sync_policy::read(&registry)?.included(&path) {
                return Err("Sync turned off; no download applied.".into());
            }
            if registry["driveFiles"][account][&path]["deleted"] == true {
                return Err("File was deleted during sync.".into());
            }
            if matched.is_some()
                && registry["driveFiles"][account][&path]["id"].as_str() != Some(&file_id)
            {
                return Err("File moved during sync. Retry.".into());
            }
            if saved_draft(data_dir, root, &path)? {
                return Err("Unsaved edits retained. Save or discard them before syncing.".into());
            }
            let local = local_target(root, &path)?;
            let local_bytes = read_local(&local)?;
            let baseline = registry["driveReceipts"][account][&path]
                .as_str()
                .map(str::to_owned);
            if local_bytes.is_none() && (matched.is_some() || baseline.is_some()) {
                return Err("File was deleted during sync. It was not recreated.".into());
            }
            let decision = local_bytes
                .as_ref()
                .map(|b| action(baseline.as_deref(), &crate::revision(b), &remote_hash))
                .unwrap_or(Action::Download);
            if decision == Action::Conflict {
                return Err("Both copies changed. Sync paused; your local file and Drive version are preserved.".into());
            }
            let previous_remote = matched
                .and_then(|(_, v)| v["remotePath"].as_str())
                .unwrap_or(&path);
            let remote_renamed = entry.path != previous_remote;
            let local_renamed = path != previous_remote;
            if remote_renamed && local_renamed && path != entry.path {
                return Err("Renamed on both devices. Choose a name before resuming sync.".into());
            }
            if remote_renamed && decision == Action::Upload {
                return Err("Drive renamed this file while it was edited locally. Both copies are preserved.".into());
            }
            let destination = if remote_renamed {
                entry.path.as_str()
            } else {
                path.as_str()
            };
            if destination != path {
                // A destination-specific opt-out must not be overridden by a rename.
                if registry["syncPolicy"]["rules"][destination] == false {
                    return Err("The renamed destination is excluded from sync.".into());
                }
                let target = local_target(root, destination)?;
                if target.exists() {
                    return Err(
                        "Remote rename collides with a local file. Neither was overwritten.".into(),
                    );
                }
                fs::create_dir_all(target.parent().ok_or("Invalid destination")?)
                    .map_err(crate::err)?;
                // Preserve the original until all registry writes succeed.
                fs::hard_link(&local, &target).map_err(crate::err)?;
                let old_meta = bookmark_path(data_dir, &local)?;
                let new_meta = bookmark_path(data_dir, &target)?;
                if old_meta.exists() {
                    if let Err(error) =
                        crate::atomic_write(&new_meta, &fs::read(&old_meta).map_err(crate::err)?)
                    {
                        let _ = fs::remove_file(&target);
                        return Err(error);
                    }
                }
                let result = (|| {
                    crate::sync_policy::relocate(&mut registry, &path, Some(destination))?;
                    let stars = crate::registry_stars(&registry)?
                        .iter()
                        .map(|p| {
                            if p == &path {
                                destination.into()
                            } else {
                                p.clone()
                            }
                        })
                        .collect::<Vec<String>>();
                    registry["starred"] = json!(stars);
                    record(
                        &mut registry,
                        account,
                        destination,
                        entry,
                        baseline.as_deref().unwrap_or(&remote_hash),
                    )?;
                    persist(root, registry.clone())
                })();
                if let Err(error) = result {
                    let _ = fs::remove_file(&target);
                    return Err(error);
                }
                fs::remove_file(&local).map_err(crate::err)?;
                let _ = fs::remove_file(old_meta);
                blocked.insert(path.clone());
            }
            if decision == Action::Download {
                let target = local_target(root, destination)?;
                fs::create_dir_all(target.parent().ok_or("Invalid destination")?)
                    .map_err(crate::err)?;
                if local_bytes.is_none() {
                    use std::io::Write;
                    fs::OpenOptions::new()
                        .create_new(true)
                        .write(true)
                        .open(&target)
                        .map_err(crate::err)?
                        .write_all(&bytes)
                        .map_err(crate::err)?;
                } else {
                    crate::atomic_write(&target, &bytes)?;
                }
            }
            // Do not advance the baseline to Drive when a local edit awaits upload.
            let hash = if decision == Action::Upload {
                baseline.as_deref().ok_or("Missing sync baseline")?
            } else {
                &remote_hash
            };
            if !local_renamed || remote_renamed {
                record(&mut registry, account, destination, entry, hash)?;
                persist(root, registry)?;
            }
            if decision != Action::Upload && (!local_renamed || remote_renamed) {
                blocked.insert(destination.into());
                if decision == Action::Agreed && !remote_renamed {
                    report.items.push(Item {
                        path: destination.into(),
                        state: "uploaded".into(),
                        message: "Saved file is up to date in Drive.".into(),
                    });
                }
            }
            if decision == Action::Download || remote_renamed {
                report.changes.push(Change {
                    path: destination.into(),
                    previous_path: path.clone(),
                });
                report.items.push(Item {
                    path: destination.into(),
                    state: "uploaded".into(),
                    message: "Downloaded changes from Google Drive.".into(),
                });
            }
            Ok(())
        })();
        if let Err(error) = result {
            blocked.insert(path.clone());
            blocked.insert(entry.path.clone());
            report.items.push(Item {
                path,
                state: "error".into(),
                message: error,
            });
        }
    }
    Ok(blocked)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn three_way_content_comparison_preserves_both_edits() {
        assert_eq!(action(Some("old"), "old", "new"), Action::Download);
        assert_eq!(action(Some("old"), "new", "old"), Action::Upload);
        assert_eq!(action(Some("old"), "local", "remote"), Action::Conflict);
        assert_eq!(action(None, "local", "remote"), Action::Conflict);
        assert_eq!(action(None, "same", "same"), Action::Agreed);
    }
    #[cfg(unix)]
    #[test]
    fn symlinked_directories_are_never_download_targets() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("linked")).unwrap();
        assert!(local_target(root.path(), "linked/private.txt").is_err());
    }
    #[test]
    fn remote_paths_cannot_escape_or_overwrite_registry() {
        let dir = tempfile::tempdir().unwrap();
        for path in ["../outside", "/absolute", ".nova", "a/.nova", "a//b"] {
            assert!(local_target(dir.path(), path).is_err());
        }
        assert!(local_target(dir.path(), "notes/a.txt").is_ok());
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        net::TcpListener,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc, Mutex,
        },
        thread,
    };
    pub(super) struct Server {
        pub url: String,
        pub requests: Arc<Mutex<Vec<String>>>,
        stop: Arc<AtomicBool>,
        thread: Option<thread::JoinHandle<()>>,
    }
    impl Server {
        pub fn new(body: &'static str) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let stop = Arc::new(AtomicBool::new(false));
            let stopped = stop.clone();
            let requests = Arc::new(Mutex::new(Vec::new()));
            let captured = requests.clone();
            let thread = thread::spawn(move || {
                while !stopped.load(Ordering::Relaxed) {
                    let Ok((mut stream, _)) = listener.accept() else {
                        thread::sleep(Duration::from_millis(5));
                        continue;
                    };
                    stream.set_nonblocking(false).unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(10)))
                        .unwrap();
                    let mut reader = BufReader::new(stream.try_clone().unwrap());
                    let mut request = String::new();
                    let mut length = 0;
                    loop {
                        let mut line = String::new();
                        reader.read_line(&mut line).unwrap();
                        if line == "\r\n" || line.is_empty() {
                            break;
                        }
                        if let Some(value) = line.to_lowercase().strip_prefix("content-length:") {
                            length = value.trim().parse().unwrap();
                        }
                        request.push_str(&line);
                    }
                    let mut payload = vec![0; length];
                    reader.read_exact(&mut payload).unwrap();
                    request.push_str(&String::from_utf8_lossy(&payload));
                    let response = if request.starts_with("GET /v3?") && request.contains("novaKey") {
                        r#"{"files":[]}"#
                    } else if request.starts_with("POST /v3") {
                        r#"{"id":"created-id"}"#
                    } else if request.starts_with("GET /v2/") {
                        r#"{"etag":"\"guard\"","title":"old.txt","parents":[{"id":"parent"}]}"#
                    } else if request.starts_with("PUT /upload/") {
                        r#"{"id":"stable-id"}"#
                    } else {
                        body
                    };
                    captured.lock().unwrap().push(request);
                    write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",response.len(),response).unwrap();
                }
            });
            Self {
                url,
                requests,
                stop,
                thread: Some(thread),
            }
        }
        fn drive(&self) -> Drive {
            Drive {
                client: Client::new(),
                token: "fixture".into(),
                api: format!("{}/v3", self.url),
                v2: format!("{}/v2", self.url),
                upload_v2: format!("{}/upload", self.url),
                upload_v3: format!("{}/create", self.url),
            }
        }
    }
    impl Drop for Server {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Relaxed);
            let _ = self.thread.take().unwrap().join();
        }
    }
    struct Fixture {
        root: tempfile::TempDir,
        data: tempfile::TempDir,
        writes: Mutex<()>,
        server: Server,
    }
    impl Fixture {
        fn new(local: &str, remote: &'static str) -> Self {
            let fixture = Self {
                root: tempfile::tempdir().unwrap(),
                data: tempfile::tempdir().unwrap(),
                writes: Mutex::new(()),
                server: Server::new(remote),
            };
            fs::write(fixture.root.path().join("old.txt"), local).unwrap();
            persist(fixture.root.path(),json!({"syncPolicy":{"version":1,"rules":{"old.txt":true}},"driveFiles":{"account":{"old.txt":{"id":"stable-id","remotePath":"old.txt"}}},"driveReceipts":{"account":{"old.txt":crate::revision(b"baseline")}}})).unwrap();
            fixture
        }
        fn run(&self, path: Option<&str>, protected: &[String]) -> Report {
            let files=path.map(|path|vec![Remote {path:path.into(),file:json!({"id":"stable-id","name":path,"parents":["parent"],"appProperties":{"novaKey":crate::revision(b"old.txt")},"version":"2"})}]).unwrap_or_default();
            let mut report = Report {
                root: self.root.path().to_string_lossy().into(),
                folder_url: String::new(),
                items: vec![],
                changes: vec![],
            };
            pull_local(
                self.data.path(),
                &self.writes,
                &self.server.drive(),
                self.root.path(),
                "account",
                &files,
                protected,
                &mut report,
            )
            .unwrap();
            report
        }
        fn registry(&self) -> Value {
            crate::read_registry(self.root.path()).unwrap()
        }
    }
    #[test]
    fn remote_edit_downloads_and_conflicting_local_edit_is_preserved() {
        let f = Fixture::new("baseline", "other PC edit");
        let report = f.run(Some("old.txt"), &[]);
        assert_eq!(
            fs::read_to_string(f.root.path().join("old.txt")).unwrap(),
            "other PC edit"
        );
        assert_eq!(report.changes.len(), 1);
        assert_eq!(
            f.registry()["driveReceipts"]["account"]["old.txt"],
            crate::revision(b"other PC edit")
        );
        let f = Fixture::new("local edit", "other PC edit");
        let report = f.run(Some("old.txt"), &[]);
        assert!(report.items[0].message.contains("Both copies changed"));
        assert_eq!(
            fs::read_to_string(f.root.path().join("old.txt")).unwrap(),
            "local edit"
        );
    }
    #[test]
    fn remote_rename_preserves_identity_and_does_not_clobber_an_existing_file() {
        let f = Fixture::new("baseline", "baseline");
        let report = f.run(Some("new.txt"), &[]);
        assert!(
            !f.root.path().join("old.txt").exists(),
            "{:?}",
            report.items.iter().map(|i| &i.message).collect::<Vec<_>>()
        );
        assert_eq!(
            fs::read_to_string(f.root.path().join("new.txt")).unwrap(),
            "baseline"
        );
        assert_eq!(report.changes[0].previous_path, "old.txt");
        assert_eq!(
            f.registry()["driveFiles"]["account"]["new.txt"]["id"],
            "stable-id"
        );
        let f = Fixture::new("baseline", "baseline");
        fs::write(f.root.path().join("new.txt"), "keep me").unwrap();
        assert!(f.run(Some("new.txt"), &[]).items[0]
            .message
            .contains("collides"));
        assert!(f.root.path().join("old.txt").exists());
        assert_eq!(
            fs::read_to_string(f.root.path().join("new.txt")).unwrap(),
            "keep me"
        );
    }
    #[test]
    fn deletions_never_resurrect_or_remove_the_other_copy() {
        let f = Fixture::new("baseline", "baseline");
        fs::remove_file(f.root.path().join("old.txt")).unwrap();
        f.run(Some("old.txt"), &[]);
        f.run(Some("old.txt"), &[]);
        assert!(!f.root.path().join("old.txt").exists());
        assert_eq!(
            f.registry()["driveFiles"]["account"]["old.txt"]["deleted"],
            true
        );
        let f = Fixture::new("baseline", "baseline");
        assert!(f.run(None, &[]).items[0].message.contains("Removed"));
        assert!(f.root.path().join("old.txt").exists());
    }
    #[test]
    fn replacement_at_same_path_cannot_take_over_a_missing_id() {
        let f = Fixture::new("baseline", "replacement");
        let files = vec![Remote {
            path: "old.txt".into(),
            file: json!({"id":"different-id","name":"old.txt","appProperties":{"novaKey":"other"}}),
        }];
        let mut report = Report {
            root: String::new(),
            folder_url: String::new(),
            items: vec![],
            changes: vec![],
        };
        pull_local(
            f.data.path(),
            &f.writes,
            &f.server.drive(),
            f.root.path(),
            "account",
            &files,
            &[],
            &mut report,
        )
        .unwrap();
        assert!(report.changes.is_empty());
        assert_eq!(
            fs::read_to_string(f.root.path().join("old.txt")).unwrap(),
            "baseline"
        );
    }
    #[test]
    fn excluded_files_and_unsaved_drafts_are_never_downloaded() {
        let f = Fixture::new("baseline", "other PC edit");
        let mut registry = f.registry();
        registry["syncPolicy"]["rules"]["old.txt"] = json!(false);
        persist(f.root.path(), registry).unwrap();
        assert!(f.run(Some("old.txt"), &[]).changes.is_empty());
        assert!(f.server.requests.lock().unwrap().is_empty());
        let f = Fixture::new("baseline", "other PC edit");
        assert!(f
            .run(Some("old.txt"), &["old.txt".into()])
            .changes
            .is_empty());
        let directory = f.data.path().join("drafts");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            crate::draft_path(&directory, &f.root.path().to_string_lossy(), "old.txt"),
            r#"{"text":"unsaved"}"#,
        )
        .unwrap();
        assert!(f.run(Some("old.txt"), &[]).changes.is_empty());
        assert_eq!(
            fs::read_to_string(f.root.path().join("old.txt")).unwrap(),
            "baseline"
        );
    }
    #[test]
    fn renamed_subfolder_is_reused_but_same_named_workspaces_stay_distinct() {
        let server=Server::new(r#"{"files":[{"id":"existing-folder","name":"Renamed","mimeType":"application/vnd.google-apps.folder","appProperties":{"novaKey":"old-key"}}]}"#);
        let drive=server.drive();
        assert_eq!(drive.folder_impl("workspace","new-key","Renamed",true).unwrap(),"existing-folder");
        assert_eq!(drive.folder("base","different-workspace-key","Renamed").unwrap(),"created-id");
    }
    #[test]
    fn local_rename_updates_same_id_with_conditional_put_never_post() {
        let server = Server::new("baseline");
        let drive = server.drive();
        let linked = json!({"id":"stable-id","name":"old.txt","parents":["parent"],"appProperties":{"novaKey":"original-key"}});
        let id = drive
            .upload_file(
                "parent",
                "original-key",
                "new.txt",
                b"baseline",
                Some(&crate::revision(b"baseline")),
                Some(&linked),
            )
            .unwrap();
        assert_eq!(id, "stable-id");
        let requests = server.requests.lock().unwrap();
        assert_eq!(requests.len(), 3);
        assert!(requests[2].starts_with("PUT /upload/stable-id"));
        assert!(requests[2].to_lowercase().contains("if-match: \"guard\""));
        assert!(requests[2].contains("\"title\":\"new.txt\""));
        assert!(!requests.iter().any(|r| r.starts_with("POST")));
    }
}
