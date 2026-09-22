//! Paged directory browsing is independent of recursive search.
use crate::{err, root_path, supported, Access, NoteFile};
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
use tauri::State;
use walkdir::WalkDir;

const PAGE_SIZE: usize = 300;
pub(crate) fn visible(name: &str) -> bool {
    !matches!(
        name,
        ".git" | "node_modules" | "target" | ".obsidian" | ".Trash" | ".nova-registry-backups"
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Listing {
    pub files: Vec<NoteFile>,
    pub directories: Vec<String>,
    pub next_offset: Option<usize>,
    pub warnings: Vec<String>,
}

pub(crate) fn list(root: &Path, relative: &str, offset: usize) -> Result<Listing, String> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|p| matches!(p, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("Choose a directory inside the open folder.".into());
    }
    let path = fs::canonicalize(root.join(relative)).map_err(err)?;
    if !path.starts_with(root) || !path.is_dir() {
        return Err("Choose a directory inside the open folder.".into());
    }
    let mut entries = fs::read_dir(&path).map_err(err)?.skip(offset);
    let mut result = Listing {
        files: vec![],
        directories: vec![],
        next_offset: None,
        warnings: vec![],
    };
    // Bound work by entries inspected, not just the number of supported files.
    for _ in 0..PAGE_SIZE {
        let Some(entry) = entries.next() else {
            return Ok(result);
        };
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                result.warnings.push(e.to_string());
                continue;
            }
        };
        if matches!(entry.file_name().to_str(), Some("node_modules" | "target" | ".nova-registry-backups")) {
            continue;
        }
        let kind = match entry.file_type() {
            Ok(k) => k,
            Err(e) => {
                result.warnings.push(e.to_string());
                continue;
            }
        };
        let child = entry.path();
        let name = child
            .strip_prefix(root)
            .map_err(err)?
            .to_string_lossy()
            .replace('\\', "/");
        // Do not follow symlinks into an unrelated directory or open named pipes.
        if kind.is_dir() {
            result.directories.push(name);
        } else if kind.is_file() && (supported(&child) || (relative.as_os_str().is_empty() && entry.file_name() == ".nova")) {
            result.files.push(NoteFile {
                path: name,
                name: entry.file_name().to_string_lossy().into_owned(),
            });
        }
    }
    if entries.next().is_some() {
        result.next_offset = Some(offset + PAGE_SIZE);
    }
    Ok(result)
}

#[tauri::command]
pub(crate) async fn list_directory(
    root: String,
    path: String,
    offset: Option<usize>,
    access: State<'_, Access>,
) -> Result<Listing, String> {
    let root = root_path(&access, &root)?;
    tauri::async_runtime::spawn_blocking(move || list(&root, &path, offset.unwrap_or(0)))
        .await
        .map_err(err)?
}

#[derive(Serialize)]
pub(crate) struct FileMatch {
    root: String,
    path: String,
    name: String,
}
#[derive(Serialize)]
pub(crate) struct FileMatches {
    files: Vec<FileMatch>,
    warnings: Vec<String>,
}

#[cfg(test)]
fn find_files(
    roots: Vec<std::path::PathBuf>,
    query: &str,
    generation: Arc<AtomicU64>,
    ticket: u64,
) -> FileMatches {
    find_files_with_matcher(roots, query, generation, ticket,
        crate::search_options::Matcher::new(query, None).unwrap())
}
fn find_files_with_matcher(
    roots: Vec<std::path::PathBuf>,
    query: &str,
    generation: Arc<AtomicU64>,
    ticket: u64,
    matcher: crate::search_options::Matcher,
) -> FileMatches {
    let mut result = FileMatches {
        files: vec![],
        warnings: vec![],
    };
    if query.trim().is_empty() && !matcher.has_path_filters() {
        return result;
    }
    for root in roots {
        for entry in WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| e.depth() == 0 || visible(&e.file_name().to_string_lossy()))
        {
            if generation.load(Ordering::Relaxed) != ticket {
                return result;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    if result.warnings.len() < 20 {
                        result.warnings.push(e.to_string());
                    }
                    continue;
                }
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry
                .path()
                .strip_prefix(&root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            // Sniff only matching filenames, not every file in the workspace.
            if !matcher.accepts_path(&path) || !matcher.matches(&path) || !supported(entry.path()) {
                continue;
            }
            result.files.push(FileMatch {
                root: root.to_string_lossy().into_owned(),
                path,
                name: entry.file_name().to_string_lossy().into_owned(),
            });
            if result.files.len() == 100 {
                return result;
            }
        }
    }
    result
}

