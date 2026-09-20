//! Stable public identities; absolute iOS container paths can change on updates.
use std::path::{Path, PathBuf};
pub fn resolve(notes: &Path, root: &str) -> Result<PathBuf, String> {
    if root == "mobile" { return Ok(notes.to_path_buf()); }
    let name = root.strip_prefix("mobile-sync/").ok_or("Invalid mobile workspace.")?;
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0']) { return Err("Invalid mobile workspace.".into()); }
    let base = notes.parent().ok_or("Missing storage directory.")?.join("Synced").canonicalize().map_err(crate::err)?;
    let path = base.join(name).canonicalize().map_err(crate::err)?;
    if path.parent() != Some(base.as_path()) || !path.is_dir() { return Err("Invalid mobile workspace.".into()); }
    Ok(path)
}
pub fn identity(data: &Path, root: &Path) -> Result<String, String> {
    let data = data.canonicalize().map_err(crate::err)?;
    if root == data.join("Notes") { return Ok("mobile".into()); }
    let relative = root.strip_prefix(data.join("Synced")).map_err(crate::err)?;
    if relative.components().count() != 1 { return Err("Invalid mobile workspace.".into()); }
    Ok(format!("mobile-sync/{}", relative.to_string_lossy()))
}
pub fn bookmark_identity<'a>(data: &Path, path: &'a Path) -> Result<&'a Path, String> {
    // Keep existing on-device bookmark keys, namespace restored workspaces.
    let data = data.canonicalize().map_err(crate::err)?;
    path.strip_prefix(data.join("Notes")).or_else(|_| path.strip_prefix(&data)).map_err(crate::err)
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn roots_are_stable_and_confined() {
        let temp = tempfile::tempdir().unwrap(); let canonical=temp.path().canonicalize().unwrap(); let data=canonical.as_path();
        std::fs::create_dir_all(data.join("Notes")).unwrap();
        std::fs::create_dir_all(data.join("Synced/Work - abc")).unwrap();
        let root=resolve(&data.join("Notes"),"mobile-sync/Work - abc").unwrap();
        assert_eq!(identity(data,&root).unwrap(),"mobile-sync/Work - abc");
        for bad in ["mobile-sync/..", "mobile-sync/../Notes", "mobile-sync/", "mobile-sync/a/b", "/tmp"] { assert!(resolve(&data.join("Notes"),bad).is_err()); }
        assert_eq!(bookmark_identity(data,&data.join("Notes/a.txt")).unwrap(),Path::new("a.txt"));
        assert_eq!(bookmark_identity(data,&root.join("a.txt")).unwrap(),Path::new("Synced/Work - abc/a.txt"));
    }
}
