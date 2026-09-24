mod registry_editor;
#[cfg(desktop)]
mod workspace_replace;
mod search_options;
#[cfg(any(mobile, test))]
mod mobile_storage;
#[cfg(desktop)]
mod background;
#[cfg(desktop)]
mod speech;
mod sync_policy;
mod drive_registry;
mod local_tree;
mod local_changes;
#[cfg(any(desktop, target_os = "ios"))]
mod drive_auth;
#[cfg(any(desktop, target_os = "ios"))]
mod drive_upload;
#[cfg(desktop)]
mod terminal;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
#[cfg(desktop)]
use std::sync::atomic::AtomicBool;
#[cfg(desktop)]
use tauri::Emitter;
use tauri::{Manager, State};
use walkdir::WalkDir;

const MAX_FILE: u64 = 32 * 1024 * 1024;
// Includes lightweight sessions for recent folders, never document contents.
const MAX_EXPLORER: usize = 4 * 1024 * 1024;
#[derive(Default)]
struct Access {
    roots: Mutex<HashSet<PathBuf>>,
    writes: Mutex<()>,
    search_generation: Arc<AtomicU64>,
    filename_generation: Arc<AtomicU64>,
    #[cfg(desktop)]
    quitting: AtomicBool,
    #[cfg(desktop)]
    updating: Mutex<bool>,
    #[cfg(mobile)]
    mobile_root: Mutex<Option<PathBuf>>,
}
#[derive(Serialize)]
struct NoteFile {
    path: String,
    name: String,
}
#[derive(Serialize)]
struct Workspace {
    #[serde(rename = "cloudSpace", skip_serializing_if = "Option::is_none")]
    cloud_space: Option<serde_json::Value>,
    root: String,
    name: String,
    files: Vec<NoteFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    directories: Option<Vec<String>>,
    #[serde(rename = "directoryPages", skip_serializing_if = "Option::is_none")]
    directory_pages: Option<std::collections::HashMap<String, usize>>,
    warnings: Vec<String>,
    starred: Vec<String>,
    #[serde(rename = "syncPolicy")]
    sync_policy: sync_policy::SyncPolicy,
    #[serde(rename = "syncError", skip_serializing_if = "Option::is_none")]
    sync_error: Option<String>,
    #[serde(rename = "starsError", skip_serializing_if = "Option::is_none")]
    stars_error: Option<String>,
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
    // Nova's workspace metadata is never an editable note.
    if path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name == ".nova" || name.starts_with(".nova.") || name.starts_with(".tmp")) { return false; }
    if path.extension().and_then(|s| s.to_str())
        .is_some_and(|s| matches!(s.to_lowercase().as_str(), "md" | "markdown" | "txt" | "mdx")) {
        return true;
    }
    // Custom extensions are text files too. Sniff a bounded prefix rather than
    // loading every file in a folder; read_note validates the entire UTF-8 file.
    let Ok(mut file) = fs::File::open(path) else { return false; };
    let mut buffer = [0; 8192];
    let Ok(length) = file.read(&mut buffer) else { return false; };
    let bytes = &buffer[..length];
    !bytes.contains(&0) && match std::str::from_utf8(bytes) {
        Ok(_) => true,
        Err(error) => error.error_len().is_none() && length == buffer.len(),
    }
}
fn normalize_extension(value: &str) -> Result<String, String> {
    let extension = value.trim().strip_prefix('.').unwrap_or(value.trim());
    if extension.is_empty() || extension.chars().count() > 64
        || extension.chars().any(|c| c.is_whitespace() || c.is_control() || "/\\:*?\"<>|".contains(c))
        || extension.split('.').any(|part| part.is_empty()) {
        return Err("Enter an extension such as .txt, .md, or .json without spaces or filename separators.".into());
    }
    Ok(format!(".{extension}"))
}
fn root_path(access: &Access, root: &str) -> Result<PathBuf, String> {
    #[cfg(mobile)]
    {
        let notes = access.mobile_root.lock().map_err(err)?.clone().ok_or("Notes storage is not ready.")?;
        return mobile_storage::resolve(&notes, root);
    }
    #[cfg(desktop)]
    let path = fs::canonicalize(root).map_err(err)?;
    #[cfg(desktop)]
    {
        if !access.roots.lock().map_err(err)?.contains(&path) {
            return Err("Open this folder first.".into());
        }
        Ok(path)
    }
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
                    Some(".git" | "node_modules" | "target" | ".obsidian" | ".Trash" | ".nova-registry-backups")
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
    #[cfg(mobile)]
    let storage_root = app.path().app_data_dir().map_err(err)?;
    #[cfg(mobile)]
    let path = mobile_storage::bookmark_identity(&storage_root, path)?;
    Ok(dir.join(format!("{}.json", revision(path.to_string_lossy().as_bytes()))))
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
// Keep unrelated settings in the root registry intact.
fn read_registry(root: &Path) -> Result<serde_json::Value, String> {
    let path = root.join(".nova");
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(serde_json::json!({})),
        Err(error) => return Err(err(error)),
        Ok(meta) if !meta.is_file() || meta.len() > 4 * 1024 * 1024 =>
            return Err(".nova must be a regular JSON file under 4 MiB.".into()),
        Ok(_) => {}
    }
    let mut value: serde_json::Value = serde_json::from_slice(&fs::read(path).map_err(err)?)
        .map_err(|error| format!("Could not read .nova: {error}"))?;
    if !value.is_object() { return Err(".nova must contain a JSON object.".into()); }
    registry_stars(&value)?;
    drive_registry::convert(&mut value)?;
    Ok(value)
}
fn registry_stars(value: &serde_json::Value) -> Result<Vec<String>, String> {
    match value.get("starred") {
        None => Ok(Vec::new()),
        Some(stars) => serde_json::from_value(stars.clone())
            .map_err(|_| ".nova starred must be an array of file paths.".into()),
    }
}
fn write_registry(root: &Path, mut registry: serde_json::Value, stars: &[String]) -> Result<(), String> {
    drive_registry::convert(&mut registry)?;
    registry["starred"] = serde_json::json!(stars);
    let bytes = serde_json::to_vec_pretty(&registry).map_err(err)?;
    if bytes.len() > 4 * 1024 * 1024 { return Err(".nova registry is too large.".into()); }
    let path = root.join(".nova");
    if let Ok(old) = fs::read(&path) {
        if serde_json::from_slice::<serde_json::Value>(&old).ok().is_some_and(|v| v["driveFiles"].is_object()) {
            use std::io::Write;
            let backups = root.parent().ok_or("Missing registry backup directory")?.join(".nova-registry-backups");
            fs::create_dir_all(&backups).map_err(err)?;
            let backup_path = backups.join(format!("{}.json", revision(root.to_string_lossy().as_bytes())));
            match fs::OpenOptions::new().write(true).create_new(true).open(backup_path) {
                Ok(mut backup) => { backup.write_all(&old).map_err(err)?; backup.sync_all().map_err(err)?; }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(err(error)),
            }
        }
    }
    // Polling must not replace the registry (or trigger file watchers) without a delta.
    if fs::read(&path).ok().as_deref() == Some(bytes.as_slice()) { return Ok(()); }
    atomic_write(&path, &bytes)
}
fn update_star(root: &Path, path: &str, starred: bool) -> Result<Vec<String>, String> {
    scoped_path(root, path)?;
    let registry = read_registry(root)?;
    let mut stars = registry_stars(&registry)?;
    stars.retain(|star| star != path);
    if starred { stars.push(path.to_owned()); }
    stars.sort();
    stars.dedup();
    write_registry(root, registry, &stars)?;
    Ok(stars)
}
#[tauri::command]
fn set_file_star(root: String, path: String, starred: bool, access: State<'_, Access>) -> Result<Vec<String>, String> {
    let _guard = access.writes.lock().map_err(err)?;
    update_star(&root_path(&access, &root)?, &path, starred)
}
#[tauri::command]
fn set_sync_choice(root: String, path: String, choice: String, access: State<'_, Access>) -> Result<sync_policy::SyncPolicy, String> {
    let _guard = access.writes.lock().map_err(err)?;
    sync_policy::update(&root_path(&access, &root)?, &path, &choice)
}
#[tauri::command]
async fn open_workspace(root: String, access: State<'_, Access>) -> Result<Workspace, String> {
    #[cfg(desktop)]
    let path = fs::canonicalize(&root).map_err(err)?;
    #[cfg(mobile)]
    let path = root_path(&access, &root)?;
    if !path.is_dir() {
        return Err("Choose a folder.".into());
    }
    let cloud_space = read_registry(&path)?.get("cloudSpace").filter(|v| v.is_object()).cloned();
    let scan = path.clone();
    let cloud = cloud_space.is_some();
    let (files, directories, directory_pages, warnings) = tauri::async_runtime::spawn_blocking(move || {
        if cloud {
            let mut files = files_in(&scan)?;
            if fs::symlink_metadata(scan.join(".nova")).is_ok_and(|m| m.is_file()) {
                files.push(NoteFile { path: ".nova".into(), name: ".nova".into() });
            }
            Ok((files, None, None, Vec::new()))
        } else {
            let listing = local_tree::list(&scan, "", 0)?;
            let mut pages = std::collections::HashMap::new();
            if let Some(offset) = listing.next_offset { pages.insert(String::new(), offset); }
            Ok::<_, String>((listing.files, Some(listing.directories), Some(pages), listing.warnings))
        }
    })
        .await
        .map_err(err)??;
    access.roots.lock().map_err(err)?.insert(path.clone());
    let (starred, stars_error) = match read_registry(&path).and_then(|value| registry_stars(&value)) {
        Ok(stars) => (stars, None),
        Err(error) => (Vec::new(), Some(error)),
    };
    let (sync_policy, sync_error) = match read_registry(&path).and_then(|value| sync_policy::read(&value)) {
        Ok(policy) => (policy, None),
        Err(error) => (sync_policy::SyncPolicy::default(), Some(error)),
    };
    let display_name = cloud_space.as_ref().and_then(|v| v["name"].as_str()).map(str::to_owned);
    Ok(Workspace {
        directories, directory_pages, warnings,
        cloud_space,
        sync_policy,
        sync_error,
        starred,
        stars_error,
        #[cfg(mobile)]
        root: root.clone(),
        #[cfg(mobile)]
        name: display_name.unwrap_or_else(|| if root == "mobile" { "On this device".into() } else { path.file_name().unwrap_or_default().to_string_lossy().into_owned() }),
        #[cfg(desktop)]
        root: path.to_string_lossy().into_owned(),
        #[cfg(desktop)]
        name: display_name.unwrap_or_else(|| path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned()),
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
#[cfg(test)]
fn scan_search(
    roots: Vec<PathBuf>,
    query: String,
    generation: Arc<AtomicU64>,
    ticket: u64,
    metadata_dir: PathBuf,
) -> SearchResponse {
    scan_search_with_matcher(roots, query.clone(), generation, ticket, metadata_dir,
        search_options::Matcher::new(&query, None).unwrap())
}
fn scan_search_with_matcher(
    roots: Vec<PathBuf>,
    query: String,
    generation: Arc<AtomicU64>,
    ticket: u64,
    metadata_dir: PathBuf,
    matcher: search_options::Matcher,
) -> SearchResponse {
    let mut response = SearchResponse {
        hits: Vec::new(),
        bookmarks: Vec::new(),
        warnings: Vec::new(),
    };
    // An empty query lists all bookmark metadata without reading note text.
    let listing = query.trim().is_empty();
    for root in roots {
        if generation.load(Ordering::Relaxed) != ticket {
            break;
        }
        for entry in WalkDir::new(&root).follow_links(false).into_iter()
            .filter_entry(|e| e.depth() == 0 || matcher.visible_entry(&e.file_name().to_string_lossy())) {
            if generation.load(Ordering::Relaxed) != ticket { return response; }
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    if response.warnings.len() < 20 { response.warnings.push(error.to_string()); }
                    continue;
                }
            };
            if !entry.file_type().is_file() { continue; }
            let path = entry.path().to_path_buf();
            let note = NoteFile { path: path.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/"), name: entry.file_name().to_string_lossy().into_owned() };
            if !matcher.accepts_path(&note.path) { continue; }
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
            #[cfg(mobile)]
            let canonical = match mobile_storage::bookmark_identity(metadata_dir.parent().unwrap(), &canonical) {
                Ok(path) => path.to_path_buf(),
                Err(_) => continue,
            };
            let metadata = metadata_dir.join(format!(
                "{}.json",
                revision(canonical.to_string_lossy().as_bytes())
            ));
            if metadata.exists() && (listing || response.bookmarks.len() < 80) {
                match fs::read(&metadata)
                    .map_err(err)
                    .and_then(|bytes| serde_json::from_slice::<Vec<Bookmark>>(&bytes).map_err(err))
                {
                    Ok(bookmarks) => {
                        for bookmark in bookmarks {
                            if matcher.matches(&bookmark.name)
                                || matcher.matches(&bookmark.quote)
                            {
                                response.bookmarks.push(BookmarkSearchHit {
                                    root: root.to_string_lossy().into_owned(),
                                    path: note.path.clone(),
                                    bookmark,
                                });
                                if !listing && response.bookmarks.len() == 80 {
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
            if !listing && response.hits.len() == 80 && response.bookmarks.len() == 80 { return response; }
            if listing || response.hits.len() == 80 || !(supported(&path) || note.path == ".nova") {
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
                if matcher.matches(&line) {
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
fn cancel_search(filenames: bool, access: State<'_, Access>) {
    let generation = if filenames { &access.filename_generation } else { &access.search_generation };
    generation.fetch_add(1, Ordering::Relaxed);
}
#[tauri::command]
async fn search_notes(
    app: tauri::AppHandle,
    roots: Vec<String>,
    query: String,
    spec: Option<search_options::SearchSpec>,
    access: State<'_, Access>,
) -> Result<SearchResponse, String> {
    let matcher = search_options::Matcher::new(&query, spec)?;
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
    let generation = if query.trim().is_empty() {
        Arc::new(AtomicU64::new(0))
    } else {
        access.search_generation.clone()
    };
    let ticket = generation.fetch_add(1, Ordering::Relaxed) + 1;
    let metadata_dir = app.path().app_data_dir().map_err(err)?.join("bookmarks");
    let mut response = tauri::async_runtime::spawn_blocking(move || {
        scan_search_with_matcher(paths, query, generation, ticket, metadata_dir, matcher)
    })
    .await
    .map_err(err)?;
    #[cfg(mobile)]
    {
        let data = app.path().app_data_dir().map_err(err)?;
        for hit in &mut response.hits { hit.root = mobile_storage::identity(&data, Path::new(&hit.root))?; }
        for hit in &mut response.bookmarks { hit.root = mobile_storage::identity(&data, Path::new(&hit.root))?; }
    }
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
        if fs::metadata(&path).map_err(err)?.len() > MAX_EXPLORER as u64 {
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
    if bytes.len() > MAX_EXPLORER {
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
// Recovery paths are derived from identity, never from caller-provided paths.
fn draft_path(directory: &Path, root: &str, path: &str) -> PathBuf {
    let identity = serde_json::to_vec(&(root, path)).expect("string identity");
    directory.join(format!("{}.json", revision(&identity)))
}
#[tauri::command]
async fn load_draft(app: tauri::AppHandle, root: String, path: String) -> Result<serde_json::Value, String> {
    let directory = app.path().app_data_dir().map_err(err)?.join("drafts");
    tauri::async_runtime::spawn_blocking(move || {
        let file = draft_path(&directory, &root, &path);
        match fs::read(file) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(err),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(serde_json::Value::Null),
            Err(error) => Err(err(error)),
        }
    }).await.map_err(err)?
}
#[tauri::command]
async fn save_draft(app: tauri::AppHandle, root: String, path: String, draft: serde_json::Value) -> Result<(), String> {
    let directory = app.path().app_data_dir().map_err(err)?.join("drafts");
    tauri::async_runtime::spawn_blocking(move || {
        let access = app.state::<Access>();
        let _guard = access.writes.lock().map_err(err)?;
        fs::create_dir_all(&directory).map_err(err)?;
        atomic_write(&draft_path(&directory, &root, &path), &serde_json::to_vec(&draft).map_err(err)?)
    }).await.map_err(err)?
}

fn create_untitled(root: &Path, extension: &str) -> Result<String, String> {
    let extension = normalize_extension(extension)?;
    for number in 1..10_000 {
        let name = if number == 1 { format!("Untitled{extension}") } else { format!("Untitled {number}{extension}") };
        match fs::OpenOptions::new().write(true).create_new(true).open(root.join(&name)) {
            Ok(_) => return Ok(name),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(err(error)),
        }
    }
    Err("Too many untitled notes in this folder.".into())
}
#[tauri::command]
fn create_note(root: String, extension: Option<String>, access: State<'_, Access>) -> Result<String, String> {
    let _guard = access.writes.lock().map_err(err)?;
    create_untitled(&root_path(&access, &root)?, extension.as_deref().unwrap_or(".md"))
}
fn rename_file(source: &Path, name: &str) -> Result<PathBuf, String> {
    if name.trim().is_empty() || name == "." || name == ".." || name == ".nova"
        || name.chars().any(|c| c.is_control() || "/\\:*?\"<>|".contains(c)) {
        return Err("Enter a valid filename without filename separators.".into());
    }
    let target = source.with_file_name(name);
    if target == source { return Ok(target); }
    // On case-insensitive volumes the new spelling resolves to the source itself.
    // Require the same canonical path and no separate directory entry: a symlink
    // or another hard link to this file must still count as a collision.
    if fs::symlink_metadata(&target).map(|metadata| metadata.is_file()).unwrap_or(false)
        && fs::canonicalize(&target).map_err(err)? == fs::canonicalize(source).map_err(err)?
        && !fs::read_dir(source.parent().ok_or("Missing parent folder")?).map_err(err)?
            .collect::<Result<Vec<_>, _>>().map_err(err)?
            .iter().any(|entry| entry.file_name() == std::ffi::OsStr::new(name)) {
        fs::rename(source, &target).map_err(err)?;
        return Ok(target);
    }
    // Creating a link fails if the destination exists, so an existing note is never overwritten.
    fs::hard_link(source, &target).map_err(err)?;
    if let Err(error) = fs::remove_file(source) {
        let _ = fs::remove_file(&target);
        return Err(err(error));
    }
    Ok(target)
}
fn rename_starred_file(root: &Path, source: &Path, name: &str) -> Result<PathBuf, String> {
    let mut registry = read_registry(root)?;
    sync_policy::read(&registry)?;
    let mut stars = registry_stars(&registry)?;
    let old = source.strip_prefix(root).map_err(err)?.to_string_lossy().replace('\\', "/");
    let target = rename_file(source, name)?;
    if target == source { return Ok(target); }
    let next = target.strip_prefix(root).map_err(err)?.to_string_lossy().replace('\\', "/");
    for star in &mut stars { if star == &old { *star = next.clone(); } }
    let result = sync_policy::relocate(&mut registry, &old, Some(&next))
        .and_then(|_| write_registry(root, registry, &stars));
    if let Err(error) = result {
        fs::rename(&target, source).map_err(err)?;
        return Err(error);
    }
    Ok(target)
}
#[tauri::command]
fn rename_note(root: String, path: String, name: String, access: State<'_, Access>, app: tauri::AppHandle) -> Result<String, String> {
    let _guard = access.writes.lock().map_err(err)?;
    let root = root_path(&access, &root)?;
    let source = scoped_path(&root, &path)?;
    let old_metadata = metadata_path(&app, &source)?;
    let target = rename_starred_file(&root, &source, &name)?;
    if target != source && old_metadata.exists() {
        let result = metadata_path(&app, &target).and_then(|new_metadata| fs::rename(&old_metadata, new_metadata).map_err(err));
        if let Err(error) = result {
            let _ = rename_starred_file(&root, &target, source.file_name().unwrap().to_str().ok_or("Invalid filename")?);
            return Err(error);
        }
    }
    Ok(target.strip_prefix(root).map_err(err)?.to_string_lossy().replace('\\', "/"))
}
fn move_target(root: &Path, source: &Path, directory: &str) -> Result<PathBuf, String> {
    let relative = Path::new(directory);
    if relative.is_absolute() || relative.components().any(|c| !matches!(c, std::path::Component::Normal(_) | std::path::Component::CurDir)) {
        return Err("Choose a folder inside this workspace.".into());
    }
    let parent = fs::canonicalize(root.join(relative)).map_err(err)?;
    if !parent.starts_with(root) || !parent.is_dir() { return Err("Choose an existing folder inside this workspace.".into()); }
    Ok(parent.join(source.file_name().ok_or("Invalid filename")?))
}
#[tauri::command]
fn move_note(root: String, path: String, directory: String, access: State<'_, Access>, app: tauri::AppHandle) -> Result<String, String> {
    let _guard = access.writes.lock().map_err(err)?;
    let root = root_path(&access, &root)?;
    let source = scoped_path(&root, &path)?;
    let target = move_target(&root, &source, &directory)?;
    let next = target.strip_prefix(&root).map_err(err)?.to_string_lossy().replace('\\', "/");
    if target == source { return Ok(next); }
    let registry = read_registry(&root)?;
    let stars = registry_stars(&registry)?;
    let updated: Vec<String> = stars.iter().map(|p| if p == &path { next.clone() } else { p.clone() }).collect();
    let mut next_registry = registry.clone();
    sync_policy::relocate(&mut next_registry, &path, Some(&next))?;
    let old_meta = metadata_path(&app, &source)?;
    let new_meta = metadata_path(&app, &target)?;
    fs::hard_link(&source, &target).map_err(err)?;
    let result = (|| {
        if old_meta.exists() { atomic_write(&new_meta, &fs::read(&old_meta).map_err(err)?)?; }
        write_registry(&root, next_registry, &updated)?;
        fs::remove_file(&source).map_err(err)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&target);
        let _ = fs::remove_file(&new_meta);
        let _ = write_registry(&root, registry, &stars);
        return Err(error);
    }
    let _ = fs::remove_file(old_meta);
    Ok(next)
}
fn is_untitled(path: &Path) -> bool {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    let stem = name.split_once('.').map(|(stem, _)| stem).unwrap_or("");
    stem == "Untitled" || stem.strip_prefix("Untitled ")
        .and_then(|number| number.parse::<u32>().ok())
        .is_some_and(|number| (2..10_000).contains(&number))
}
// Check while holding Access::writes, immediately before deleting the file.
fn is_empty_untitled(path: &Path) -> Result<bool, String> {
    if !is_untitled(path) { return Ok(false); }
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.is_file() && metadata.len() == 0),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(err(error)),
    }
}
#[tauri::command]
fn delete_note(root: String, path: String, only_empty_untitled: Option<bool>, access: State<'_, Access>, app: tauri::AppHandle) -> Result<bool, String> {
    let _guard = access.writes.lock().map_err(err)?;
    let root = root_path(&access, &root)?;
    let source = scoped_path(&root, &path)?;
    if only_empty_untitled.unwrap_or(false) && !is_empty_untitled(&source)? {
        return Ok(false);
    }
    let metadata = metadata_path(&app, &source)?;
    let registry = read_registry(&root)?;
    let stars = registry_stars(&registry)?;
    let updated: Vec<String> = stars.iter().filter(|p| *p != &path).cloned().collect();
    let mut next_registry = registry.clone();
    sync_policy::relocate(&mut next_registry, &path, None)?;
    write_registry(&root, next_registry, &updated)?;
    if let Err(error) = fs::remove_file(source) {
        let _ = write_registry(&root, registry, &stars);
        return Err(err(error));
    }
    let _ = fs::remove_file(metadata);
    Ok(true)
}
#[cfg(desktop)]
#[tauri::command]
fn reveal_note(root: String, path: String, access: State<'_, Access>) -> Result<(), String> {
    let source = scoped_path(&root_path(&access, &root)?, &path)?;
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg("-R").arg(&source).status().map_err(err)?;
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("explorer.exe").arg(format!("/select,{}", source.display())).status().map_err(err)?;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let status = std::process::Command::new("xdg-open").arg(source.parent().ok_or("Missing parent")?).status().map_err(err)?;
    if !status.success() { return Err("Could not open the file location.".into()); }
    Ok(())
}
#[cfg(desktop)]
#[tauri::command]
fn new_window(app: tauri::AppHandle, root: Option<String>) -> Result<(), String> {
    let updating = app.state::<Access>();
    let guard = updating.updating.lock().map_err(err)?;
    if *guard { return Err("An update is being installed.".into()); }
    static WINDOW_ID: AtomicU64 = AtomicU64::new(1);
    let mut config = app.config().app.windows[0].clone();
    config.label = format!("nova-{}", WINDOW_ID.fetch_add(1, Ordering::Relaxed));
    let mut builder = tauri::WebviewWindowBuilder::from_config(&app, &config).map_err(err)?;
    if let Some(root) = root {
        let path = fs::canonicalize(root).map_err(err)?;
        if !path.is_dir() { return Err("Choose a folder.".into()); }
        let root = serde_json::to_string(&path.to_string_lossy()).map_err(err)?;
        builder = builder.initialization_script(format!("window.__NOVA_OPEN_FOLDER__ = {root};"));
    }
    let window = builder.build().map_err(err)?;
    configure_window_menu(&window).map_err(err)?;
    Ok(())
}

fn configure_window_menu(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    // The Windows menu strip exposes the desktop on transparent windows.
    // Hide only the strip, retaining the registered menu and its accelerators.
    #[cfg(target_os = "windows")]
    window.hide_menu()?;
    #[cfg(not(target_os = "windows"))]
    let _ = window;
    Ok(())
}
#[cfg(desktop)]
#[tauri::command]
fn quit_app(app: tauri::AppHandle, access: State<'_, Access>) {
    access.quitting.store(true, Ordering::Relaxed);
    app.exit(0);
}
#[cfg(desktop)]
#[tauri::command]
fn open_readme() -> Result<(), String> {
    webbrowser::open("https://github.com/Sthakur27/Nova/blob/main/README.md")
        .map_err(|_| "Could not open your default browser.".to_string())
}
#[cfg(desktop)]
#[tauri::command]
fn begin_update(app: tauri::AppHandle, access: State<'_, Access>) -> Result<(), String> {
    let mut updating = access.updating.lock().map_err(err)?;
    if *updating { return Err("An update is already being installed.".into()); }
    if app.webview_windows().len() != 1 {
        return Err("Close other Nova windows before restarting to update. Their drafts will be preserved when you close them.".into());
    }
    *updating = true;
    Ok(())
}
#[cfg(desktop)]
#[tauri::command]
fn cancel_update(access: State<'_, Access>) {
    if let Ok(mut updating) = access.updating.lock() { *updating = false; }
}
#[cfg(desktop)]
#[tauri::command]
fn restart_after_update(app: tauri::AppHandle, access: State<'_, Access>) -> Result<(), String> {
    if !*access.updating.lock().map_err(err)? { return Err("No update is being installed.".into()); }
    access.quitting.store(true, Ordering::Relaxed);
    app.restart();
}
#[cfg(desktop)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            for window in app.webview_windows().values() {
                configure_window_menu(window)?;
            }
            Ok(())
        })
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
                            #[cfg(target_os = "macos")]
                            &MenuItem::with_id(app, "nova-dictate", "Dictate", true, Some("Cmd+Shift+D"))?,
                            &MenuItem::with_id(app, "nova-select-all", "Select All", true, Some("CmdOrCtrl+A"))?,
                        ],
                    )?,
                ],
            )
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "nova-quit" {
                let _ = app.emit("nova:request-quit", ());
            } else if event.id().as_ref() == "nova-dictate" {
                if let Some(window) = app.webview_windows().values().find(|window| window.is_focused().unwrap_or(false)) {
                    let _ = app.emit_to(window.label(), "nova:dictate", ());
                }
            } else if event.id().as_ref() == "nova-select-all" {
                // WebKit's native selectAll can stop at an editable list block.
                // Let the focused editor select its complete document instead.
                let windows = app.webview_windows();
                let target = windows.values().find(|window| window.is_focused().unwrap_or(false))
                    .or_else(|| if windows.len() == 1 { windows.values().next() } else { None });
                if let Some(window) = target {
                    let _ = app.emit_to(window.label(), "nova:select-all", ());
                }
            }
        })
        .manage(terminal::Terminals::default())
        .manage(Access::default())
        .manage(speech::SpeechState::default())
        .manage(drive_auth::DriveAuth::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            background::set_background_blur,
            drive_upload::cloud_spaces::cloud_setup,
            drive_upload::cloud_spaces::cloud_move_in,
            drive_upload::drive_workspaces,
            drive_upload::drive_restore,
            drive_upload::drive_upload, drive_upload::drive_resolve_missing,
            drive_upload::drive_open_folder, drive_upload::drive_open_file,
            drive_auth::drive_status,
            drive_auth::drive_connect,
            drive_auth::drive_cancel,
            drive_auth::drive_disconnect,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            registry_editor::read_registry_document, registry_editor::validate_registry_document, registry_editor::save_registry_document,
            open_workspace, local_tree::list_directory, local_tree::search_files, local_changes::local_path_stamps,
            set_file_star,
            set_sync_choice,
            read_note,
            save_note,
            workspace_replace::replace_saved_note,
            save_bookmarks,
            search_notes, cancel_search,
            load_draft,
            save_draft,
            load_explorer,
            save_explorer,
            quit_app,
            open_readme,
            begin_update,
            cancel_update,
            restart_after_update,
            new_window,
            create_note,
            rename_note,
            move_note,
            delete_note,
            reveal_note,
            speech::speech_status,
            speech::speech_download,
            speech::speech_start,
            speech::speech_finish,
            speech::speech_cancel
        ])
        .build(tauri::generate_context!())
        .expect("Unable to run Nova")
        .run(|app, event| {
            if let tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } = &event {
                app.state::<terminal::Terminals>().close_window(label);
            }
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<Access>().quitting.load(Ordering::Relaxed)
                    && !*app.state::<Access>().updating.lock().unwrap_or_else(|e| e.into_inner())
                    && !app.webview_windows().is_empty()
                {
                    api.prevent_exit();
                    let _ = app.emit("nova:request-quit", ());
                }
            }
        });
}
// Mobile shares the file engine, with a stable workspace identity and no shell,
// desktop menus, multi-window handling, or microphone dependencies.
#[cfg(mobile)]
#[tauri::mobile_entry_point]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_nova_auth::init()).manage(drive_auth::DriveAuth::default());
    let builder = builder
        .manage(Access::default())
        .setup(|app| {
            let root = app.path().app_data_dir()?.join("Notes");
            fs::create_dir_all(&root)?;
            *app.state::<Access>().mobile_root.lock().map_err(|_| "Notes storage lock failed")? = Some(fs::canonicalize(root)?);
            Ok(())
        });
    #[cfg(target_os = "ios")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        drive_upload::cloud_reset::cloud_reset_local,
        drive_auth::drive_status, drive_auth::drive_connect, drive_auth::drive_cancel, drive_auth::drive_disconnect,
        drive_upload::cloud_spaces::cloud_setup, drive_upload::cloud_spaces::cloud_move_in,
        drive_upload::drive_upload, drive_upload::drive_resolve_missing, drive_upload::drive_open_folder, drive_upload::drive_open_file, drive_upload::drive_workspaces, drive_upload::drive_restore,
        registry_editor::read_registry_document, registry_editor::validate_registry_document, registry_editor::save_registry_document,
        open_workspace, set_file_star, set_sync_choice, read_note, save_note, save_bookmarks, search_notes, cancel_search, load_draft, save_draft, load_explorer, save_explorer, create_note, rename_note, move_note, delete_note
    ]);
    #[cfg(not(target_os = "ios"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
            registry_editor::read_registry_document, registry_editor::validate_registry_document, registry_editor::save_registry_document,
            open_workspace, set_file_star, set_sync_choice, read_note, save_note,
            save_bookmarks, search_notes, cancel_search, load_draft, save_draft, load_explorer,
            save_explorer, create_note, rename_note, move_note, delete_note
        ]);
    builder.run(tauri::generate_context!())
        .expect("Unable to run Nova");
}