#[tauri::command]
pub(crate) async fn search_files(
    roots: Vec<String>,
    query: String,
    spec: Option<crate::search_options::SearchSpec>,
    access: State<'_, Access>,
) -> Result<FileMatches, String> {
    let matcher = crate::search_options::Matcher::new(&query, spec)?;
    if roots.len() > 100 {
        return Err("Too many search roots.".into());
    }
    let roots = roots
        .iter()
        .map(|root| root_path(&access, root))
        .collect::<Result<Vec<_>, _>>()?;
    let generation = access.filename_generation.clone();
    let ticket = generation.fetch_add(1, Ordering::Relaxed) + 1;
    tauri::async_runtime::spawn_blocking(move || find_files_with_matcher(roots, &query, generation, ticket, matcher))
        .await
        .map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browsing_exposes_dot_entries_but_not_internal_backups_or_temporary_files() {
        let dir = tempfile::tempdir().unwrap();
        for name in [".git", ".config", ".empty", ".nova-registry-backups", "node_modules", "target"] {
            fs::create_dir(dir.path().join(name)).unwrap();
        }
        for name in [".nova", ".env", "ordinary.md", ".tmp123", ".nova.backup"] {
            fs::write(dir.path().join(name), "{}").unwrap();
        }
        let root = fs::canonicalize(dir.path()).unwrap();
        let listing = list(&root, "", 0).unwrap();
        let paths: std::collections::HashSet<_> = listing.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, [".nova", ".env", "ordinary.md"].into_iter().collect());
        let dirs: std::collections::HashSet<_> = listing.directories.iter().map(String::as_str).collect();
        assert_eq!(dirs, [".git", ".config", ".empty"].into_iter().collect());
        fs::write(dir.path().join(".config/.nova"), "{}").unwrap();
        assert!(list(&root, ".config", 0).unwrap().files.is_empty());
    }
    #[test]
    fn search_filters_apply_before_filename_limit() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("archive")).unwrap();
        for i in 0..110 {
            fs::write(temp.path().join(format!("archive/note{i}.md")), "note").unwrap();
        }
        fs::write(temp.path().join("Note.md"), "note").unwrap();
        let spec = serde_json::from_value(serde_json::json!({
            "pattern": "Note", "caseSensitive": true, "include": "", "exclude": "^archive/"
        })).unwrap();
        let result = find_files_with_matcher(vec![temp.path().to_path_buf()], "Note",
            Arc::new(AtomicU64::new(1)), 1, crate::search_options::Matcher::new("Note", Some(spec)).unwrap());
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].path, "Note.md");
    }
    #[test]
    #[ignore = "Read-only smoke test; set NOVA_TEST_FOLDER to a real large folder"]
    fn opens_real_large_folder() {
        let root =
            fs::canonicalize(std::env::var("NOVA_TEST_FOLDER").expect("NOVA_TEST_FOLDER")).unwrap();
        let started = std::time::Instant::now();
        let page = list(&root, "", 0).unwrap();
        assert!(page.files.len() + page.directories.len() <= PAGE_SIZE);
        println!(
            "Opened {}: {} files, {} directories, {:?}, next page {:?}",
            root.display(),
            page.files.len(),
            page.directories.len(),
            started.elapsed(),
            page.next_offset
        );
    }
    #[test]
    fn listing_is_shallow_and_pages_without_losing_entries() {
        let temp = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temp.path()).unwrap();
        fs::create_dir(root.join("nested")).unwrap();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("nested/deep.md"), "deep").unwrap();
        for i in 0..650 {
            fs::write(root.join(format!("{i}.md")), "note").unwrap();
        }
        let mut offset = 0;
        let mut paths = std::collections::HashSet::new();
        loop {
            let page = list(&root, "", offset).unwrap();
            assert!(page.files.len() <= PAGE_SIZE);
            assert!(!page.directories.iter().any(|p| p == "node_modules"));
            for file in page.files {
                assert!(paths.insert(file.path));
            }
            match page.next_offset {
                Some(next) => offset = next,
                None => break,
            }
        }
        assert_eq!(paths.len(), 650);
        assert_eq!(
            list(&root, "nested", 0).unwrap().files[0].path,
            "nested/deep.md"
        );
        assert!(list(&root, "../", 0).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_external_symlinks() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temp.path()).unwrap();
        std::os::unix::fs::symlink(outside.path(), root.join("link")).unwrap();
        assert!(list(&root, "link", 0).is_err());
        assert!(list(&root, "", 0).unwrap().directories.is_empty());
    }
    #[test]
    fn filename_search_reaches_unopened_directories_and_can_be_cancelled() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("nested")).unwrap();
        fs::write(temp.path().join("nested/needle.txt"), "text").unwrap();
        let generation = Arc::new(AtomicU64::new(1));
        let found = find_files(
            vec![temp.path().to_path_buf()],
            "needle",
            generation.clone(),
            1,
        );
        assert_eq!(found.files[0].path, "nested/needle.txt");
        assert!(
            find_files(vec![temp.path().to_path_buf()], "needle", generation, 0)
                .files
                .is_empty()
        );
    }
}
