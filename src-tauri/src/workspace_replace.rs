//! Explicit replacements of reviewed, saved Local files. All writes share the
//! normal note/draft lock; the reviewed revision and edit ranges are rechecked.
use crate::*;

#[derive(Deserialize)]
pub(crate) struct Replacement {
    from: usize,
    to: usize,
    insert: String,
}

fn validate_changes(before: &str, after: &str, changes: &[Replacement]) -> Result<(), String> {
    if changes.is_empty() || changes.len() > 100_000 || after.len() as u64 > MAX_FILE {
        return Err("Replacement is empty or too large.".into());
    }
    let source: Vec<u16> = before.encode_utf16().collect();
    let mut output = Vec::new();
    let mut previous = 0;
    for change in changes {
        if change.from < previous || change.to < change.from || change.to > source.len() {
            return Err("Replacement ranges are invalid. Preview again.".into());
        }
        output.extend_from_slice(&source[previous..change.from]);
        output.extend(change.insert.encode_utf16());
        if output.len() as u64 > MAX_FILE { return Err("Replacement is too large.".into()); }
        previous = change.to;
    }
    output.extend_from_slice(&source[previous..]);
    if String::from_utf16(&output).map_err(err)? != after {
        return Err("Replacement text no longer matches its preview.".into());
    }
    Ok(())
}

fn map_position(position: usize, start: bool, changes: &[Replacement]) -> usize {
    let mut delta: i64 = 0;
    for change in changes {
        let length = change.insert.encode_utf16().count();
        if position < change.from { break; }
        if change.from == change.to && position == change.from {
            // Insertions at the outside edges do not expand a saved passage.
            return (change.from as i64 + delta) as usize + if start { length } else { 0 };
        }
        if position == change.from {
            return (change.from as i64 + delta) as usize;
        }
        if position < change.to {
            return (change.from as i64 + delta) as usize + if start { 0 } else { length };
        }
        delta += length as i64 - (change.to - change.from) as i64;
    }
    (position as i64 + delta) as usize
}

fn map_bookmarks(mut bookmarks: Vec<Bookmark>, before: &str, after: &str, changes: &[Replacement]) -> Vec<Bookmark> {
    let old: Vec<u16> = before.encode_utf16().collect();
    let new: Vec<u16> = after.encode_utf16().collect();
    for bookmark in &mut bookmarks {
        let quote: Vec<u16> = bookmark.quote.encode_utf16().collect();
        if quote.is_empty() {
            bookmark.from = bookmark.from.min(new.len());
            bookmark.to = bookmark.to.max(bookmark.from).min(new.len());
            bookmark.unresolved = true;
            continue;
        }
        // Read the latest metadata under the write lock and recover stale anchors
        // before mapping, just as the frontend does when a file is opened.
        if old.get(bookmark.from..bookmark.to) != Some(quote.as_slice()) {
            let mut last_byte = 0;
            let mut offset = 0;
            let mut nearest: Option<usize> = None;
            for (byte, _) in before.match_indices(&bookmark.quote) {
                offset += before[last_byte..byte].encode_utf16().count();
                last_byte = byte;
                if nearest.is_none_or(|previous| offset.abs_diff(bookmark.from) < previous.abs_diff(bookmark.from)) {
                    nearest = Some(offset);
                }
            }
            if let Some(from) = nearest {
                bookmark.from = from;
                bookmark.to = from + quote.len();
            } else {
                bookmark.from = bookmark.from.min(new.len());
                bookmark.to = bookmark.to.min(new.len());
                bookmark.unresolved = true;
                continue;
            }
        }
        bookmark.from = map_position(bookmark.from, true, changes).min(new.len());
        bookmark.to = map_position(bookmark.to, false, changes).max(bookmark.from).min(new.len());
        bookmark.unresolved = bookmark.from == bookmark.to;
        if !bookmark.unresolved {
            bookmark.quote = String::from_utf16_lossy(&new[bookmark.from..bookmark.to]);
        }
    }
    bookmarks
}