#[cfg(test)]
mod tests {
    #[test]
    fn hidden_content_and_bookmarks_follow_search_preference() {
        let dir = tempfile::tempdir().unwrap();
        let meta = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".config")).unwrap();
        for name in ["visible.txt", ".config/note.txt", ".nova"] {
            fs::write(dir.path().join(name), r#"{"custom":"needle"}"#).unwrap();
        }
        let hidden = fs::canonicalize(dir.path().join(".config/note.txt")).unwrap();
        fs::write(meta.path().join(format!("{}.json", revision(hidden.to_string_lossy().as_bytes()))),
            r#"[{"id":"mark","name":"needle","quote":"needle","from":11,"to":17}]"#).unwrap();
        let run = |hidden| {
            let spec = serde_json::from_value(serde_json::json!({"pattern":"needle", "caseSensitive":false,"include":"","exclude":"","includeHidden":hidden})).unwrap();
            scan_search_with_matcher(vec![dir.path().to_path_buf()], "needle".into(), Arc::new(AtomicU64::new(1)), 1,
                meta.path().to_path_buf(), search_options::Matcher::new("needle", Some(spec)).unwrap())
        };
        assert_eq!(run(false).hits.len(), 1);
        assert!(run(false).bookmarks.is_empty());
        assert_eq!(run(true).hits.len(), 3);
        assert_eq!(run(true).bookmarks.len(), 1);
    }
    #[test]
    fn recovery_survives_reopening_and_has_stable_scoped_identity() {
        let directory = tempfile::tempdir().unwrap();
        let path = super::draft_path(directory.path(), "/notes", "draft.md");
        let draft = serde_json::json!({"text": "unsaved edits", "revision": "original", "bookmarks": []});
        super::atomic_write(&path, &serde_json::to_vec(&draft).unwrap()).unwrap();
        // Simulate a fresh process deriving the same recovery path, without a web origin.
        let reopened = super::draft_path(directory.path(), "/notes", "draft.md");
        let restored: serde_json::Value = serde_json::from_slice(&std::fs::read(reopened).unwrap()).unwrap();
        assert_eq!(restored, draft);
        assert_ne!(path, super::draft_path(directory.path(), "/other", "draft.md"));
        assert_eq!(super::draft_path(directory.path(), "../../outside", "../draft.md").parent().unwrap(), directory.path());
        super::atomic_write(&path, b"null").unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"null");
    }
    use super::*;
    #[test]
    fn stars_persist_per_root_and_follow_renames() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        let other = tempfile::tempdir().unwrap();
        fs::create_dir(root.join("nested")).unwrap();
        fs::write(root.join("nested/note.md"), "hello").unwrap();
        fs::write(root.join(".nova"), r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(update_star(&root, "nested/note.md", true).unwrap(), vec!["nested/note.md"]);
        assert_eq!(update_star(&root, "nested/note.md", true).unwrap().len(), 1);
        assert!(registry_stars(&read_registry(other.path()).unwrap()).unwrap().is_empty());
        let target = rename_starred_file(&root, &root.join("nested/note.md"), "renamed.md").unwrap();
        let registry = read_registry(&root).unwrap();
        assert_eq!(registry["theme"], "dark");
        assert_eq!(registry_stars(&registry).unwrap(), vec!["nested/renamed.md"]);
        assert_eq!(fs::read_to_string(target).unwrap(), "hello");
        assert_eq!(files_in(&root).unwrap().len(), 1);
        assert!(update_star(&root, "nested/renamed.md", false).unwrap().is_empty());
        assert!(update_star(&root, "../outside.md", true).is_err());
    }
    #[test]
    fn invalid_registry_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("note.md"), "hello").unwrap();
        for content in ["invalid", "[]", r#"{"starred":42}"#] {
            fs::write(dir.path().join(".nova"), content).unwrap();
            assert!(update_star(dir.path(), "note.md", true).is_err());
            assert_eq!(fs::read_to_string(dir.path().join(".nova")).unwrap(), content);
        }
    }
    #[cfg(unix)]
    #[test]
    fn registry_symlinks_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("registry"), "{}").unwrap();
        std::os::unix::fs::symlink(outside.path().join("registry"), dir.path().join(".nova")).unwrap();
        assert!(read_registry(dir.path()).is_err());
    }

    #[test]
    fn empty_untitled_cleanup_preserves_named_files_and_any_content() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["Untitled.md", "Untitled 2.txt", "Untitled 12.custom", "Untitled 3.d.ts"] {
            let path = dir.path().join(name);
            fs::write(&path, "").unwrap();
            assert!(is_empty_untitled(&path).unwrap());
            for content in ["keep me", " ", "\n"] {
                fs::write(&path, content).unwrap();
                assert!(!is_empty_untitled(&path).unwrap());
            }
        }
        for name in ["Notes.md", "Untitled draft.md", "Untitled 1.md"] {
            let path = dir.path().join(name);
            fs::write(&path, "").unwrap();
            assert!(!is_empty_untitled(&path).unwrap());
        }
        assert!(!is_empty_untitled(&dir.path().join("Untitled 3.md")).unwrap());
    }
    #[test]
    fn custom_extensions_survive_the_file_lifecycle() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        for extension in ["txt", ".json", ".custom", ".d.ts"] {
            let suffix = normalize_extension(extension).unwrap();
            let first = create_untitled(&root, extension).unwrap();
            assert_eq!(first, format!("Untitled{suffix}"));
            assert_eq!(create_untitled(&root, extension).unwrap(), format!("Untitled 2{suffix}"));
            let path = scoped_path(&root, &first).unwrap();
            assert!(is_empty_untitled(&path).unwrap());
            fs::write(&path, "keep custom content").unwrap();
            assert!(!is_empty_untitled(&path).unwrap());
            let renamed = format!("Saved{suffix}");
            rename_file(&path, &renamed).unwrap();
            assert!(scoped_path(&root, &renamed).is_ok());
            assert!(files_in(&root).unwrap().iter().any(|file| file.path == renamed));
        }
        for extension in ["", ".", "../bad", "a/b", "a\\b", "a:b", "two words", "foo..bar"] {
            assert!(create_untitled(&root, extension).is_err());
        }
    }
    #[test]
    fn untitled_creation_preserves_existing_notes() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Untitled.md"), "keep me").unwrap();
        assert_eq!(create_untitled(dir.path(), ".md").unwrap(), "Untitled 2.md");
        assert_eq!(create_untitled(dir.path(), ".md").unwrap(), "Untitled 3.md");
        assert_eq!(fs::read_to_string(dir.path().join("Untitled.md")).unwrap(), "keep me");
    }
    #[test]
    fn move_destination_is_existing_and_scoped() {
        let temp = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temp.path()).unwrap();
        fs::create_dir(root.join("nested")).unwrap();
        fs::write(root.join("note.md"), "hello").unwrap();
        let source = root.join("note.md");
        assert_eq!(move_target(&root, &source, "nested").unwrap(), root.join("nested/note.md"));
        assert!(move_target(&root, &source, "../outside").is_err());
        assert!(move_target(&root, &source, "/tmp").is_err());
        assert!(move_target(&root, &source, "missing").is_err());
        #[cfg(unix)] {
            let outside = tempfile::tempdir().unwrap();
            std::os::unix::fs::symlink(outside.path(), root.join("escape")).unwrap();
            assert!(move_target(&root, &source, "escape").is_err());
        }
    }
    #[test]
    fn rename_preserves_contents_and_rejects_collisions_and_paths() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("before.md");
        fs::write(&source, "original").unwrap();
        fs::write(dir.path().join("taken.md"), "existing").unwrap();
        for name in ["taken.md", "../escape.md", "nested/file.md", "bad:name", ".nova", ""] {
            assert!(rename_file(&source, name).is_err());
            assert_eq!(fs::read_to_string(&source).unwrap(), "original");
        }
        let renamed = rename_file(&source, "after.md").unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read_to_string(renamed).unwrap(), "original");
        assert_eq!(fs::read_to_string(dir.path().join("taken.md")).unwrap(), "existing");
    }
    #[test]
    fn case_only_rename_updates_disk_name_and_stars() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::write(root.join("work.md"), "original").unwrap();
        update_star(&root, "work.md", true).unwrap();
        for (old, new) in [("work.md", "Work.md"), ("Work.md", "WORK.MD"), ("WORK.MD", "work.md")] {
            let target = rename_starred_file(&root, &root.join(old), new).unwrap();
            assert_eq!(target, root.join(new));
            assert_eq!(fs::read_to_string(&target).unwrap(), "original");
            let names: Vec<_> = fs::read_dir(&root).unwrap().map(|entry| entry.unwrap().file_name()).collect();
            assert!(names.contains(&std::ffi::OsString::from(new)));
            assert!(!names.contains(&std::ffi::OsString::from(old)));
            assert_eq!(registry_stars(&read_registry(&root).unwrap()).unwrap(), vec![new]);
        }
    }
    #[test]
    fn case_only_rename_rejects_a_distinct_existing_entry() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("work.md");
        let target = dir.path().join("Work.md");
        fs::write(&source, "original").unwrap();
        // Case-sensitive volumes can contain both spellings, even as hard links.
        if !target.exists() {
            fs::hard_link(&source, &target).unwrap();
            assert!(rename_file(&source, "Work.md").is_err());
            assert!(source.exists());
            assert_eq!(fs::read_to_string(&target).unwrap(), "original");
        }
    }
    #[cfg(unix)]
    #[test]
    fn rename_rejects_a_symlink_to_the_source() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("work.md");
        let target = dir.path().join("alias.md");
        fs::write(&source, "original").unwrap();
        std::os::unix::fs::symlink(&source, &target).unwrap();
        assert!(rename_file(&source, "alias.md").is_err());
        assert!(fs::symlink_metadata(&target).unwrap().file_type().is_symlink());
        assert_eq!(fs::read_to_string(&source).unwrap(), "original");
    }
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
        for query in ["needle", "PASSAGE", ""] {
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
            if query.is_empty() {
                assert!(result.hits.is_empty());
            }
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
        fs::write(root.join("image.png"), b"\x89PNG\r\n\x1a\n\0").unwrap();
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
