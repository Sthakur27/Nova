//! Cheap, nonrecursive snapshots of only open notes and visible directories.
use crate::{err, root_path, Access};
use serde::Serialize;
use std::{fs, path::{Component, Path}};
use tauri::State;

#[derive(Serialize)]
pub(crate) struct Stamp { path: String, stamp: Option<String>, error: Option<String> }
fn stamp(root: &Path, relative: &str) -> Result<Option<String>, String> {
    let relative = Path::new(relative);
    if relative.is_absolute() || relative.components().any(|p| matches!(p, Component::ParentDir | Component::Prefix(_))) {
        return Err("Choose a path inside the open folder.".into());
    }
    let path = match fs::canonicalize(root.join(relative)) {
        Ok(path) => path,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(err(e)),
    };
    if !path.starts_with(root) { return Err("Choose a path inside the open folder.".into()); }
    let metadata = fs::metadata(path).map_err(err)?;
    if !metadata.is_file() && !metadata.is_dir() { return Err("Unsupported file type.".into()); }
    let mut value = format!("{}:{:?}:{:?}", metadata.len(), metadata.modified().map_err(err)?, metadata.created().ok());
    #[cfg(unix)] {
        use std::os::unix::fs::MetadataExt;
        value.push_str(&format!(":{}:{}:{}", metadata.ino(), metadata.ctime(), metadata.ctime_nsec()));
    }
    Ok(Some(value))
}
#[tauri::command]
pub(crate) async fn local_path_stamps(root: String, paths: Vec<String>, access: State<'_, Access>) -> Result<Vec<Stamp>, String> {
    let root = root_path(&access, &root)?;
    if paths.len() > 4096 { return Err("Too many paths to monitor at once.".into()); }
    tauri::async_runtime::spawn_blocking(move || paths.into_iter().map(|path| {
        match stamp(&root, &path) {
            Ok(stamp) => Stamp { path, stamp, error: None },
            Err(error) => Stamp { path, stamp: None, error: Some(error) },
        }
    }).collect()).await.map_err(err)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_rewrites_replacement_deletion_and_directory_changes() {
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().canonicalize().unwrap();
        let file = root.join("note.md"); fs::write(&file, "one").unwrap();
        let before = stamp(&root, "note.md").unwrap();
        fs::write(&file, "two").unwrap();
        assert_ne!(before, stamp(&root, "note.md").unwrap());
        let before = stamp(&root, "note.md").unwrap();
        fs::write(root.join("swap"), "new").unwrap(); fs::rename(root.join("swap"), &file).unwrap();
        assert_ne!(before, stamp(&root, "note.md").unwrap());
        let before = stamp(&root, "").unwrap(); fs::remove_file(&file).unwrap();
        assert_eq!(stamp(&root, "note.md").unwrap(), None);
        assert_ne!(before, stamp(&root, "").unwrap());
        assert!(stamp(&root, "../escape").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = tempfile::tempdir().unwrap(); let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "private").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("escape")).unwrap();
        assert!(stamp(&dir.path().canonicalize().unwrap(), "escape/note.md").is_err());
    }
}
