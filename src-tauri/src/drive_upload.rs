#[cfg(any(target_os = "ios", test))]
#[path = "cloud_reset.rs"]
pub mod cloud_reset;
#[path = "cloud_spaces.rs"]
pub mod cloud_spaces;
// Uploads selected saved notes. Remote edits are never silently overwritten.
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, io::Read, path::{Path, PathBuf}, time::Duration};
use tauri::{Emitter, Manager, State};
use crate::drive_registry as identities;
use crate::{Access, drive_auth::{self, DriveAuth}};
#[path = "drive_reconcile.rs"]
mod reconcile;
const API: &str = "https://www.googleapis.com/drive/v3/files";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item { pub path: String, pub state: String, pub message: String }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report { root: String, folder_url: String, items: Vec<Item>, changes: Vec<Change>, uploaded: bool }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change { path: String, previous_path: String }
fn checked(response: Response) -> Result<Response, String> {
    if response.status().is_success() { return Ok(response); }
    Err(match response.status().as_u16() {
        401 => "Google access expired. Reconnect Google Drive.".into(),
        403 => "Google Drive refused the upload. Check storage space and account permissions, then retry.".into(),
        404 => "The Drive file or folder was removed. Restore it in Drive before resuming sync.".into(),
        412 => "The Drive copy changed during upload. Neither copy was overwritten. Review the Drive file.".into(),
        429 => "Google Drive is rate limiting uploads. Wait a moment and retry.".into(),
        code => format!("Google Drive returned error {code}. Retry when your connection is available."),
    })
}
fn network(_: reqwest::Error) -> String { "Could not reach Google Drive. Check your connection and retry.".into() }
struct Drive { client: Client, token: String, api: String, v2: String, upload_v2: String, upload_v3: String }
impl Drive {
    fn new() -> Result<Self, String> { Ok(Self { api: API.into(), v2: "https://www.googleapis.com/drive/v2/files".into(), upload_v2: "https://www.googleapis.com/upload/drive/v2/files".into(), upload_v3: "https://www.googleapis.com/upload/drive/v3/files".into(), token: drive_auth::access_token()?, client: Client::builder().timeout(Duration::from_secs(60)).build().map_err(network)? }) }
    fn generate_id(&self) -> Result<String, String> {
        let value: Value = checked(self.client.get(format!("{}/generateIds", self.api))
            .bearer_auth(&self.token).query(&[("count","1"),("space","drive"),("type","files")])
            .send().map_err(network)?)?.json().map_err(network)?;
        id(&json!({"id":value["ids"][0]}))
    }
    fn find(&self, parent: &str, key: &str) -> Result<Option<Value>, String> {
        let query = format!("trashed = false and '{parent}' in parents and appProperties has {{ key='novaKey' and value='{key}' }}");
        let value: Value = checked(self.client.get(&self.api).bearer_auth(&self.token).query(&[("q",query.as_str()),("fields","files(id,name,parents,mimeType,appProperties)"),("pageSize","2")]).send().map_err(network)?)?.json().map_err(network)?;
        let files = value["files"].as_array().ok_or("Invalid Drive file listing.")?;
        if files.len() > 1 { return Err("Duplicate Nova files found in Drive. Review them before retrying.".into()); }
        Ok(files.first().cloned())
    }
    fn folder(&self, parent: &str, key: &str, name: &str) -> Result<String, String> {
        if let Some(file) = self.find(parent,key)? {
            if file["mimeType"] != "application/vnd.google-apps.folder" { return Err("Nova’s Drive folder was replaced with a file.".into()); }
            return id(&file);
        }
        let value: Value = checked(self.client.post(&self.api).bearer_auth(&self.token).json(&json!({"name":name,"mimeType":"application/vnd.google-apps.folder","parents":[parent],"appProperties":{"novaKey":key}})).send().map_err(network)?)?.json().map_err(network)?;
        id(&value)
    }
    fn children(&self, parent: &str) -> Result<Vec<Value>,String> {
        let mut result = Vec::new(); let mut page = String::new();
        loop {
            let query = format!("trashed = false and '{parent}' in parents");
            let value: Value = checked(self.client.get(&self.api).bearer_auth(&self.token).query(&[("q",query.as_str()),("fields","nextPageToken,files(id,name,parents,mimeType,appProperties,size,version,modifiedTime)"),("pageSize","1000"),("pageToken",page.as_str())]).send().map_err(network)?)?.json().map_err(network)?;
            result.extend(value["files"].as_array().ok_or("Invalid Drive listing.")?.iter().cloned());
            if result.len() > 50000 { return Err("This Drive folder is too large to restore.".into()); }
            match value["nextPageToken"].as_str() { Some(next) => page = next.into(), None => break }
        }
        Ok(result)
    }
    #[cfg(test)]
    fn upload(&self, parent: &str, key: &str, name: &str, bytes: &[u8], baseline: Option<&str>) -> Result<(), String> {
        self.upload_file(parent, key, name, bytes, baseline, None, None).map(|_| ())
    }
    fn upload_file(&self, parent: &str, key: &str, name: &str, bytes: &[u8], baseline: Option<&str>, linked: Option<&Value>, reserved: Option<&str>) -> Result<String, String> {
        let hash = crate::revision(bytes);
        let existing = if let Some(linked) = linked { Some(linked.clone()) } else if reserved.is_some() { None } else { self.find(parent,key)? };
        let mut etag = None;
        let mut file_id = None;
        if let Some(file) = &existing {
            let found = id(file)?;
            // Capture the metadata revision before reading content. Any later
            // remote edit must fail the conditional update.
            // Drive v2 exposes the file ETag; v3 omits it. Use v2 for
            // conditional updates while keeping v3 discovery and creation.
            let metadata: Value = checked(self.client.get(format!("{}/{found}",self.v2)).query(&[("fields","etag,title,parents(id)")]).bearer_auth(&self.token).send().map_err(network)?)?.json().map_err(network)?;
            etag = metadata["etag"].as_str().map(str::to_owned);
            let old_parents=file["parents"].as_array().ok_or("Drive file has no parent.")?.iter().filter_map(Value::as_str).collect::<Vec<_>>();
            let new_parents=metadata["parents"].as_array().ok_or("Drive file has no parent.")?.iter().filter_map(|p|p["id"].as_str()).collect::<Vec<_>>();
            if metadata["title"] != file["name"] || old_parents != new_parents {
                return Err("Drive file was renamed or moved during sync. Retry to read its latest location.".into());
            }
            let response = checked(self.client.get(format!("{}/{found}",self.api)).query(&[("alt","media")]).bearer_auth(&self.token).send().map_err(network)?)?;
            let mut remote = Vec::new();
            response.take(crate::MAX_FILE + 1).read_to_end(&mut remote).map_err(crate::err)?;
            if remote.len() as u64 > crate::MAX_FILE { return Err("Drive copy exceeds Nova’s size limit. It was left unchanged.".into()); }
            let remote_hash = crate::revision(&remote);
            let same_location = file["name"].as_str() == Some(name) && file["parents"].as_array().is_some_and(|parents| parents.iter().any(|p| p.as_str() == Some(parent)));
            if remote_hash == hash && same_location { return Ok(found); }
            if remote_hash != hash && baseline != Some(remote_hash.as_str()) {
                return Err("Drive has a different version than this laptop last synced. Sync again to check for incoming changes; conflicting edits are preserved.".into());
            }
            if etag.is_none() { return Err("Drive did not return a revision guard. The existing copy was left unchanged.".into()); }
            file_id = Some(found);
        }
        let mut metadata = json!({"name":name,"appProperties":{"novaKey":key,"novaRevision":hash}});
        if file_id.is_none() { metadata["parents"] = json!([parent]); if let Some(reserved) = reserved { metadata["id"] = json!(reserved); } }
        else { metadata = json!({"title":name,"properties":[{"key":"novaKey","value":key,"visibility":"PRIVATE"},{"key":"novaRevision","value":hash,"visibility":"PRIVATE"}]}); }
        let boundary = format!("nova_{}", rand::random::<u128>());
        let mut body = format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n").into_bytes();
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let url = &self.upload_v3;
        let mut request = if let Some(file_id) = file_id { self.client.put(format!("{}/{file_id}",self.upload_v2)) } else { self.client.post(url) };
        if let Some(etag) = etag { request = request.header("If-Match",etag); }
        if let Some(file) = &existing {
            let parents = file["parents"].as_array().ok_or("Drive file has no parent.")?.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(",");
            if parents != parent { request = request.query(&[("addParents",parent),("removeParents",parents.as_str())]); }
        }
        let result: Value = checked(request.query(&[("uploadType","multipart"),("fields","id")]).bearer_auth(&self.token).header("Content-Type",format!("multipart/related; boundary={boundary}")).body(body).send().map_err(network)?)?.json().map_err(network)?;
        id(&result)
    }
}
fn id(file: &Value) -> Result<String, String> {
    let id = file["id"].as_str().ok_or("Google Drive did not return a file ID.")?;
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') { return Err("Google Drive returned an invalid file ID.".into()); }
    Ok(id.into())
}
fn base_folder(drive: &Drive) -> Result<String,String> {
    if let Some(file) = drive.find("root", "nova-notes-v1")? {
        if file["mimeType"] != "application/vnd.google-apps.folder" {
            return Err("Nova’s Drive folder was replaced with a file.".into());
        }
        let base = id(&file)?;
        // Migrate legacy names once; ordinary polls are read-only.
        if file["name"] != ".nova" {
            checked(drive.client.patch(format!("{}/{base}", drive.api)).bearer_auth(&drive.token).json(&json!({"name":".nova"})).send().map_err(network)?)?;
        }
        return Ok(base);
    }
    drive.folder("root", "nova-notes-v1", ".nova")
}
fn workspace_folder(drive: &Drive, root: &Path) -> Result<String, String> {
    let base = base_folder(drive)?;
    let registry = crate::read_registry(root)?;
    let account = drive_auth::account_key()?;
    if registry["driveWorkspace"]["account"].as_str() == Some(account.as_str()) {
        let linked = id(&registry["driveWorkspace"])?;
        let candidates = drive.children(&base)?;
        if candidates.iter().any(|v|v["id"].as_str()==Some(linked.as_str())) { return Ok(linked); }
        return Err("The linked workspace was removed from Drive. Restore or reconnect it before uploading.".into());
    }
    #[cfg(desktop)]
    let key = crate::revision(root.to_string_lossy().as_bytes());
    #[cfg(target_os = "ios")]
    let key = {
        let mut registry = registry;
        let key = registry["mobileDriveKey"].as_str().map(str::to_owned).unwrap_or_else(|| {
            use rand::RngCore;
            let mut bytes = [0u8;32]; rand::rngs::OsRng.fill_bytes(&mut bytes); crate::revision(&bytes)
        });
        registry["mobileDriveKey"] = json!(key);
        let stars = crate::registry_stars(&registry)?; crate::write_registry(root, registry, &stars)?;
        key
    };
    drive.folder(&base, &key, root.file_name().and_then(|s|s.to_str()).unwrap_or("Notes"))
}
fn allowed(root: &Path, path: &str) -> Result<bool, String> {
    let registry=crate::read_registry(root)?;
    Ok(registry["cloudSpace"].is_object() || crate::sync_policy::read(&registry)?.included(path))
}
fn upload_workspace(app: tauri::AppHandle, root: PathBuf, protected_paths: Vec<String>, only_path: Option<String>) -> Result<Report, String> {
    let drive = Drive::new()?;
    // Validate policy before creating anything remotely.
    crate::sync_policy::read(&crate::read_registry(&root)?)?;
    let account = drive_auth::account_key()?;
    if let Some(path) = only_path.as_deref() {
        let data_dir = app.path().app_data_dir().map_err(crate::err)?;
        if reconcile::focused_unchanged(&drive, &root, &account, path, &data_dir, &protected_paths)? {
            #[cfg(desktop)]
            let root_id = root.to_string_lossy().into_owned();
            #[cfg(target_os = "ios")]
            let root_id = crate::mobile_storage::identity(&data_dir, &root)?;
            return Ok(Report { root: root_id, folder_url: String::new(),
                items: vec![Item {path:path.into(),state:"uploaded".into(),message:"Saved file is up to date in Drive.".into()}],
                changes: vec![], uploaded: false });
        }
    }
    let folder = workspace_folder(&drive, &root)?;
    #[cfg(desktop)]
    let root_id = root.to_string_lossy().into_owned();
    #[cfg(target_os = "ios")]
    let root_id = crate::mobile_storage::identity(&app.path().app_data_dir().map_err(crate::err)?, &root)?;
    let mut report = Report { root: root_id, folder_url: format!("https://drive.google.com/drive/folders/{folder}"), items: Vec::new(), changes: Vec::new(), uploaded: false };
    let (remote, remote_folders) = reconcile::remote_tree_with_folders(&drive, &folder)?;
    if only_path.is_none() && reconcile::workspace_unchanged(
        &root, &account, &remote, &app.path().app_data_dir().map_err(crate::err)?, &protected_paths,
    )? {
        let registry = crate::read_registry(&root)?;
        let policy = crate::sync_policy::read(&registry)?;
        report.items = remote.iter().filter(|entry| (registry["cloudSpace"].is_object() || policy.included(&entry.path))
            && registry["driveObjects"][&account][id(&entry.file).unwrap_or_default()]["deleted"] != true).map(|entry| Item {path:entry.path.clone(),
            state:"uploaded".into(),message:"Saved file is up to date in Drive.".into()}).collect();
        return Ok(report);
    }
    {
        let access=app.state::<Access>();let _lock=access.writes.lock().map_err(crate::err)?;
        let mut registry=crate::read_registry(&root)?;
        registry["driveWorkspace"]=json!({"id":folder,"account":account});
        for entry in &remote_folders {
            let remote_id = id(&entry.file)?;
            registry["driveFolders"][&account][&remote_id] = json!({"id":remote_id,"localPath":entry.path});
        }
        let stars=crate::registry_stars(&registry)?;crate::write_registry(&root,registry,&stars)?;
    }
    let blocked = reconcile::pull(&app, &drive, &root, &account, &remote, &protected_paths, &mut report, only_path.as_deref())?;
    let mut known_folders = remote_folders.iter().map(|e| id(&e.file)).collect::<Result<std::collections::HashSet<_>,_>>()?;
    for file in crate::files_in(&root)? {
        if only_path.as_deref().is_some_and(|selected| selected != file.path) { continue; }
        if blocked.contains(&file.path) || protected_paths.contains(&file.path) { continue; }
        if !allowed(&root, &file.path)? { continue; }
        let emit = |state: &str, message: &str| { let _ = app.emit("drive-upload-progress", json!({"root":report.root,"path":file.path,"state":state,"message":message})); };
        emit("uploading", "Uploading saved file…");
        let result = (|| {
            let local = crate::scoped_path(&root,&file.path)?;
            if fs::metadata(&local).map_err(crate::err)?.len() > crate::MAX_FILE { return Err("File exceeds Nova’s 32 MB limit.".into()); }
            let mut bytes = Vec::new();
            fs::File::open(&local).map_err(crate::err)?.take(crate::MAX_FILE+1).read_to_end(&mut bytes).map_err(crate::err)?;
            if bytes.len() as u64 > crate::MAX_FILE { return Err("File exceeds Nova’s 32 MB limit.".into()); }
            std::str::from_utf8(&bytes).map_err(|_| "Only UTF-8 notes can be uploaded.".to_string())?;
            let mut parent = folder.clone();
            let parts: Vec<_> = file.path.split('/').collect();
            for (index, part) in parts[..parts.len()-1].iter().enumerate() {
                let path = parts[..=index].join("/");
                let access = app.state::<Access>();
                let _lock = access.writes.lock().map_err(crate::err)?;
                let mut registry = crate::read_registry(&root)?;
                let tracked = registry["driveFolders"][&account].as_object().into_iter().flat_map(|m|m.values())
                    .filter(|v|v["localPath"].as_str() == Some(&path))
                    .min_by_key(|v| !v["id"].as_str().is_some_and(|id|known_folders.contains(id))).cloned();
                let folder_id = match tracked {
                    Some(ref value) => id(value)?,
                    None => drive.generate_id()?,
                };
                let exists = known_folders.contains(&folder_id);
                if !exists {
                    if tracked.as_ref().is_some_and(|v|v["pending"] != true) {
                        return Err("The destination Drive folder was removed. Restore it before syncing.".into());
                    }
                    registry["driveFolders"][&account][&folder_id] = json!({"id":folder_id,"localPath":path,"pending":true});
                    let stars = crate::registry_stars(&registry)?;
                    crate::write_registry(&root, registry.clone(), &stars)?;
                    let value: Value = checked(drive.client.post(&drive.api).bearer_auth(&drive.token)
                        .json(&json!({"id":folder_id,"name":part,"mimeType":"application/vnd.google-apps.folder","parents":[parent],"appProperties":{"novaKey":folder_id}}))
                        .send().map_err(network)?)?.json().map_err(network)?;
                    if id(&value)? != folder_id { return Err("Drive folder identity changed.".into()); }
                    known_folders.insert(folder_id.clone());
                    // Keep the reservation until the next listing confirms it; retries use the same ID.
                }
                parent = folder_id;
            }
            if !allowed(&root,&file.path)? { return Err("Selection changed. File was not uploaded.".into()); }
            // Reserve a real Drive ID before creation. Retries never rediscover by name.
            let tracked = {
                let access = app.state::<Access>();
                let _lock = access.writes.lock().map_err(crate::err)?;
                let mut registry = crate::read_registry(&root)?;
                let mut tracked = identities::at_path(&registry, &account, &file.path).clone();
                if tracked.is_null() {
                    let reserved = drive.generate_id()?;
                    tracked = json!({"id":reserved,"localPath":file.path,"remotePath":file.path,"pending":true});
                    registry["driveObjects"][&account][&reserved] = tracked.clone();
                    let stars = crate::registry_stars(&registry)?;
                    crate::write_registry(&root,registry,&stars)?;
                }
                tracked
            };
            let remote_id = id(&tracked)?;
            let linked = remote.iter().find(|entry| entry.file["id"] == tracked["id"]).map(|entry|entry.file.clone());
            if linked.is_none() && tracked["pending"] != true {
                return Err("Drive copy was removed. Local content is retained; restore the same Drive file to resume sync.".into());
            }
            let uploaded_id = drive.upload_file(&parent,&remote_id,parts.last().unwrap(),&bytes,tracked["receipt"].as_str(),linked.as_ref(),Some(&remote_id))?;
            if uploaded_id != remote_id { return Err("Drive returned a different file identity. Sync paused.".into()); }
            {
                let access = app.state::<Access>();
                let _lock = access.writes.lock().map_err(crate::err)?;
                let mut registry = crate::read_registry(&root)?;
                // A concurrent rename/delete must not recreate a stale registry path.
                if !local.exists() { return Err("File moved or was deleted during sync. Retry sync.".into()); }
                if identities::at_path(&registry, &account, &file.path)["id"] != remote_id {
                    return Err("File identity changed during upload. Local changes are preserved.".into());
                }
                identities::record(&mut registry, &account, &remote_id, &file.path, &file.path, &crate::revision(&bytes), &Value::Null);
                registry["driveWorkspace"] = json!({"id":folder,"account":account});
                let stars = crate::registry_stars(&registry)?;
                crate::write_registry(&root,registry,&stars)?;
            }
            if crate::revision(&fs::read(local).map_err(crate::err)?) != crate::revision(&bytes) {
                return Err("File changed during upload. Save and upload again to send the latest version.".into());
            }
            Ok(())
        })();
        if result.is_ok() { report.uploaded = true; }
        let (state,message) = match result { Ok(()) => ("uploaded","Uploaded changes to Google Drive.".to_string()), Err(error) => ("error",error) };
        emit(state,&message);
        report.items.push(Item { path:file.path,state:state.into(),message });
    }
    Ok(report)
}
#[tauri::command]
pub async fn drive_upload(root: String, protected_paths: Option<Vec<String>>, only_path: Option<String>, app: tauri::AppHandle, access: State<'_,Access>, auth: State<'_,DriveAuth>) -> Result<Report,String> {
    let root = crate::root_path(&access,&root)?;
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || { let _guard = guard; upload_workspace(app,root,protected_paths.unwrap_or_default(),only_path) }).await.map_err(crate::err)?
}
#[tauri::command]
pub async fn drive_open_folder(app: tauri::AppHandle, root: String, access: State<'_,Access>, auth: State<'_,DriveAuth>) -> Result<(),String> {
    let root = crate::root_path(&access,&root)?;
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let folder = workspace_folder(&Drive::new()?,&root)?;
        let url = format!("https://drive.google.com/drive/folders/{folder}");
        #[cfg(desktop)] { let _ = app; webbrowser::open(&url).map_err(|_| "Could not open the browser.".to_string()) }
        #[cfg(target_os = "ios")] { app.state::<tauri_plugin_nova_auth::Auth<tauri::Wry>>().call("openDrive", json!({"url":url})).map(|_| ()) }
    }).await.map_err(crate::err)?
}

