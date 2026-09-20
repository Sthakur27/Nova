use std::collections::BTreeMap;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::{err, read_registry, registry_stars, write_registry};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SyncPolicy {
    version: u8,
    rules: BTreeMap<String, bool>,
}
impl SyncPolicy {
    pub(crate) fn included(&self, path: &str) -> bool {
        let mut current = path;
        loop {
            if let Some(value) = self.rules.get(current) { return *value; }
            if current.is_empty() { return false; }
            current = current.rsplit_once('/').map(|(parent, _)| parent).unwrap_or("");
        }
    }
}
impl Default for SyncPolicy {
    fn default() -> Self { Self { version: 1, rules: BTreeMap::new() } }
}
fn valid_path(path: &str) -> bool {
    path.is_empty() || (!path.contains('\\') && !path.contains(':') && !path.chars().any(char::is_control)
        && path.split('/').all(|part| !part.is_empty() && part != "." && part != ".." && part != ".nova"))
}
pub fn read(registry: &serde_json::Value) -> Result<SyncPolicy, String> {
    let Some(value) = registry.get("syncPolicy") else { return Ok(SyncPolicy::default()); };
    let policy: SyncPolicy = serde_json::from_value(value.clone()).map_err(|e| format!("Invalid sync choices: {e}"))?;
    if policy.version != 1 || policy.rules.len() > 50_001 || policy.rules.keys().any(|p| !valid_path(p)) {
        return Err("Unsupported or invalid sync choices. No files will be synced.".into());
    }
    Ok(policy)
}
pub fn update(root: &Path, path: &str, choice: &str) -> Result<SyncPolicy, String> {
    if !valid_path(path) { return Err("Choose a file or folder inside this workspace.".into()); }
    let target = std::fs::canonicalize(root.join(path)).map_err(err)?;
    if !target.starts_with(root) || !(target.is_dir() || target.is_file() && crate::supported(&target)) {
        return Err("Choose a file or folder inside this workspace.".into());
    }
    let mut registry = read_registry(root)?;
    let mut policy = read(&registry)?;
    match choice {
        "inherit" => { policy.rules.remove(path); },
        "include" => { policy.rules.insert(path.into(), true); },
        "exclude" => { policy.rules.insert(path.into(), false); },
        _ => return Err("Invalid sync choice.".into()),
    }
    registry["syncPolicy"] = serde_json::to_value(&policy).map_err(err)?;
    read(&registry)?;
    let stars = registry_stars(&registry)?;
    write_registry(root, registry, &stars)?;
    Ok(policy)
}
// Explicit choices travel with renamed/moved files. Inherited choices use the destination folder.
pub fn relocate(registry: &mut serde_json::Value, old: &str, next: Option<&str>) -> Result<(), String> {
    crate::drive_registry::relocate(registry, old, next)?;
    if registry.get("syncPolicy").is_none() { return Ok(()); }
    let mut policy = read(registry)?;
    if let Some(value) = policy.rules.remove(old) {
        if let Some(next) = next { policy.rules.insert(next.into(), value); }
    }
    registry["syncPolicy"] = serde_json::to_value(policy).map_err(err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn drive_identity_follows_rename_and_deletion_leaves_a_tombstone() {
        let mut registry=serde_json::json!({"syncPolicy":{"version":1,"rules":{"a.txt":true}},"driveFiles":{"account":{"a.txt":{"id":"stable-id","remotePath":"a.txt"}}},"driveReceipts":{"account":{"a.txt":"agreed-hash"}}});
        relocate(&mut registry,"a.txt",Some("nested/b.txt")).unwrap();
        assert_eq!(registry["driveObjects"]["account"]["stable-id"]["id"],"stable-id");
        assert_eq!(registry["driveObjects"]["account"]["stable-id"]["remotePath"],"a.txt");
        assert_eq!(registry["driveObjects"]["account"]["stable-id"]["receipt"],"agreed-hash");
        relocate(&mut registry,"nested/b.txt",None).unwrap();
        assert_eq!(registry["driveObjects"]["account"]["stable-id"]["deleted"],true);
        assert_eq!(registry["driveObjects"]["account"]["stable-id"]["localPath"], "nested/b.txt");
    }
    #[test]
    fn upload_inclusion_obeys_nearest_override() {
        let policy = read(&serde_json::json!({"syncPolicy":{"version":1,"rules":{"":true,"private":false,"private/shared.txt":true}}})).unwrap();
        assert!(policy.included("new.txt"));
        assert!(!policy.included("private/secret.txt"));
        assert!(policy.included("private/shared.txt"));
        assert!(!SyncPolicy::default().included("new.txt"));
    }
    #[test]
    fn persists_exceptions_and_preserves_other_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::write(root.join("a.md"), "note").unwrap();
        std::fs::write(root.join(".nova"), r#"{"starred":["a.md"],"custom":42}"#).unwrap();
        update(&root, "", "include").unwrap();
        update(&root, "a.md", "exclude").unwrap();
        update(&root, "", "exclude").unwrap();
        let registry = read_registry(&root).unwrap();
        assert_eq!(registry["custom"], 42);
        assert_eq!(registry["starred"][0], "a.md");
        assert_eq!(read(&registry).unwrap().rules.get("a.md"), Some(&false));
        update(&root, "a.md", "inherit").unwrap();
        assert!(!read(&read_registry(&root).unwrap()).unwrap().rules.contains_key("a.md"));
    }
    #[test]
    fn rejects_invalid_or_future_policy_without_overwriting() {
        for value in [serde_json::json!({"version":2,"rules":{}}), serde_json::json!({"version":1,"rules":{"../private":true}}), serde_json::json!({"version":1,"rules":{"a":"yes"}})] {
            assert!(read(&serde_json::json!({"syncPolicy":value})).is_err());
        }
        assert!(!valid_path("/outside"));
        assert!(!valid_path("a/../b"));
        assert!(!valid_path(".nova"));
    }
    #[test]
    fn explicit_exclusion_follows_moves_and_is_removed_on_delete() {
        let mut registry = serde_json::json!({"syncPolicy":{"version":1,"rules":{"":true,"private.md":false}}});
        relocate(&mut registry, "private.md", Some("public/private.md")).unwrap();
        assert_eq!(read(&registry).unwrap().rules.get("public/private.md"), Some(&false));
        relocate(&mut registry, "public/private.md", None).unwrap();
        assert_eq!(read(&registry).unwrap().rules.len(), 1);
    }
}
