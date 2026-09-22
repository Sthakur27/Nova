import { parseSyncPolicy, setSyncChoice, type SyncChoice, type SyncPolicy } from "./syncPolicy";
import { DEFAULT_EXTENSION, normalizeExtension, isUntitled } from "./fileExtensions";
import { invoke, localResetInProgress } from "./resetLocalState";
import { open } from "@tauri-apps/plugin-dialog";
import { demoFiles } from "./demo";
import { parsePreferences, type FolderPreference, type ExplorerPreferences } from "./folders";
import {
  reanchor,
  type Bookmark,
  type DocumentData,
  type SearchHit,
  type Workspace,
} from "./model";
import { native, mobile, desktop } from "./platform";
export { desktop } from "./platform";
const prefix = "nova-demo-v1:";
function demoPaths(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem("nova-demo-files-v1") ?? "null");
    if (Array.isArray(saved) && saved.every(path => typeof path === "string")) return saved;
  } catch { /* Storage may be unavailable in previews or tests. */ }
  return Object.keys(demoFiles);
}
export const demoWorkspace: Workspace = {
  name: "My notes",
  root: "demo",
  starred: [],
  files: demoPaths().map((path) => ({
    path,
    name: path.split("/").at(-1)!,
  })),
};
const textFor = (path: string) =>
  localStorage.getItem(prefix + path) ?? demoFiles[path] ?? "";
export async function openWorkspace(root: string, expandedDirectories: string[] = []): Promise<Workspace> {
  if (root === "demo") {
    try { demoWorkspace.syncPolicy = loadDemoSyncPolicy(); demoWorkspace.syncError = undefined; }
    catch (error) { demoWorkspace.syncPolicy = undefined; demoWorkspace.syncError = String(error); }
    demoWorkspace.starred = JSON.parse(localStorage.getItem("nova-demo-stars-v1") ?? "[]");
    return { ...demoWorkspace };
  }
  let folder = await invoke<Workspace>("open_workspace", { root });
  if (folder.directories) {
    folder = { ...folder, expandedDirectories };
    // Restore only explicitly expanded branches, never traverse the whole root.
    const listings = await Promise.all(expandedDirectories.map(async path => {
      try { return { path, listing: await listDirectory(root, path) }; }
      catch (error) { return { path, error: String(error) }; }
    }));
    for (const result of listings) {
      if (result.listing) folder = mergeDirectory(folder, result.path, result.listing);
      else folder.directoryErrors = { ...folder.directoryErrors, [result.path]: result.error! };
    }
  }
  return folder;
}
export type DirectoryListing = { files: Workspace["files"]; directories: string[]; nextOffset: number | null; warnings: string[] };
export const listDirectory = (root: string, path: string, offset = 0) => invoke<DirectoryListing>("list_directory", { root, path, offset });
export function mergeDirectory(folder: Workspace, path: string, listing: DirectoryListing, append = false): Workspace {
  const parent = (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const pages = { ...folder.directoryPages };
  if (listing.nextOffset == null) delete pages[path]; else pages[path] = listing.nextOffset;
  const errors = { ...folder.directoryErrors }; delete errors[path];
  const files = [...folder.files.filter(file => append || parent(file.path) !== path), ...listing.files];
  return { ...folder,
    files: [...new Map(files.map(file => [file.path, file])).values()],
    directories: [...new Set([...(folder.directories ?? []).filter(dir => append || parent(dir) !== path), ...(path ? [path] : []), ...listing.directories])],
    directoryPages: pages, directoryErrors: errors,
    warnings: [...new Set([...(folder.warnings ?? []), ...listing.warnings])].slice(0, 20),
  };
}
export function cancelSearch(filenames: boolean) {
  if (native) void invoke("cancel_search", { filenames }).catch(() => {});
}
export type FileSearchMatch = { root: string; path: string; name: string };
export async function searchFiles(folders: Workspace[], query: string): Promise<{ files: FileSearchMatch[]; warnings: string[] }> {
  const roots = folders.filter(folder => folder.directories && !folder.error).map(folder => folder.root);
  return roots.length ? invoke("search_files", { roots, query }) : { files: [], warnings: [] };
}
export async function setFileStar(root: string, path: string, starred: boolean): Promise<string[]> {
  if (root !== "demo") return invoke("set_file_star", { root, path, starred });
  const stars = new Set<string>(JSON.parse(localStorage.getItem("nova-demo-stars-v1") ?? "[]"));
  if (starred) stars.add(path);
  else stars.delete(path);
  const result = [...stars].sort();
  localStorage.setItem("nova-demo-stars-v1", JSON.stringify(result));
  demoWorkspace.starred = result;
  return result;
}
export async function openFolderWindow(root: string): Promise<void> {
  if (desktop) { await invoke("new_window", { root }); return; }
  if (mobile) throw new Error("Mobile uses Cloud spaces.");
  const url = new URL(window.location.href);
  url.searchParams.set("folder", root);
  url.searchParams.set("new-window", "true");
  window.open(url.href, "_blank", "noopener");
}
export async function chooseWorkspaces(): Promise<Workspace[]> {
  if (mobile) throw new Error("Mobile uses Cloud spaces. Connect Google Drive to get started.");
  if (!desktop) throw new Error("Open local folders in the Nova desktop app.");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open Folder",
  });
  if (!selected) return [];
  return loadFolders(
    (Array.isArray(selected) ? selected : [selected]).map((root) => ({
      root,
      name: root.split(/[\\/]/).at(-1) || root,
    })),
  );
}
export async function loadFolders(
  folders: FolderPreference[],
): Promise<Workspace[]> {
  const results: Workspace[] = [];
  for (const folder of folders) {
    try {
      results.push({
        ...(await openWorkspace(folder.root, folder.expandedDirectories)),
        collapsed: folder.collapsed,
        closedDirectories: folder.closedDirectories,
      });
    } catch (error) {
      results.push({ ...folder, files: [], error: String(error) });
    }
  }
  return results;
}
export async function loadExplorer(): Promise<ExplorerPreferences | null> {
  if (native) {
    const saved = parsePreferences(await invoke("load_explorer"));
    if (!mobile) return saved;
    const validRoot = (root: string) => /^mobile-sync\/[^/\\]+$/.test(root);
    // Stable virtual root survives iOS changing the app container's absolute path.
    return {
      folders: saved?.folders.filter(folder => validRoot(folder.root)) ?? [],
      active: saved?.active && validRoot(saved.active.root) ? saved.active : null,
      mode: saved?.mode ?? "edit",
      tabs: saved?.tabs?.filter(tab => validRoot(tab.root)) ?? [],
    };
  }
  return parsePreferences(JSON.parse(localStorage.getItem("nova-explorer-v1") ?? "null"));
}