fn file_url(registry: &Value, account: &str, path: &str) -> Result<String, String> {
    let tracked = identities::at_path(registry, account, path);
    if tracked.is_null() || tracked["pending"] == true {
        return Err("This note hasn’t uploaded to Google Drive yet. Wait for sync to finish, then try again.".into());
    }
    let file_id = id(tracked)?;
    Ok(format!("https://drive.google.com/file/d/{file_id}/view"))
}

#[tauri::command]
pub async fn drive_open_file(app: tauri::AppHandle, root: String, path: String, access: State<'_,Access>, auth: State<'_,DriveAuth>) -> Result<(),String> {
    let root = crate::root_path(&access,&root)?;
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let account = drive_auth::account_key()?;
        let url = file_url(&crate::read_registry(&root)?, &account, &path)?;
        #[cfg(desktop)] { let _ = app; webbrowser::open(&url).map_err(|_| "Could not open the browser.".to_string()) }
        #[cfg(target_os = "ios")] { app.state::<tauri_plugin_nova_auth::Auth<tauri::Wry>>().call("openDrive", json!({"url":url})).map(|_| ()) }
    }).await.map_err(crate::err)?
}

#[derive(Serialize)]
pub struct CloudWorkspace { id: String, name: String }
#[tauri::command]
pub async fn drive_workspaces(auth: State<'_,DriveAuth>) -> Result<Vec<CloudWorkspace>,String> {
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard; let drive = Drive::new()?;
        let base = base_folder(&drive)?;
        drive.children(&base)?.iter().filter(|v|v["mimeType"]=="application/vnd.google-apps.folder" && v["appProperties"]["novaKey"].is_string())
            .map(|v|Ok(CloudWorkspace {id:id(v)?,name:v["name"].as_str().unwrap_or("Notes").into()})).collect()
    }).await.map_err(crate::err)?
}
fn safe_name(name: &str) -> bool {
    #[cfg(target_os = "windows")]
    if !windows_name(name) { return false; }
    !name.is_empty() && name != "." && name != ".." && name != ".nova" && !name.contains(['/', '\\', ':']) && !name.chars().any(char::is_control)
}
// Drive permits names that Win32 aliases or cannot materialize as ordinary files.
// Reject them before opening anything, including device names with extensions.
#[cfg(any(target_os = "windows", test))]
fn windows_name(name: &str) -> bool {
    if name.contains(['<', '>', '"', '|', '?', '*']) || name.ends_with(['.', ' ']) {
        return false;
    }
    let stem = name.split('.').next().unwrap_or("").trim_end_matches(' ').to_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$") {
        return false;
    }
    for prefix in ["COM", "LPT"] {
        if let Some(number) = stem.strip_prefix(prefix) {
            if matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³") {
                return false;
            }
        }
    }
    true
}
fn restore_tree(drive: &Drive, remote: &str, destination: &Path, prefix: &str, rules: &mut serde_json::Map<String,Value>, budget: &mut u64, depth: usize) -> Result<(),String> {
    if depth > 32 { return Err("Drive folders are nested too deeply.".into()); }
    for file in drive.children(remote)? {
        if !file["appProperties"]["novaKey"].is_string() { continue; }
        let name = file["name"].as_str().ok_or("Drive file has no name.")?;
        if !safe_name(name) { return Err("A Drive file has an unsafe local name. Rename it in Drive before restoring.".into()); }
        let target = destination.join(name);
        let relative = if prefix.is_empty() {name.to_string()} else {format!("{prefix}/{name}")};
        if file["mimeType"]=="application/vnd.google-apps.folder" {
            fs::create_dir(&target).map_err(crate::err)?;
            restore_tree(drive,&id(&file)?,&target,&relative,rules,budget,depth+1)?;
        } else {
            if file["mimeType"].as_str().unwrap_or("").starts_with("application/vnd.google-apps.") { return Err("Google Docs cannot be restored as plain notes.".into()); }
            let response = checked(drive.client.get(format!("{API}/{}",id(&file)?)).query(&[("alt","media")]).bearer_auth(&drive.token).send().map_err(network)?)?;
            let mut bytes = Vec::new(); response.take(crate::MAX_FILE+1).read_to_end(&mut bytes).map_err(crate::err)?;
            if bytes.len() as u64 > crate::MAX_FILE || bytes.len() as u64 > *budget { return Err("Restore exceeds the file or workspace size limit.".into()); }
            *budget -= bytes.len() as u64;
            std::str::from_utf8(&bytes).map_err(|_|"Drive note is not valid UTF-8 text.".to_string())?;
            use std::io::Write;
            fs::OpenOptions::new().write(true).create_new(true).open(target).map_err(crate::err)?.write_all(&bytes).map_err(crate::err)?;
            rules.insert(relative,Value::Bool(true));
            if rules.len()>50000 { return Err("Too many notes to restore.".into()); }
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn drive_restore(parent: String, workspace_id: String, access: State<'_,Access>, auth: State<'_,DriveAuth>) -> Result<String,String> {
    let parent = crate::root_path(&access,&parent)?;
    #[cfg(target_os = "ios")]
    let parent = {
        let notes = access.mobile_root.lock().map_err(crate::err)?.clone().ok_or("Notes storage is unavailable.")?;
        let _ = parent;
        let parent = notes.parent().ok_or("Missing storage directory.")?.join("Synced");
        fs::create_dir_all(&parent).map_err(crate::err)?; parent
    };
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard; let drive = Drive::new()?;
        let base = base_folder(&drive)?;
        let workspace = drive.children(&base)?.into_iter().find(|v|v["id"].as_str()==Some(workspace_id.as_str()) && v["mimeType"]=="application/vnd.google-apps.folder" && v["appProperties"]["novaKey"].is_string()).ok_or("Choose a Nova workspace from Drive.")?;
        #[cfg(target_os = "ios")]
        {
            let account = drive_auth::account_key()?;
            for entry in fs::read_dir(&parent).map_err(crate::err)? {
                let entry = entry.map_err(crate::err)?;
                if !entry.file_type().map_err(crate::err)?.is_dir() { continue; }
                if let Ok(registry) = crate::read_registry(&entry.path()) {
                    if registry["driveWorkspace"]["id"].as_str() == Some(&workspace_id) && registry["driveWorkspace"]["account"].as_str() == Some(&account) {
                        return crate::mobile_storage::identity(parent.parent().ok_or("Missing storage directory.")?, &entry.path());
                    }
                }
            }
        }
        let name = workspace["name"].as_str().filter(|n|safe_name(n)).unwrap_or("Nova notes");
        // An exclusively created destination guarantees no existing files are overwritten.
        let directory = tempfile::Builder::new().prefix(&format!("{name} - ")).tempdir_in(&parent).map_err(crate::err)?;
        let mut rules = serde_json::Map::new(); let mut budget = 512 * 1024 * 1024;
        restore_tree(&drive,&workspace_id,directory.path(),"",&mut rules,&mut budget,0)?;
        let account = drive_auth::account_key()?;
        let mut receipts = serde_json::Map::new();
        for path in rules.keys() { receipts.insert(path.clone(),json!(crate::revision(&fs::read(directory.path().join(path)).map_err(crate::err)?))); }
        let mut registry = json!({"syncPolicy":{"version":1,"rules":rules},"driveWorkspace":{"id":workspace_id,"account":account},"starred":[]});
        for entry in reconcile::remote_tree(&drive, &workspace_id)? {
            if let Some(hash) = receipts.get(&entry.path).and_then(Value::as_str) {
                identities::record(&mut registry, &account, &id(&entry.file)?, &entry.path, &entry.path, hash, &entry.file);
            }
        }
        fs::write(directory.path().join(".nova"),serde_json::to_vec(&registry).map_err(crate::err)?).map_err(crate::err)?;
        let destination = directory.keep();
        #[cfg(desktop)] { Ok(destination.to_string_lossy().into_owned()) }
        #[cfg(target_os = "ios")] { crate::mobile_storage::identity(parent.parent().ok_or("Missing storage directory.")?, &destination) }
    }).await.map_err(crate::err)?
}

#[cfg(test)]
mod tests {
    #[test]
    fn file_links_follow_identity_and_require_an_uploaded_copy() {
        let mut registry = serde_json::json!({});
        super::identities::record(&mut registry, "account", "file-id", "nested/note.md", "old.md", "hash", &serde_json::Value::Null);
        assert_eq!(super::file_url(&registry, "account", "nested/note.md").unwrap(), "https://drive.google.com/file/d/file-id/view");
        assert!(super::file_url(&registry, "other-account", "nested/note.md").is_err());
        assert!(super::file_url(&registry, "account", "missing.md").is_err());
        registry["driveObjects"]["account"]["file-id"]["pending"] = serde_json::json!(true);
        assert!(super::file_url(&registry, "account", "nested/note.md").unwrap_err().contains("hasn’t uploaded"));
        registry["driveObjects"]["account"]["file-id"]["pending"] = serde_json::json!(false);
        super::identities::relocate(&mut registry, "nested/note.md", Some("renamed.md")).unwrap();
        assert!(super::file_url(&registry, "account", "nested/note.md").is_err());
        assert!(super::file_url(&registry, "account", "renamed.md").unwrap().contains("file-id"));
        super::identities::relocate(&mut registry, "renamed.md", None).unwrap();
        assert!(super::file_url(&registry, "account", "renamed.md").is_err());
    }

    use super::*;
    #[test]
    fn restore_names_stay_inside_the_new_folder() {
        for name in ["", ".", "..", ".nova", "../secret", "/absolute", "a\\b", "C:drive", "line\nfeed"] { assert!(!safe_name(name), "{name}"); }
        assert!(safe_name("Personal.txt")); assert!(safe_name("Notes & ideas"));
    }
    #[test]
    fn windows_download_names_reject_devices_and_aliases() {
        for name in ["CON", "nul.txt", "Aux.md", "PRN.notes.txt", "COM1.txt", "lpt9.md", "COM¹.txt", "LPT².md", "CON .txt", "CONIN$", "CONOUT$", "note.", "note.txt ", "a<b.txt", "a>b.txt", "a\"b.txt", "a|b.txt", "a?b.txt", "a*b.txt"] {
            assert!(!windows_name(name), "{name}");
            #[cfg(target_os = "windows")]
            assert!(!safe_name(name), "{name}");
        }
        for name in ["Notes.txt", "Résumé.md", "COM10.txt", "console.md", "Notes & ideas"] {
            assert!(windows_name(name), "{name}");
        }
    }
    #[test]
    fn drive_ids_cannot_inject_paths_or_queries() {
        assert_eq!(id(&json!({"id":"abc_DEF-123"})).unwrap(),"abc_DEF-123");
        for value in ["", "../file", "file?alt=media", "file' or true"] { assert!(id(&json!({"id":value})).is_err()); }
    }
    /// Explicit opt-in integration check; never runs in the ordinary test suite.
    #[test]
    #[ignore]
    fn live_selected_upload() {
        let root = PathBuf::from(std::env::var("NOVA_DRIVE_TEST_ROOT").expect("Explicit test workspace required")).canonicalize().unwrap();
        let files: Vec<String> = serde_json::from_str(&std::env::var("NOVA_DRIVE_TEST_FILES").expect("Explicit test files required")).unwrap();
        let drive = Drive::new().unwrap();
        let folder = workspace_folder(&drive,&root).unwrap();
        for path in files {
            assert!(allowed(&root,&path).unwrap(), "Test only uploads selected files");
            assert!(!path.contains('/'), "This test handles root notes only");
            let bytes = fs::read(crate::scoped_path(&root,&path).unwrap()).unwrap();
            assert!(bytes.len() as u64 <= crate::MAX_FILE);
            let key = crate::revision(path.as_bytes());
            drive.upload(&folder,&key,&path,&bytes,None).unwrap();
            let remote_id = id(&drive.find(&folder,&key).unwrap().unwrap()).unwrap();
            let remote = checked(drive.client.get(format!("{API}/{remote_id}")).query(&[("alt","media")]).bearer_auth(&drive.token).send().unwrap()).unwrap().bytes().unwrap();
            assert_eq!(crate::revision(&remote),crate::revision(&bytes),"Uploaded bytes must match");
            drive.upload(&folder,&key,&path,&bytes,None).unwrap();
            assert_eq!(id(&drive.find(&folder,&key).unwrap().unwrap()).unwrap(),remote_id,"Retry must not duplicate files");
            println!("Verified upload and idempotent retry: {path}");
        }
        println!("Drive folder: https://drive.google.com/drive/folders/{folder}");
    }
    #[test]
    #[ignore]
    fn live_update_and_conflict_guard() {
        let drive = Drive::new().unwrap();
        let key = format!("test-{}", rand::random::<u128>());
        let folder = drive.folder("root", &key, "Nova temporary upload check").unwrap();
        let result = (|| -> Result<(),String> {
            drive.upload(&folder,"test","verification.txt",b"version one",None)?;
            drive.upload(&folder,"test","verification.txt",b"version two",Some(&crate::revision(b"version one")))?;
            let file_id = id(&drive.find(&folder,"test")?.unwrap())?;
            let remote = checked(drive.client.get(format!("{API}/{file_id}")).query(&[("alt","media")]).bearer_auth(&drive.token).send().map_err(network)?)?.bytes().map_err(network)?;
            assert_eq!(remote.as_ref(),b"version two");
            let version: Value = checked(drive.client.get(format!("https://www.googleapis.com/drive/v2/files/{file_id}")).query(&[("fields","etag")]).bearer_auth(&drive.token).send().map_err(network)?)?.json().map_err(network)?;
            checked(drive.client.patch(format!("https://www.googleapis.com/upload/drive/v3/files/{file_id}")).query(&[("uploadType","media")]).bearer_auth(&drive.token).header("Content-Type","text/plain").body("external edit").send().map_err(network)?)?;
            let stale = drive.client.put(format!("{}/{file_id}",drive.upload_v2)).query(&[("uploadType","media")]).bearer_auth(&drive.token).header("If-Match",version["etag"].as_str().unwrap()).header("Content-Type","text/plain").body("stale writer").send().map_err(network)?;
            assert_eq!(stale.status().as_u16(),412,"Concurrent remote changes must reject a stale upload");
            assert!(drive.upload(&folder,"test","verification.txt",b"version three",Some(&crate::revision(b"version two"))).unwrap_err().contains("different version"));
            Ok(())
        })();
        checked(drive.client.delete(format!("{API}/{folder}")).bearer_auth(&drive.token).send().unwrap()).unwrap();
        result.unwrap();
    }

}