fn ensure_no_draft(draft: &Path) -> Result<(), String> {
    match fs::read(draft) {
        Ok(bytes) => {
            let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(err)?;
            if !value.is_null() { return Err("This file has a recovery draft. Save or discard it before replacing.".into()); }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(err(error)),
    }
    Ok(())
}

fn ensure_no_draft_aliases(path: &Path, draft: &Path) -> Result<(), String> {
    // Retain the exact caller identity, then check every possible ordinary folder
    // identity of the canonical file. A previous session may have opened a child
    // folder rather than today's parent, even if that root is no longer open.
    ensure_no_draft(draft)?;
    let directory = draft.parent().ok_or("Invalid recovery draft directory.")?;
    let target = fs::canonicalize(path).map_err(err)?;
    for root in target.ancestors().skip(1) {
        let relative = target.strip_prefix(root).map_err(err)?.to_string_lossy().replace('\\', "/");
        ensure_no_draft(&draft_path(directory, &root.to_string_lossy(), &relative))?;
    }
    Ok(())
}

fn replace_checked(path: &Path, metadata: &Path, draft: &Path, text: &str, expected: &str, changes: &[Replacement]) -> Result<String, String> {
    ensure_no_draft_aliases(path, draft)?;
    if fs::metadata(path).map_err(err)?.len() > MAX_FILE { return Err("This file is too large to replace.".into()); }
    let bytes = fs::read(path).map_err(err)?;
    if revision(&bytes) != expected { return Err("This file changed after preview. Preview again.".into()); }
    let before = String::from_utf8(bytes).map_err(err)?.replace("\r\n", "\n");
    validate_changes(&before, text, changes)?;
    let old_metadata = match fs::read(metadata) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(err(error)),
    };
    if let Some(bytes) = &old_metadata {
        let bookmarks: Vec<Bookmark> = serde_json::from_slice(bytes).map_err(err)?;
        if bookmarks.len() > 10_000 { return Err("Too many bookmarks.".into()); }
        let mapped = map_bookmarks(bookmarks, &before, text, changes);
        atomic_write(metadata, &serde_json::to_vec(&mapped).map_err(err)?)?;
    }
    // Recheck disk revision immediately before the normal atomic note save. If
    // it fails, restore metadata too; never report a partially saved note as done.
    match save_checked(path, text, expected) {
        Ok(revision) => Ok(revision),
        Err(error) => {
            if let Some(bytes) = old_metadata {
                if let Err(rollback) = atomic_write(metadata, &bytes) {
                    return Err(format!("{error} Bookmark metadata could not be restored: {rollback}"));
                }
            }
            Err(error)
        }
    }
}

fn local_target(root: &Path, path: &str) -> Result<PathBuf, String> {
    if Path::new(path).components().any(|component| matches!(component.as_os_str().to_str(), Some(".git" | "node_modules" | "target" | ".obsidian" | ".Trash" | ".nova-registry-backups"))) {
        return Err("Internal and generated directories are excluded from replacement.".into());
    }
    if read_registry(root)?.get("cloudSpace").is_some_and(|value| !value.is_null()) {
        return Err("Replace across files currently supports Local folders only.".into());
    }
    let target = scoped_path(root, path)?;
    // A symlink alias could have a draft stored under a different relative path.
    // Bulk edits require a direct file identity so the draft guard is reliable.
    let mut component_path = root.to_path_buf();
    for component in Path::new(path).components() {
        component_path.push(component);
        if fs::symlink_metadata(&component_path).map_err(err)?.file_type().is_symlink() {
            return Err("Replace across files does not follow symbolic links.".into());
        }
    }
    Ok(target)
}