let preferenceQueue = Promise.resolve();
export function saveExplorer(preferences: ExplorerPreferences): Promise<void> {
  if (localResetInProgress()) return Promise.resolve();
  const payload = JSON.parse(JSON.stringify(preferences));
  // Synchronous recovery survives reload/quit before native writes complete.
  try { localStorage.setItem("nova-explorer-v1", JSON.stringify(payload)); }
  catch (error) { if (!native) return Promise.reject(error); }
  const pending = preferenceQueue
    .catch(() => {})
    .then(async () => {
      if (native) await invoke("save_explorer", { preferences: payload });
      else localStorage.setItem("nova-explorer-v1", JSON.stringify(payload));
    });
  preferenceQueue = pending;
  return pending;
}
export async function readNote(
  root: string,
  path: string,
): Promise<DocumentData> {
  if (root !== "demo") {
    const data = await invoke<DocumentData>("read_note", { root, path });
    return { ...data, bookmarks: reanchor(data.bookmarks, data.text) };
  }
  const text = textFor(path);
  const bookmarks: Bookmark[] = JSON.parse(
    localStorage.getItem(prefix + path + ":bookmarks") ?? "[]",
  );
  if (
    !localStorage.getItem(prefix + path + ":bookmarks") &&
    path === "Getting started.md"
  ) {
    for (const [name, quote] of [
      [
        "The idea",
        "Your notes are just files. No vaults, no imports, no ceremony.",
      ],
      [
        "Try your first bookmark",
        "Select this sentence in Write mode and make it a bookmark.",
      ],
      ["Keep it simple", "You don't need a system before you start."],
    ]) {
      const from = text.indexOf(quote);
      if (from >= 0)
        bookmarks.push({
          id: crypto.randomUUID(),
          name,
          from,
          to: from + quote.length,
          quote,
        });
    }
  }
  return { text, revision: text, bookmarks: reanchor(bookmarks, text) };
}
export async function saveNote(
  root: string,
  path: string,
  text: string,
  revision: string,
): Promise<string> {
  if (root !== "demo")
    return invoke<string>("save_note", { root, path, text, revision });
  if (textFor(path) !== revision)
    throw new Error(
      "This note changed in another window. Copy your edits before reloading.",
    );
  localStorage.setItem(prefix + path, text);
  return text;
}
export async function saveBookmarks(
  root: string,
  path: string,
  bookmarks: Bookmark[],
): Promise<void> {
  if (root !== "demo")
    return invoke("save_bookmarks", { root, path, bookmarks });
  localStorage.setItem(prefix + path + ":bookmarks", JSON.stringify(bookmarks));
}
export type FolderSearchHit = SearchHit & { root: string };
export type BookmarkSearchHit = { root: string; path: string; bookmark: Bookmark };
export type FolderSearchResponse = {
  bookmarks: BookmarkSearchHit[];
  hits: FolderSearchHit[];
  warnings: string[];
};
export async function searchNotes(
  folders: Workspace[],
  query: string,
): Promise<FolderSearchResponse> {
  const native = folders.filter((f) => f.root !== "demo" && !f.error);
  const result: FolderSearchResponse = native.length
    ? await invoke("search_notes", { roots: native.map((f) => f.root), query })
    : { hits: [], bookmarks: [], warnings: [] };
  if (folders.some((f) => f.root === "demo")) {
    const hits: FolderSearchHit[] = [];
    const q = query.trim().toLowerCase();
    for (const { path } of demoWorkspace.files) {
      const note = await readNote("demo", path);
      for (const bookmark of note.bookmarks) {
        if (!q || bookmark.name.toLowerCase().includes(q) || bookmark.quote.toLowerCase().includes(q))
          result.bookmarks.push({ root: "demo", path, bookmark });
      }
    }
    for (const { path } of demoWorkspace.files)
      textFor(path)
        .split("\n")
        .forEach((snippet, i) => {
          if (query.trim() && snippet.toLowerCase().includes(query.toLowerCase()))
            hits.push({ root: "demo", path, line: i + 1, snippet });
        });
    result.hits.push(...hits.slice(0, 80));
  }
  result.hits.sort(
    (a, b) =>
      folders.findIndex((f) => f.root === a.root) -
      folders.findIndex((f) => f.root === b.root),
  );
  result.hits = result.hits.slice(0, 80);
  if (query.trim()) result.bookmarks = result.bookmarks.slice(0, 80);
  return result;
}

