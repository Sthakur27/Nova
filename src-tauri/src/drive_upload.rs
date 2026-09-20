//! Uploads selected saved notes. Remote edits are never silently overwritten.
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, io::Read, path::{Path, PathBuf}, time::Duration};
use tauri::{Emitter, Manager, State};
use crate::{Access, drive_auth::{self, DriveAuth}};
const API: &str = "https://www.googleapis.com/drive/v3/files";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item { pub path: String, pub state: String, pub message: String }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report { root: String, folder_url: String, items: Vec<Item> }
fn checked(response: Response) -> Result<Response, String> {
    if response.status().is_success() { return Ok(response); }
    Err(match response.status().as_u16() {
        401 => "Google access expired. Reconnect Google Drive.".into(),
        403 => "Google Drive refused the upload. Check storage space and account permissions, then retry.".into(),
        404 => "The Drive file or folder was removed. Retry to create a new copy.".into(),
        412 => "The Drive copy changed during upload. Neither copy was overwritten. Review the Drive file.".into(),
        429 => "Google Drive is rate limiting uploads. Wait a moment and retry.".into(),
        code => format!("Google Drive returned error {code}. Retry when your connection is available."),
    })
}
fn network(_: reqwest::Error) -> String { "Could not reach Google Drive. Check your connection and retry.".into() }
struct Drive { client: Client, token: String }
impl Drive {
    fn new() -> Result<Self, String> { Ok(Self { token: drive_auth::access_token()?, client: Client::builder().timeout(Duration::from_secs(60)).build().map_err(network)? }) }
    fn find(&self, parent: &str, key: &str) -> Result<Option<Value>, String> {
        let query = format!("trashed = false and '{parent}' in parents and appProperties has {{ key='novaKey' and value='{key}' }}");
        let value: Value = checked(self.client.get(API).bearer_auth(&self.token).query(&[("q",query.as_str()),("fields","files(id,mimeType,appProperties)"),("pageSize","2")]).send().map_err(network)?)?.json().map_err(network)?;
        let files = value["files"].as_array().ok_or("Invalid Drive file listing.")?;
        if files.len() > 1 { return Err("Duplicate Nova files found in Drive. Review them before retrying.".into()); }
        Ok(files.first().cloned())
    }
    fn folder(&self, parent: &str, key: &str, name: &str) -> Result<String, String> {
        if let Some(file) = self.find(parent,key)? {
            if file["mimeType"] != "application/vnd.google-apps.folder" { return Err("Nova’s Drive folder was replaced with a file.".into()); }
            return id(&file);
        }
        let value: Value = checked(self.client.post(API).bearer_auth(&self.token).json(&json!({"name":name,"mimeType":"application/vnd.google-apps.folder","parents":[parent],"appProperties":{"novaKey":key}})).send().map_err(network)?)?.json().map_err(network)?;
        id(&value)
    }
    fn children(&self, parent: &str) -> Result<Vec<Value>,String> {
        let mut result = Vec::new(); let mut page = String::new();
        loop {
            let query = format!("trashed = false and '{parent}' in parents");
            let value: Value = checked(self.client.get(API).bearer_auth(&self.token).query(&[("q",query.as_str()),("fields","nextPageToken,files(id,name,mimeType,appProperties,size)"),("pageSize","1000"),("pageToken",page.as_str())]).send().map_err(network)?)?.json().map_err(network)?;
            result.extend(value["files"].as_array().ok_or("Invalid Drive listing.")?.iter().cloned());
            if result.len() > 50000 { return Err("This Drive folder is too large to restore.".into()); }
            match value["nextPageToken"].as_str() { Some(next) => page = next.into(), None => break }
        }
        Ok(result)
    }
    fn upload(&self, parent: &str, key: &str, name: &str, bytes: &[u8], baseline: Option<&str>) -> Result<(), String> {
        let hash = crate::revision(bytes);
        let existing = self.find(parent,key)?;
        let mut etag = None;
        let mut file_id = None;
        if let Some(file) = &existing {
            let found = id(file)?;
            // Capture the metadata revision before reading content. Any later
            // remote edit must fail the conditional update.
            // Drive v2 exposes the file ETag; v3 omits it. Use v2 for
            // conditional updates while keeping v3 discovery and creation.
            let metadata: Value = checked(self.client.get(format!("https://www.googleapis.com/drive/v2/files/{found}")).query(&[("fields","etag")]).bearer_auth(&self.token).send().map_err(network)?)?.json().map_err(network)?;
            etag = metadata["etag"].as_str().map(str::to_owned);
            let response = checked(self.client.get(format!("{API}/{found}")).query(&[("alt","media")]).bearer_auth(&self.token).send().map_err(network)?)?;
            let mut remote = Vec::new();
            response.take(crate::MAX_FILE + 1).read_to_end(&mut remote).map_err(crate::err)?;
            if remote.len() as u64 > crate::MAX_FILE { return Err("Drive copy exceeds Nova’s size limit. It was left unchanged.".into()); }
            let remote_hash = crate::revision(&remote);
            if remote_hash == hash { return Ok(()); }
            if baseline != Some(remote_hash.as_str()) {
                return Err("Drive has a different version than this laptop last synced. Bring a fresh copy to this device before uploading; neither copy was overwritten.".into());
            }
            if file["appProperties"]["novaRevision"].as_str() != Some(remote_hash.as_str()) {
                return Err("Drive copy was edited elsewhere. Upload paused to preserve both versions; review it in Drive.".into());
            }
            if etag.is_none() { return Err("Drive did not return a revision guard. The existing copy was left unchanged.".into()); }
            file_id = Some(found);
        }
        let mut metadata = json!({"name":name,"appProperties":{"novaKey":key,"novaRevision":hash}});
        if file_id.is_none() { metadata["parents"] = json!([parent]); }
        else { metadata = json!({"title":name,"properties":[{"key":"novaKey","value":key,"visibility":"PRIVATE"},{"key":"novaRevision","value":hash,"visibility":"PRIVATE"}]}); }
        let boundary = format!("nova_{}", rand::random::<u128>());
        let mut body = format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n").into_bytes();
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let url = "https://www.googleapis.com/upload/drive/v3/files";
        let mut request = if let Some(file_id) = file_id { self.client.put(format!("https://www.googleapis.com/upload/drive/v2/files/{file_id}")) } else { self.client.post(url) };
        if let Some(etag) = etag { request = request.header("If-Match",etag); }
        checked(request.query(&[("uploadType","multipart")]).bearer_auth(&self.token).header("Content-Type",format!("multipart/related; boundary={boundary}")).body(body).send().map_err(network)?)?;
        Ok(())
    }
}
fn id(file: &Value) -> Result<String, String> {
    let id = file["id"].as_str().ok_or("Google Drive did not return a file ID.")?;
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') { return Err("Google Drive returned an invalid file ID.".into()); }
    Ok(id.into())
}
fn base_folder(drive: &Drive) -> Result<String,String> {
    let base = drive.folder("root", "nova-notes-v1", ".nova")?;
    // Migrate the existing Nova-managed container in place; keep file IDs/links.
    checked(drive.client.patch(format!("{API}/{base}")).bearer_auth(&drive.token).json(&json!({"name":".nova"})).send().map_err(network)?)?;
    Ok(base)
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
    let key = crate::revision(root.to_string_lossy().as_bytes());
    drive.folder(&base, &key, root.file_name().and_then(|s|s.to_str()).unwrap_or("Notes"))
}
fn allowed(root: &Path, path: &str) -> Result<bool, String> { Ok(crate::sync_policy::read(&crate::read_registry(root)?)?.included(path)) }
fn upload_workspace(app: tauri::AppHandle, root: PathBuf) -> Result<Report, String> {
    let drive = Drive::new()?;
    // Validate policy before creating anything remotely.
    crate::sync_policy::read(&crate::read_registry(&root)?)?;
    let folder = workspace_folder(&drive, &root)?;
    let account = drive_auth::account_key()?;
    let mut report = Report { root: root.to_string_lossy().into_owned(), folder_url: format!("https://drive.google.com/drive/folders/{folder}"), items: Vec::new() };
    for file in crate::files_in(&root)? {
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
                parent = drive.folder(&parent, &crate::revision(parts[..=index].join("/").as_bytes()), part)?;
            }
            if !allowed(&root,&file.path)? { return Err("Selection changed. File was not uploaded.".into()); }
            let registry = crate::read_registry(&root)?;
            let receipt = &registry["driveReceipts"][&account][&file.path];
            drive.upload(&parent,&crate::revision(file.path.as_bytes()),parts.last().unwrap(),&bytes,receipt.as_str())?;
            {
                let access = app.state::<Access>();
                let _lock = access.writes.lock().map_err(crate::err)?;
                let mut registry = crate::read_registry(&root)?;
                registry["driveReceipts"][&account][&file.path] = json!(crate::revision(&bytes));
                let stars = crate::registry_stars(&registry)?;
                crate::write_registry(&root,registry,&stars)?;
            }
            if crate::revision(&fs::read(local).map_err(crate::err)?) != crate::revision(&bytes) {
                return Err("File changed during upload. Save and upload again to send the latest version.".into());
            }
            Ok(())
        })();
        let (state,message) = match result { Ok(()) => ("uploaded","Saved file is up to date in Drive.".to_string()), Err(error) => ("error",error) };
        emit(state,&message);
        report.items.push(Item { path:file.path,state:state.into(),message });
    }
    Ok(report)
}
#[tauri::command]
pub async fn drive_upload(root: String, app: tauri::AppHandle, access: State<'_,Access>, auth: State<'_,DriveAuth>) -> Result<Report,String> {
    let root = crate::root_path(&access,&root)?;
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || { let _guard = guard; upload_workspace(app,root) }).await.map_err(crate::err)?
}
#[tauri::command]
pub async fn drive_open_folder(root: String, access: State<'_,Access>, auth: State<'_,DriveAuth>) -> Result<(),String> {
    let root = crate::root_path(&access,&root)?;
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let folder = workspace_folder(&Drive::new()?,&root)?;
        webbrowser::open(&format!("https://drive.google.com/drive/folders/{folder}")).map_err(|_| "Could not open the browser.".to_string())
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
    !name.is_empty() && name != "." && name != ".." && name != ".nova" && !name.contains(['/', '\\', ':']) && !name.chars().any(char::is_control)
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
    let guard = drive_auth::transfer_guard(&auth)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard; let drive = Drive::new()?;
        let base = base_folder(&drive)?;
        let workspace = drive.children(&base)?.into_iter().find(|v|v["id"].as_str()==Some(workspace_id.as_str()) && v["mimeType"]=="application/vnd.google-apps.folder" && v["appProperties"]["novaKey"].is_string()).ok_or("Choose a Nova workspace from Drive.")?;
        let name = workspace["name"].as_str().filter(|n|safe_name(n)).unwrap_or("Nova notes");
        // An exclusively created destination guarantees no existing files are overwritten.
        let directory = tempfile::Builder::new().prefix(&format!("{name} - ")).tempdir_in(&parent).map_err(crate::err)?;
        let mut rules = serde_json::Map::new(); let mut budget = 512 * 1024 * 1024;
        restore_tree(&drive,&workspace_id,directory.path(),"",&mut rules,&mut budget,0)?;
        let account = drive_auth::account_key()?;
        let mut receipts = serde_json::Map::new();
        for path in rules.keys() { receipts.insert(path.clone(),json!(crate::revision(&fs::read(directory.path().join(path)).map_err(crate::err)?))); }
        let registry = json!({"syncPolicy":{"version":1,"rules":rules},"driveWorkspace":{"id":workspace_id,"account":account},"driveReceipts":{account:receipts},"starred":[]});
        fs::write(directory.path().join(".nova"),serde_json::to_vec(&registry).map_err(crate::err)?).map_err(crate::err)?;
        Ok(directory.keep().to_string_lossy().into_owned())
    }).await.map_err(crate::err)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restore_names_stay_inside_the_new_folder() {
        for name in ["", ".", "..", ".nova", "../secret", "/absolute", "a\\b", "C:drive", "line\nfeed"] { assert!(!safe_name(name), "{name}"); }
        assert!(safe_name("Personal.txt")); assert!(safe_name("Notes & ideas"));
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
            let stale = drive.client.put(format!("https://www.googleapis.com/upload/drive/v2/files/{file_id}")).query(&[("uploadType","media")]).bearer_auth(&drive.token).header("If-Match",version["etag"].as_str().unwrap()).header("Content-Type","text/plain").body("stale writer").send().map_err(network)?;
            assert_eq!(stale.status().as_u16(),412,"Concurrent remote changes must reject a stale upload");
            assert!(drive.upload(&folder,"test","verification.txt",b"version three",Some(&crate::revision(b"version two"))).unwrap_err().contains("different version"));
            Ok(())
        })();
        checked(drive.client.delete(format!("{API}/{folder}")).bearer_auth(&drive.token).send().unwrap()).unwrap();
        result.unwrap();
    }

}