#[tauri::command]
pub(crate) async fn replace_saved_note(root: String, path: String, text: String, revision: String, changes: Vec<Replacement>, app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let _guard = access.writes.lock().map_err(err)?;
        let directory = root_path(&access, &root)?;
        let target = local_target(&directory, &path)?;
        let metadata = metadata_path(&app, &target)?;
        let drafts = app.path().app_data_dir().map_err(err)?.join("drafts");
        replace_checked(&target, &metadata, &draft_path(&drafts, &root, &path), &text, &revision, &changes)
    }).await.map_err(err)?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edit(from: usize, to: usize, insert: &str) -> Replacement { Replacement { from, to, insert: insert.into() } }

    #[test]
    fn replacement_preserves_crlf_and_maps_latest_unicode_bookmarks() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.md");
        let metadata = dir.path().join("bookmark.json");
        let draft = dir.path().join("draft.json");
        fs::write(&file, "😀 alpha\r\nlast").unwrap();
        fs::write(&metadata, serde_json::to_vec(&vec![Bookmark {id: "1".into(), name: "Latest name".into(), from: 3, to: 8, quote: "alpha".into(), unresolved: false}]).unwrap()).unwrap();
        let expected = revision(&fs::read(&file).unwrap());
        replace_checked(&file, &metadata, &draft, "😀 beta\nlast", &expected, &[edit(3, 8, "beta")]).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "😀 beta\r\nlast");
        let marks: Vec<Bookmark> = serde_json::from_slice(&fs::read(metadata).unwrap()).unwrap();
        assert_eq!((marks[0].from, marks[0].to, marks[0].quote.as_str()), (3, 7, "beta"));
        assert_eq!(marks[0].name, "Latest name");
        assert!(!marks[0].unresolved);
    }

    #[test]
    fn draft_stale_preview_and_invalid_ranges_never_write() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.md");
        let metadata = dir.path().join("bookmark.json");
        let draft = dir.path().join("draft.json");
        fs::write(&file, "alpha").unwrap();
        let rev = revision(b"alpha");
        fs::write(&draft, r#"{"text":"unsaved"}"#).unwrap();
        assert!(replace_checked(&file, &metadata, &draft, "beta", &rev, &[edit(0, 5, "beta")]).unwrap_err().contains("draft"));
        fs::write(&draft, "null").unwrap();
        assert!(replace_checked(&file, &metadata, &draft, "beta", "stale", &[edit(0, 5, "beta")]).unwrap_err().contains("preview"));
        assert!(replace_checked(&file, &metadata, &draft, "beta", &rev, &[edit(0, 8, "beta")]).is_err());
        assert!(replace_checked(&file, &metadata, &draft, "unreviewed", &rev, &[edit(0, 5, "beta")]).is_err());
        assert_eq!(fs::read_to_string(file).unwrap(), "alpha");
    }

    #[test]
    fn damaged_metadata_blocks_replacement_and_deleted_passage_remains_recoverable() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.md");
        let metadata = dir.path().join("bookmark.json");
        fs::write(&file, "alpha").unwrap();
        fs::write(&metadata, "broken").unwrap();
        assert!(replace_checked(&file, &metadata, &dir.path().join("draft"), "beta", &revision(b"alpha"), &[edit(0, 5, "beta")]).is_err());
        assert_eq!(fs::read_to_string(file).unwrap(), "alpha");
        let marks = map_bookmarks(vec![Bookmark {id:"1".into(),name:"Passage".into(),from:0,to:5,quote:"alpha".into(),unresolved:false}], "alpha", "", &[edit(0,5,"")]);
        assert!(marks[0].unresolved);
        assert_eq!(marks[0].quote, "alpha");
    }

    #[test]
    fn scope_rejects_cloud_registry_metadata_and_parent_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("note.md"), "alpha").unwrap();
        assert!(local_target(&root, "note.md").is_ok());
        assert!(local_target(&root, "../outside.md").is_err());
        fs::write(root.join(".nova"), r#"{"cloudSpace":{"id":"cloud"}}"#).unwrap();
        assert!(local_target(&root, "note.md").unwrap_err().contains("Local"));
        fs::write(root.join(".nova"), "{}").unwrap();
        assert!(local_target(&root, ".nova").is_err());
        #[cfg(unix)] {
            std::os::unix::fs::symlink(root.join("note.md"), root.join("alias.md")).unwrap();
            assert!(local_target(&root, "alias.md").unwrap_err().contains("symbolic"));
        }
    }

    #[test]
    fn nested_folder_draft_blocks_parent_folder_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().canonicalize().unwrap();
        let nested = parent.join("sub");
        let drafts = parent.join("drafts");
        fs::create_dir_all(&nested).unwrap();
        fs::create_dir_all(&drafts).unwrap();
        let file = nested.join("a.md");
        fs::write(&file, "alpha").unwrap();
        let nested_draft = draft_path(&drafts, &nested.to_string_lossy(), "a.md");
        let parent_draft = draft_path(&drafts, &parent.to_string_lossy(), "sub/a.md");
        fs::write(&nested_draft, r#"{"text":"unsaved from prior child-folder session"}"#).unwrap();
        let metadata = parent.join("bookmark.json");
        let marks = serde_json::to_vec(&vec![Bookmark {id:"1".into(), name:"Passage".into(), from:0, to:5, quote:"alpha".into(), unresolved:false}]).unwrap();
        fs::write(&metadata, &marks).unwrap();
        let run = || replace_checked(&file, &metadata, &parent_draft, "beta", &revision(b"alpha"), &[edit(0,5,"beta")]);
        assert!(run().unwrap_err().contains("recovery draft"));
        assert_eq!(fs::read_to_string(&file).unwrap(), "alpha");
        assert_eq!(fs::read(&metadata).unwrap(), marks);
        fs::write(&nested_draft, "null").unwrap();
        run().unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "beta");
    }

    #[test]
    fn bookmarks_reanchor_then_follow_multiple_edits_and_insertion_edges() {
        let make = |from, to, quote: &str| Bookmark { id:"b".into(), name:"Passage".into(), from, to, quote:quote.into(), unresolved:false };
        let marks = map_bookmarks(vec![make(0,9,"hello cat")], "cat hello cat", "tiger hello tiger", &[edit(0,3,"tiger"),edit(10,13,"tiger")]);
        assert_eq!((marks[0].from, marks[0].to, marks[0].quote.as_str()), (6,17,"hello tiger"));
        let marks = map_bookmarks(vec![make(0,3,"cat")], "cat", "[cat]", &[edit(0,0,"["), edit(3,3,"]")]);
        assert_eq!((marks[0].from, marks[0].to, marks[0].quote.as_str()), (1,4,"cat"));
    }
}
