mod speech;
mod terminal;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{BufRead, BufReader, Read, Write},
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
    starred: Vec<String>,
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
    if path.file_name().and_then(|name| name.to_str()) == Some(".nova") { return false; }
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
    let value: serde_json::Value = serde_json::from_slice(&fs::read(path).map_err(err)?)
        .map_err(|error| format!("Could not read .nova: {error}"))?;
    if !value.is_object() { return Err(".nova must contain a JSON object.".into()); }
    registry_stars(&value)?;
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
    registry["starred"] = serde_json::json!(stars);
    let bytes = serde_json::to_vec_pretty(&registry).map_err(err)?;
    if bytes.len() > 4 * 1024 * 1024 { return Err(".nova registry is too large.".into()); }
    atomic_write(&root.join(".nova"), &bytes)
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
    let (starred, stars_error) = match read_registry(&path).and_then(|value| registry_stars(&value)) {
        Ok(stars) => (stars, None),
        Err(error) => (Vec::new(), Some(error)),
    };
    Ok(Workspace {
        starred,
        stars_error,
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
    // An empty query lists all bookmark metadata without reading note text.
    let listing = query.is_empty();
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
            if metadata.exists() && (listing || response.bookmarks.len() < 80) {
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
            if listing || response.hits.len() == 80 {
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
    let generation = if query.trim().is_empty() {
        Arc::new(AtomicU64::new(0))
    } else {
        access.search_generation.clone()
    };
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
    create_untitled(&root_path(&access, &root)?, extension.as_deref().unwrap_or(".txt"))
}
fn rename_file(source: &Path, name: &str) -> Result<PathBuf, String> {
    if name.trim().is_empty() || name == "." || name == ".." || name == ".nova"
        || name.chars().any(|c| c.is_control() || "/\\:*?\"<>|".contains(c)) {
        return Err("Enter a valid filename without filename separators.".into());
    }
    let target = source.with_file_name(name);
    if target == source { return Ok(target); }
    // Creating a link fails if the destination exists, so an existing note is never overwritten.
    fs::hard_link(source, &target).map_err(err)?;
    if let Err(error) = fs::remove_file(source) {
        let _ = fs::remove_file(&target);
        return Err(err(error));
    }
    Ok(target)
}
fn rename_starred_file(root: &Path, source: &Path, name: &str) -> Result<PathBuf, String> {
    let registry = read_registry(root)?;
    let mut stars = registry_stars(&registry)?;
    let old = source.strip_prefix(root).map_err(err)?.to_string_lossy().replace('\\', "/");
    let target = rename_file(source, name)?;
    if target == source { return Ok(target); }
    if stars.iter().any(|star| star == &old) {
        let next = target.strip_prefix(root).map_err(err)?.to_string_lossy().replace('\\', "/");
        for star in &mut stars { if star == &old { *star = next.clone(); } }
        if let Err(error) = write_registry(root, registry, &stars) {
            fs::rename(&target, source).map_err(err)?;
            return Err(error);
        }
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
    let old_meta = metadata_path(&app, &source)?;
    let new_meta = metadata_path(&app, &target)?;
    fs::hard_link(&source, &target).map_err(err)?;
    let result = (|| {
        if old_meta.exists() { atomic_write(&new_meta, &fs::read(&old_meta).map_err(err)?)?; }
        write_registry(&root, registry.clone(), &updated)?;
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
// Check while holding Access::writes, immediately before deleting the file.
fn is_empty_untitled(path: &Path) -> Result<bool, String> {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    let stem = name.split_once('.').map(|(stem, _)| stem).unwrap_or("");
    let generated = stem == "Untitled" || stem.strip_prefix("Untitled ")
        .and_then(|number| number.parse::<u32>().ok())
        .is_some_and(|number| (2..10_000).contains(&number));
    if !generated { return Ok(false); }
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
    write_registry(&root, registry.clone(), &updated)?;
    if let Err(error) = fs::remove_file(source) {
        let _ = write_registry(&root, registry, &stars);
        return Err(err(error));
    }
    let _ = fs::remove_file(metadata);
    Ok(true)
}
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
#[tauri::command]
fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    static WINDOW_ID: AtomicU64 = AtomicU64::new(1);
    let mut config = app.config().app.windows[0].clone();
    config.label = format!("nova-{}", WINDOW_ID.fetch_add(1, Ordering::Relaxed));
    tauri::WebviewWindowBuilder::from_config(&app, &config).map_err(err)?.build().map_err(err)?;
    Ok(())
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            open_workspace,
            set_file_star,
            read_note,
            save_note,
            save_bookmarks,
            search_notes,
            load_draft,
            save_draft,
            load_explorer,
            save_explorer,
            quit_app,
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
