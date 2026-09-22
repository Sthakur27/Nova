//! Explicit metadata editing stays separate from all ordinary note operations.
use crate::{err, revision, root_path, save_checked, Access};
use serde::Serialize;
use serde_json::Value;
use std::{fs, path::Path};
use tauri::{Manager, State};

const MAX_REGISTRY: usize = 4 * 1024 * 1024;
// These fields establish remote identity or track synchronization receipts.
// Editing them by hand could turn a Local folder into Cloud storage or overwrite
// another remote object. Keep them visible, but require the Cloud controls to change them.
const MANAGED: &[&str] = &[
    "cloudSpace", "driveWorkspace", "driveRegistryVersion", "driveObjects",
    "driveFolders", "driveFiles", "driveReceipts", "driveUnresolved",
    "syncDeletedPaths", "mobileDriveKey",
];

#[derive(Serialize)]
pub(crate) struct RegistryDocument {
    text: String,
    revision: String,
}

fn read(root: &Path) -> Result<RegistryDocument, String> {
    let path = root.join(".nova");
    let meta = fs::symlink_metadata(&path).map_err(err)?;
    if !meta.is_file() || meta.len() > MAX_REGISTRY as u64 {
        return Err(".nova must be a regular file no larger than 4 MiB; symbolic links are not editable.".into());
    }
    let bytes = fs::read(path).map_err(err)?;
    Ok(RegistryDocument {
        revision: revision(&bytes),
        text: String::from_utf8(bytes).map_err(|_| ".nova must be UTF-8 JSON text.")?,
    })
}

fn relative_file(path: &str) -> bool {
    !path.is_empty() && !path.contains(['\\', ':']) && !path.chars().any(char::is_control)
        && path.split('/').all(|part| !part.is_empty() && part != "." && part != ".." && part != ".nova")
}

fn validate(text: &str, existing: &str) -> Result<(), String> {
    if text.len() > MAX_REGISTRY { return Err(".nova must be no larger than 4 MiB.".into()); }
    let value: Value = serde_json::from_str(text).map_err(|e| format!("Invalid JSON: {e}"))?;
    if !value.is_object() { return Err(".nova must contain a JSON object, for example {}.".into()); }
    let old = serde_json::from_str::<Value>(existing).unwrap_or(Value::Null);
    for field in MANAGED {
        if value.get(*field) != old.get(*field) {
            return Err(format!("{field} is managed by Nova. Keep its saved value and use the Cloud controls to change sync identity or tracking."));
        }
    }
    for path in crate::registry_stars(&value)? {
        if !relative_file(&path) { return Err(format!("starred contains an invalid relative file path: {path:?}.")); }
    }
    crate::sync_policy::read(&value)?;
    // Check shapes before invoking the legacy converter, which mutates JSON maps.
    for field in ["driveObjects", "driveFolders", "driveFiles", "driveReceipts", "driveUnresolved"] {
        if let Some(accounts) = value.get(field) {
            let accounts = accounts.as_object().ok_or_else(|| format!("{field} must be an object keyed by account."))?;
            for (account, entries) in accounts {
                let entries = entries.as_object().ok_or_else(|| format!("{field}.{account} must be an object."))?;
                if matches!(field, "driveObjects" | "driveFolders" | "driveFiles") && entries.values().any(|v| !v.is_object()) {
                    return Err(format!("{field}.{account} must contain object records."));
                }
            }
        }
    }
    for field in ["cloudSpace", "driveWorkspace", "syncDeletedPaths"] {
        if value.get(field).is_some_and(|v| !v.is_object()) { return Err(format!("{field} must be an object.")); }
    }
    if value.get("driveRegistryVersion").is_some_and(|v| v.as_u64().is_none()) {
        return Err("driveRegistryVersion must be a non-negative integer.".into());
    }
    crate::drive_registry::convert(&mut value.clone())?;
    Ok(())
}

fn save(root: &Path, text: &str, expected: &str) -> Result<String, String> {
    let old = read(root)?;
    if old.revision != expected {
        return Err(".nova changed since this editor opened. Your draft is retained. Copy your edits, then reload the saved file before applying them again.".into());
    }
    validate(text, &old.text)?;
    save_checked(&root.join(".nova"), text, expected)
}

#[tauri::command]
pub(crate) async fn read_registry_document(root: String, access: State<'_, Access>) -> Result<RegistryDocument, String> {
    let root = root_path(&access, &root)?;
    tauri::async_runtime::spawn_blocking(move || read(&root)).await.map_err(err)?
}

#[tauri::command]
pub(crate) async fn validate_registry_document(root: String, text: String, revision: Option<String>, access: State<'_, Access>) -> Result<(), String> {
    let root = root_path(&access, &root)?;
    tauri::async_runtime::spawn_blocking(move || {
        let disk = read(&root)?;
        if revision.is_some_and(|expected| expected != disk.revision) {
            return Err(".nova changed on disk. Copy your edits before discarding this draft and reopening the file.".into());
        }
        validate(&text, &disk.text)
    }).await.map_err(err)?
}

#[tauri::command]
pub(crate) async fn save_registry_document(root: String, text: String, revision: String, access: State<'_, Access>, app: tauri::AppHandle) -> Result<String, String> {
    let root = root_path(&access, &root)?;
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let _guard = access.writes.lock().map_err(err)?;
        save(&root, &text, &revision)
    }).await.map_err(err)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_syntax_structure_paths_and_managed_identity() {
        for (text, message) in [
            ("{", "line 1"), ("[]", "JSON object"),
            (r#"{"starred":false}"#, "array"),
            (r#"{"starred":["../outside.md"]}"#, "relative file path"),
            (r#"{"syncPolicy":{"version":9,"rules":{}}}"#, "sync choices"),
            (r#"{"cloudSpace":{"id":"other"}}"#, "managed by Nova"),
        ] { assert!(validate(text, "{}").unwrap_err().contains(message), "{text}"); }
        assert!(validate(r#"{"starred":[".hidden/note.md"],"custom":{"x":1},"syncPolicy":{"version":1,"rules":{"":false}}}"#, "{}").is_ok());
        let malformed = r#"{"driveObjects":{"account":false}}"#;
        assert!(validate(malformed, malformed).unwrap_err().contains("must be an object"));
    }
    #[test]
    fn invalid_and_stale_saves_leave_disk_untouched_and_valid_save_preserves_custom_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".nova");
        fs::write(&path, "{}").unwrap();
        let doc = read(dir.path()).unwrap();
        assert!(save(dir.path(), "{", &doc.revision).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
        let next = r#"{"starred":["note.md"],"custom":42}"#;
        save(dir.path(), next, &doc.revision).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), next);
        assert!(save(dir.path(), "{}", &doc.revision).unwrap_err().contains("changed"));
        assert!(!crate::supported(&path));
        assert!(crate::scoped_path(dir.path(), ".nova").is_err());
    }
    #[test]
    fn repairs_invalid_json_without_admitting_remote_identity() {
        assert!(validate(r#"{"starred":[]}"#, "{").is_ok());
        assert!(validate(r#"{"driveWorkspace":{}}"#, "{").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_even_within_the_root() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("other"), "{}").unwrap();
        std::os::unix::fs::symlink(dir.path().join("other"), dir.path().join(".nova")).unwrap();
        assert!(read(dir.path()).is_err());
        assert!(save(dir.path(), "{}", &revision(b"{}")).is_err());
    }
}
