//! Drive IDs own sync state. Paths are only local locations, never identities.
use serde_json::{json, Value, Map};
static NULL: Value = Value::Null;

pub fn convert(registry: &mut Value) -> Result<(), String> {
    if registry["driveRegistryVersion"].as_u64().is_some_and(|v| v > 2) {
        return Err("This sync registry needs a newer Nova version.".into());
    }
    let legacy = registry["driveFiles"].as_object().cloned().unwrap_or_default();
    for (account, paths) in legacy {
        for (path, entry) in paths.as_object().into_iter().flatten() {
            let Some(id) = entry["id"].as_str() else { continue };
            if registry["driveObjects"][&account][id].is_object() { continue; }
            let mut object = entry.clone();
            object["localPath"] = json!(path);
            object["receipt"] = registry["driveReceipts"][&account][path].clone();
            if registry["syncDeletedPaths"][path] == true { object["deleted"] = json!(true); }
            registry["driveObjects"][&account][id] = object;
        }
    }
    // Receipt-only ancient state cannot be safely linked by a filename.
    let receipts = registry["driveReceipts"].as_object().cloned().unwrap_or_default();
    for (account, paths) in receipts {
        for (path, receipt) in paths.as_object().into_iter().flatten() {
            if at_path(registry, &account, path).is_null()
                && !registry["driveFiles"][&account][path]["id"].is_string() {
                registry["driveUnresolved"][&account][path] = receipt.clone();
            }
        }
    }
    for field in ["driveFiles", "driveReceipts", "syncDeletedPaths"] { registry.as_object_mut().unwrap().remove(field); }
    if registry["driveObjects"].is_object() || registry["cloudSpace"].is_object() {
        registry["driveRegistryVersion"] = json!(2);
    }
    if let Some(accounts) = registry["driveObjects"].as_object_mut() {
        for objects in accounts.values_mut() {
            for object in objects.as_object_mut().into_iter().flat_map(|m|m.values_mut()) {
                if object["localPath"].as_str().is_some_and(|path|path.split('/').any(|name|
                    name == ".nova" || name.starts_with(".nova.") || name.starts_with(".tmp"))) {
                    object["deleted"] = json!(true);
                }
            }
        }
    }
    if let Some(accounts) = registry["driveObjects"].as_object() {
        for objects in accounts.values() {
            let mut locations = std::collections::HashSet::new();
            for (id, object) in objects.as_object().into_iter().flatten() {
                if id.is_empty() || !id.bytes().all(|b|b.is_ascii_alphanumeric() || b == b'_' || b == b'-') || object["id"].as_str() != Some(id) {
                    return Err("Invalid Drive identity in the sync registry. Local files were preserved.".into());
                }
                if object["deleted"] != true {
                    let path = object["localPath"].as_str().ok_or("Drive identity has no local location.")?;
                    if !locations.insert(path.to_lowercase()) { return Err("Multiple Drive IDs occupy the same local location. Local files were preserved.".into()); }
                }
            }
        }
    }
    Ok(())
}
pub fn at_path<'a>(registry: &'a Value, account: &str, path: &str) -> &'a Value {
    registry["driveObjects"][account].as_object().into_iter().flat_map(|m|m.values())
        .find(|v|v["deleted"] != true && v["kind"] != "folder" && v["localPath"].as_str() == Some(path)).unwrap_or(&NULL)
}
pub fn paths(registry: &Value, account: &str) -> Map<String, Value> {
    registry["driveObjects"][account].as_object().into_iter().flat_map(|m|m.values())
        .filter(|v|v["deleted"] != true && v["kind"] != "folder")
        .filter_map(|v|Some((v["localPath"].as_str()?.to_owned(),v.clone()))).collect()
}
pub fn record(registry: &mut Value, account: &str, id: &str, path: &str, remote: &str, receipt: &str, metadata: &Value) {
    registry["driveObjects"][account][id] = json!({"id":id,"localPath":path,"remotePath":remote,
        "receipt":receipt,"version":metadata["version"],"modifiedTime":metadata["modifiedTime"]});
    registry["driveRegistryVersion"] = json!(2);
}
pub fn relocate(registry: &mut Value, old: &str, next: Option<&str>) -> Result<(), String> {
    convert(registry)?;
    if let Some(accounts) = registry["driveObjects"].as_object_mut() {
        for objects in accounts.values_mut() {
            for object in objects.as_object_mut().into_iter().flat_map(|m|m.values_mut()) {
                if object["deleted"] != true && object["localPath"].as_str() == Some(old) {
                    if let Some(next) = next { object["localPath"] = json!(next); }
                    else { object["deleted"] = json!(true); }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_backups_and_atomic_write_temporaries_are_not_notes() {
        let dir = tempfile::tempdir().unwrap();
        for name in [".nova.before-drive-ids", ".tmp123", "Real.txt"] {
            std::fs::write(dir.path().join(name), "text").unwrap();
        }
        std::fs::create_dir(dir.path().join(".nova-registry-backups")).unwrap();
        std::fs::write(dir.path().join(".nova-registry-backups/registry.json"), "{}").unwrap();
        let files = crate::files_in(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "Real.txt");
    }
    #[test]
    fn conversion_is_idempotent_and_deleted_ids_do_not_own_paths() {
        let mut registry = json!({"custom":42,"driveFiles":{"a":{"Work.txt":{"id":"old","deleted":true}}},"syncDeletedPaths":{"Work.txt":true}});
        convert(&mut registry).unwrap();
        record(&mut registry,"a","new","Work.txt","Work.txt","hash",&Value::Null);
        let first = registry.clone();
        convert(&mut registry).unwrap();
        assert_eq!(registry, first);
        assert_eq!(at_path(&registry,"a","Work.txt")["id"],"new");
        relocate(&mut registry,"Work.txt",Some("Renamed.txt")).unwrap();
        assert_eq!(registry["driveObjects"]["a"]["new"]["localPath"],"Renamed.txt");
        assert_eq!(registry["driveObjects"]["a"]["old"]["localPath"],"Work.txt");
        assert_eq!(registry["driveObjects"]["a"]["old"]["deleted"],true);
        assert_eq!(registry["custom"],42);
    }
    #[test]
    fn accounts_are_isolated_and_ambiguous_local_locations_are_rejected() {
        let mut registry = json!({});
        record(&mut registry,"a","one","Work.txt","Work.txt","a",&Value::Null);
        record(&mut registry,"b","two","Work.txt","Work.txt","b",&Value::Null);
        convert(&mut registry).unwrap();
        assert_eq!(at_path(&registry,"a","Work.txt")["id"],"one");
        record(&mut registry,"a","three","work.txt","work.txt","c",&Value::Null);
        assert!(convert(&mut registry).is_err());
    }
}
