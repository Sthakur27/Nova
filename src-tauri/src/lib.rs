mod speech;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, State};
use walkdir::WalkDir;

const MAX_FILE: u64 = 32 * 1024 * 1024;
#[derive(Default)]
struct Access {
    roots: Mutex<HashSet<PathBuf>>,
    writes: Mutex<()>,
    search_generation: Arc<AtomicU64>,
    quitting: AtomicBool,
}
#[derive(Serialize)]
struct NoteFile {
    path: String,
    name: String,
}
#[derive(Serialize)]
struct Workspace {
    root: String,
    name: String,
    files: Vec<NoteFile>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Bookmark {
    id: String,
    name: String,
    from: usize,
    to: usize,
    quote: String,
    #[serde(default)]
    unresolved: bool,
}
#[derive(Serialize)]
struct DocumentData {
    text: String,
    revision: String,
    bookmarks: Vec<Bookmark>,
}
#[derive(Serialize)]
struct SearchHit {
    root: String,
    path: String,
    line: usize,
    snippet: String,
}
#[derive(Serialize)]
struct BookmarkSearchHit {
    root: String,
    path: String,
    bookmark: Bookmark,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn revision(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}
fn supported(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| matches!(s.to_lowercase().as_str(), "md" | "markdown" | "txt" | "mdx"))
        .unwrap_or(false)
}
fn root_path(access: &Access, root: &str) -> Result<PathBuf, String> {
    let path = fs::canonicalize(root).map_err(err)?;
    if !access.roots.lock().map_err(err)?.contains(&path) {
        return Err("Open this folder first.".into());
    }
    Ok(path)
}
fn scoped_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative.components().any(|p| {
            matches!(
                p,
                std::path::Component::ParentDir | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("Invalid note path.".into());
    }
    let path = fs::canonicalize(root.join(relative)).map_err(err)?;
    if !path.starts_with(root) || !path.is_file() || !supported(&path) {
        return Err("This is not a supported note inside the open folder.".into());
    }
    Ok(path)
}
fn files_in(root: &Path) -> Result<Vec<NoteFile>, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0
                || !matches!(
                    e.file_name().to_str(),
                    Some(".git" | "node_modules" | "target" | ".obsidian" | ".Trash")
                )
        })
    {
        let entry = entry.map_err(err)?;
        if entry.file_type().is_file() && supported(entry.path()) {
            files.push(NoteFile {
                path: entry
                    .path()
                    .strip_prefix(root)
                    .map_err(err)?
                    .to_string_lossy()
                    .replace('\\', "/"),
                name: entry.file_name().to_string_lossy().into_owned(),
            });
            if files.len() > 50_000 {
                return Err(
                    "This prototype supports up to 50,000 notes per folder. Open a smaller folder."
                        .into(),
                );
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}
fn metadata_path(app: &tauri::AppHandle, path: &Path) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(err)?.join("bookmarks");
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.join(format!(
        "{}.json",
        revision(path.to_string_lossy().as_bytes())
    )))
}
fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Missing parent folder")?)
        .map_err(err)?;
    if let Ok(meta) = fs::metadata(path) {
        temp.as_file()
            .set_permissions(meta.permissions())
            .map_err(err)?;
    }
    temp.write_all(data).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    Ok(())
}
fn save_checked(path: &Path, text: &str, expected: &str) -> Result<String, String> {
    let existing = fs::read(path).map_err(err)?;
    if revision(&existing) != expected {
        return Err("This note changed outside Nova. Your edits are still open. Copy them somewhere safe before reopening the file.".into());
    }
    // CodeMirror uses LF internally; preserve an existing CRLF file on disk.
    let crlf = existing.windows(2).any(|p| p == b"\r\n");
    let output = if crlf {
        text.replace("\r\n", "\n").replace('\n', "\r\n")
    } else {
        text.to_owned()
    };
    atomic_write(path, output.as_bytes())?;
    Ok(revision(output.as_bytes()))
}
#[tauri::command]
async fn open_workspace(root: String, access: State<'_, Access>) -> Result<Workspace, String> {
    let path = fs::canonicalize(&root).map_err(err)?;
    if !path.is_dir() {
        return Err("Choose a folder.".into());
    }
    let scan = path.clone();
    let files = tauri::async_runtime::spawn_blocking(move || files_in(&scan))
        .await
        .map_err(err)??;
    access.roots.lock().map_err(err)?.insert(path.clone());
    Ok(Workspace {
        root: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        files,
    })
}
#[tauri::command]
async fn read_note(
    root: String,
    path: String,
    access: State<'_, Access>,
    app: tauri::AppHandle,
) -> Result<DocumentData, String> {
    let path = scoped_path(&root_path(&access, &root)?, &path)?;
    let metadata = metadata_path(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        if fs::metadata(&path).map_err(err)?.len() > MAX_FILE {
            return Err("This prototype opens text files up to 32 MiB.".into());
        }
        let bytes = fs::read(&path).map_err(err)?;
        let rev = revision(&bytes);
        let text = String::from_utf8(bytes)
            .map_err(|_| "This file is not UTF-8 text.".to_string())?
            .replace("\r\n", "\n");
        let bookmarks = if metadata.exists() {
            serde_json::from_slice(&fs::read(metadata).map_err(err)?).map_err(err)?
        } else {
            Vec::new()
        };
        Ok(DocumentData {
            text,
            revision: rev,
            bookmarks,
        })
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn save_note(
    root: String,
    path: String,
    text: String,
    revision: String,
    access: State<'_, Access>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let path = scoped_path(&root_path(&access, &root)?, &path)?;
    if text.len() as u64 > MAX_FILE {
        return Err("This prototype saves text files up to 32 MiB.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let _guard = access.writes.lock().map_err(err)?;
        save_checked(&path, &text, &revision)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn save_bookmarks(
    root: String,
    path: String,
    bookmarks: Vec<Bookmark>,
    access: State<'_, Access>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if bookmarks.len() > 10_000 {
        return Err("Too many bookmarks.".into());
    }
    let path = scoped_path(&root_path(&access, &root)?, &path)?;
    let target = metadata_path(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let _guard = access.writes.lock().map_err(err)?;
        atomic_write(&target, &serde_json::to_vec(&bookmarks).map_err(err)?)
    })
    .await
    .map_err(err)?
}
#[derive(Serialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
    bookmarks: Vec<BookmarkSearchHit>,
    warnings: Vec<String>,
}
fn scan_search(
    roots: Vec<PathBuf>,
    query: String,
    generation: Arc<AtomicU64>,
    ticket: u64,
    metadata_dir: PathBuf,
) -> SearchResponse {
    let mut response = SearchResponse {
        hits: Vec::new(),
        bookmarks: Vec::new(),
        warnings: Vec::new(),
    };
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return response;
    }
    for root in roots {
        if generation.load(Ordering::Relaxed) != ticket {
            break;
        }
        let files = match files_in(&root) {
            Ok(files) => files,
            Err(error) => {
                response
                    .warnings
                    .push(format!("{}: {error}", root.display()));
                continue;
            }
        };
        for note in files {
            if generation.load(Ordering::Relaxed) != ticket {
                return response;
            }
            let path = root.join(&note.path);
            if fs::metadata(&path)
                .map(|m| m.len() > MAX_FILE)
                .unwrap_or(true)
            {
                continue;
            }
            let canonical = match fs::canonicalize(&path) {
                Ok(path) => path,
                Err(_) => continue,
            };
            let metadata = metadata_dir.join(format!(
                "{}.json",
                revision(canonical.to_string_lossy().as_bytes())
            ));
            if metadata.exists() && response.bookmarks.len() < 80 {
                match fs::read(&metadata)
                    .map_err(err)
                    .and_then(|bytes| serde_json::from_slice::<Vec<Bookmark>>(&bytes).map_err(err))
                {
                    Ok(bookmarks) => {
                        for bookmark in bookmarks {
                            if bookmark.name.to_lowercase().contains(&query)
                                || bookmark.quote.to_lowercase().contains(&query)
                            {
                                response.bookmarks.push(BookmarkSearchHit {
                                    root: root.to_string_lossy().into_owned(),
                                    path: note.path.clone(),
                                    bookmark,
                                });
                                if response.bookmarks.len() == 80 {
                                    break;
                                }
                            }
                        }
                    }
                    Err(error) => response.warnings.push(format!(
                        "Couldn't read bookmarks for {}: {error}",
                        path.display()
                    )),
                }
            }
            if response.hits.len() == 80 {
                continue;
            }
            let file = match fs::File::open(&path) {
                Ok(file) => file,
                Err(_) => {
                    response
                        .warnings
                        .push(format!("Couldn't read {}", path.display()));
                    continue;
                }
            };
            for (i, line) in BufReader::new(file).lines().enumerate() {
                if i % 128 == 0 && generation.load(Ordering::Relaxed) != ticket {
                    return response;
                }
                let Ok(line) = line else { break };
                if line.to_lowercase().contains(&query) {
                    response.hits.push(SearchHit {
                        root: root.to_string_lossy().into_owned(),
                        path: note.path.clone(),
                        line: i + 1,
                        snippet: line.chars().take(300).collect(),
                    });
                    if response.hits.len() == 80 {
                        break;
                    }
                }
            }
        }
    }
    response
}
#[tauri::command]
async fn search_notes(
    app: tauri::AppHandle,
    roots: Vec<String>,
    query: String,
    access: State<'_, Access>,
) -> Result<SearchResponse, String> {
    if roots.len() > 100 {
        return Err("Search supports up to 100 folders.".into());
    }
    let mut paths = Vec::new();
    let mut warnings = Vec::new();
    for root in roots {
        match root_path(&access, &root) {
            Ok(path) => paths.push(path),
            Err(error) => warnings.push(format!("{root}: {error}")),
        }
    }
    let generation = access.search_generation.clone();
    let ticket = generation.fetch_add(1, Ordering::Relaxed) + 1;
    let metadata_dir = app.path().app_data_dir().map_err(err)?.join("bookmarks");
    let mut response = tauri::async_runtime::spawn_blocking(move || {
        scan_search(paths, query, generation, ticket, metadata_dir)
    })
    .await
    .map_err(err)?;
    response.warnings.extend(warnings);
    Ok(response)
}
fn explorer_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(err)?;
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.join("explorer.json"))
}
#[tauri::command]
async fn load_explorer(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = explorer_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !path.exists() {
            return Ok(serde_json::Value::Null);
        }
        if fs::metadata(&path).map_err(err)?.len() > 256 * 1024 {
            return Err("Explorer preferences are too large.".into());
        }
        serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn save_explorer(
    preferences: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(&preferences).map_err(err)?;
    if bytes.len() > 256 * 1024 {
        return Err("Explorer preferences are too large.".into());
    }
    let path = explorer_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let _guard = access.writes.lock().map_err(err)?;
        atomic_write(&path, &bytes)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle, access: State<'_, Access>) {
    access.quitting.store(true, Ordering::Relaxed);
    app.exit(0);
}
pub fn run() {
    tauri::Builder::default()
        .menu(|app| {
            Menu::with_items(
                app,
                &[
                    &Submenu::with_items(
                        app,
                        "Nova",
                        true,
                        &[
                            &PredefinedMenuItem::about(app, Some("About Nova"), None)?,
                            &PredefinedMenuItem::separator(app)?,
                            &MenuItem::with_id(
                                app,
                                "nova-quit",
                                "Quit Nova",
                                true,
                                Some("CmdOrCtrl+Q"),
                            )?,
                        ],
                    )?,
                    &Submenu::with_items(
                        app,
                        "Edit",
                        true,
                        &[
                            &PredefinedMenuItem::undo(app, None)?,
                            &PredefinedMenuItem::redo(app, None)?,
                            &PredefinedMenuItem::separator(app)?,
                            &PredefinedMenuItem::cut(app, None)?,
                            &PredefinedMenuItem::copy(app, None)?,
                            &PredefinedMenuItem::paste(app, None)?,
                            &PredefinedMenuItem::select_all(app, None)?,
                        ],
                    )?,
                ],
            )
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "nova-quit" {
                let _ = app.emit("nova:request-quit", ());
            }
        })
        .manage(Access::default())
        .manage(speech::SpeechState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            read_note,
            save_note,
            save_bookmarks,
            search_notes,
            load_explorer,
            save_explorer,
            quit_app,
            speech::speech_status,
            speech::speech_download,
            speech::speech_start,
            speech::speech_finish,
            speech::speech_cancel
        ])
        .build(tauri::generate_context!())
        .expect("Unable to run Nova")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<Access>().quitting.load(Ordering::Relaxed)
                    && !app.webview_windows().is_empty()
                {
                    api.prevent_exit();
                    let _ = app.emit("nova:request-quit", ());
                }
            }
        });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_identifies_same_named_files_in_distinct_roots() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        fs::write(a.path().join("note.md"), "needle in A").unwrap();
        fs::write(b.path().join("note.md"), "needle in B").unwrap();
        let response = scan_search(
            vec![a.path().to_owned(), b.path().to_owned()],
            "needle".into(),
            Arc::new(AtomicU64::new(1)),
            1,
            a.path().join("bookmarks"),
        );
        assert_eq!(response.hits.len(), 2);
        assert_ne!(response.hits[0].root, response.hits[1].root);
        assert_eq!(response.hits[0].path, response.hits[1].path);
    }
    #[test]
    fn searches_bookmark_names_and_quotes_even_after_text_limit() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let metadata = tempfile::tempdir().unwrap();
        fs::write(root.join("a.md"), "needle\n".repeat(100)).unwrap();
        let file = root.join("z.md");
        fs::write(&file, "a passage").unwrap();
        let mark = Bookmark {
            id: "user-created".into(),
            name: "My NEEDLE".into(),
            from: 0,
            to: 9,
            quote: "a passage".into(),
            unresolved: false,
        };
        let target = metadata.path().join(format!(
            "{}.json",
            revision(file.to_string_lossy().as_bytes())
        ));
        fs::write(&target, serde_json::to_vec(&vec![mark]).unwrap()).unwrap();
        for query in ["needle", "PASSAGE"] {
            let result = scan_search(
                vec![root.clone()],
                query.into(),
                Arc::new(AtomicU64::new(1)),
                1,
                metadata.path().to_owned(),
            );
            assert_eq!(result.bookmarks.len(), 1);
            assert_eq!(result.bookmarks[0].bookmark.id, "user-created");
            assert_eq!(result.bookmarks[0].path, "z.md");
            if query == "needle" {
                assert_eq!(result.hits.len(), 80);
            }
        }
        fs::remove_file(target).unwrap();
        let result = scan_search(
            vec![root],
            "needle".into(),
            Arc::new(AtomicU64::new(1)),
            1,
            metadata.path().to_owned(),
        );
        assert!(result.bookmarks.is_empty());
    }

    #[test]
    fn rejects_stale_save_and_preserves_crlf() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.md");
        fs::write(&file, b"old\r\ntext\r\n").unwrap();
        let rev = revision(&fs::read(&file).unwrap());
        save_checked(&file, "new\ntext\n", &rev).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"new\r\ntext\r\n");
        assert!(save_checked(&file, "overwrite", &rev).is_err());
        assert_eq!(fs::read(&file).unwrap(), b"new\r\ntext\r\n");
    }
    #[test]
    fn folder_scope_and_filtering() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("note.md"), "a").unwrap();
        fs::write(root.join("image.png"), "b").unwrap();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/hidden.md"), "c").unwrap();
        assert_eq!(files_in(&root).unwrap().len(), 1);
        assert!(scoped_path(&root, "../outside.md").is_err());
        assert!(scoped_path(&root, "image.png").is_err());
        assert!(scoped_path(&root, "note.md").is_ok());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let file = outside.path().join("secret.md");
        fs::write(&file, "private").unwrap();
        std::os::unix::fs::symlink(file, dir.path().join("link.md")).unwrap();
        assert!(scoped_path(&fs::canonicalize(dir.path()).unwrap(), "link.md").is_err());
        assert!(files_in(dir.path()).unwrap().is_empty());
    }
}