function persistDemoFiles() {
  localStorage.setItem("nova-demo-files-v1", JSON.stringify(demoWorkspace.files.map(f => f.path)));
}
export async function createNote(root: string, extension = DEFAULT_EXTENSION): Promise<string> {
  extension = normalizeExtension(extension);
  if (root !== "demo") return invoke("create_note", { root, extension });
  let number = 1;
  let path = `Untitled${extension}`;
  while (demoWorkspace.files.some(f => f.path === path)) path = `Untitled ${++number}${extension}`;
  localStorage.setItem(prefix + path, "");
  demoWorkspace.files = [...demoWorkspace.files, { path, name: path }];
  persistDemoFiles();
  return path;
}
export async function renameNote(root: string, path: string, name: string): Promise<string> {
  if (!name.trim() || /[/\\:*?"<>|\x00-\x1f\x7f]/.test(name) || name === "." || name === ".." || name === ".nova")
    throw new Error("Enter a valid filename without filename separators.");
  if (root !== "demo") return invoke("rename_note", { root, path, name });
  const next = path.slice(0, path.lastIndexOf("/") + 1) + name;
  if (next === path) return path;
  if (demoWorkspace.files.some(f => f.path === next)) throw new Error("A file with that name already exists.");
  const note = await readNote(root, path);
  const stars: string[] = JSON.parse(localStorage.getItem("nova-demo-stars-v1") ?? "[]");
  if (stars.includes(path)) {
    const renamed = stars.map(star => star === path ? next : star);
    localStorage.setItem("nova-demo-stars-v1", JSON.stringify(renamed));
    demoWorkspace.starred = renamed;
  }
  relocateDemoSync(path, next);
  localStorage.setItem(prefix + next, note.text);
  localStorage.setItem(prefix + next + ":bookmarks", JSON.stringify(note.bookmarks));
  demoWorkspace.files = demoWorkspace.files.map(f => f.path === path ? { path: next, name } : f);
  persistDemoFiles();
  localStorage.removeItem(prefix + path);
  localStorage.removeItem(prefix + path + ":bookmarks");
  return next;
}

export async function moveNote(root: string, path: string, directory: string): Promise<string> {
  if (root !== "demo") return invoke("move_note", { root, path, directory });
  const dir = directory.replace(/^\.\//, "").replace(/\/$/, "");
  if (dir && (dir.startsWith("/") || dir.split("/").includes("..") || !demoWorkspace.files.some(f => f.path.startsWith(dir + "/")))) throw new Error("Choose an existing folder inside this workspace.");
  const name = path.split("/").at(-1)!;
  const next = dir ? dir + "/" + name : name;
  if (next === path) return path;
  if (demoWorkspace.files.some(f => f.path === next)) throw new Error("A file with that name already exists.");
  const note = await readNote(root, path);
  relocateDemoSync(path, next);
  localStorage.setItem(prefix + next, note.text);
  localStorage.setItem(prefix + next + ":bookmarks", JSON.stringify(note.bookmarks));
  const stars: string[] = JSON.parse(localStorage.getItem("nova-demo-stars-v1") ?? "[]");
  demoWorkspace.starred = stars.map(p => p === path ? next : p);
  localStorage.setItem("nova-demo-stars-v1", JSON.stringify(demoWorkspace.starred));
  demoWorkspace.files = demoWorkspace.files.map(f => f.path === path ? { path: next, name } : f);
  persistDemoFiles();
  localStorage.removeItem(prefix + path);
  localStorage.removeItem(prefix + path + ":bookmarks");
  return next;
}
export async function discardEmptyUntitled(root: string, path: string): Promise<boolean> {
  if (root !== "demo") return invoke("delete_note", { root, path, onlyEmptyUntitled: true });
  if (!isUntitled(path) ||
      !demoWorkspace.files.some(file => file.path === path) || textFor(path).length !== 0) return false;
  await deleteNote(root, path);
  return true;
}
export async function deleteNote(root: string, path: string): Promise<void> {
  if (root !== "demo") return invoke("delete_note", { root, path });
  relocateDemoSync(path);
  await setFileStar(root, path, false);
  demoWorkspace.files = demoWorkspace.files.filter(f => f.path !== path);
  persistDemoFiles();
  localStorage.removeItem(prefix + path);
  localStorage.removeItem(prefix + path + ":bookmarks");
}
export async function revealNote(root: string, path: string): Promise<void> {
  return invoke("reveal_note", { root, path });
}

function loadDemoSyncPolicy(): SyncPolicy {
  return parseSyncPolicy(JSON.parse(localStorage.getItem("nova-demo-sync-v1") ?? '{"version":1,"rules":{}}'));
}
export async function setWorkspaceSyncChoice(root: string, path: string, choice: SyncChoice): Promise<SyncPolicy> {
  if (root !== "demo") return invoke("set_sync_choice", { root, path, choice });
  const next = setSyncChoice(loadDemoSyncPolicy(), path, choice);
  localStorage.setItem("nova-demo-sync-v1", JSON.stringify(next));
  demoWorkspace.syncPolicy = next;
  return next;
}
function relocateDemoSync(old: string, next?: string) {
  const policy = loadDemoSyncPolicy();
  const rule = policy.rules[old];
  delete policy.rules[old];
  if (next && typeof rule === "boolean") policy.rules[next] = rule;
  localStorage.setItem("nova-demo-sync-v1", JSON.stringify(policy));
  demoWorkspace.syncPolicy = policy;
}
