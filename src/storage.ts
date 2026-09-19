import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { demoFiles } from "./demo";
import { parsePreferences, type ExplorerPreferences } from "./folders";
import {
  reanchor,
  type Bookmark,
  type DocumentData,
  type SearchHit,
  type Workspace,
} from "./model";
export const desktop = isTauri();
const prefix = "nova-demo-v1:";
export const demoWorkspace: Workspace = {
  name: "My notes",
  root: "demo",
  files: Object.keys(demoFiles).map((path) => ({
    path,
    name: path.split("/").at(-1)!,
  })),
};
const textFor = (path: string) =>
  localStorage.getItem(prefix + path) ?? demoFiles[path] ?? "";
export async function openWorkspace(root: string): Promise<Workspace> {
  if (root === "demo") return demoWorkspace;
  return invoke<Workspace>("open_workspace", { root });
}
export async function chooseWorkspaces(): Promise<Workspace[]> {
  if (!desktop) throw new Error("Add local folders in the Nova desktop app.");
  const selected = await open({
    directory: true,
    multiple: true,
    title: "Add folders to Nova",
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
  folders: { root: string; name: string; collapsed?: boolean }[],
): Promise<Workspace[]> {
  const results: Workspace[] = [];
  for (const folder of folders) {
    try {
      results.push({
        ...(await openWorkspace(folder.root)),
        collapsed: folder.collapsed,
      });
    } catch (error) {
      results.push({ ...folder, files: [], error: String(error) });
    }
  }
  return results;
}
export async function loadExplorer(): Promise<ExplorerPreferences | null> {
  return parsePreferences(
    desktop
      ? await invoke("load_explorer")
      : JSON.parse(localStorage.getItem("nova-explorer-v1") ?? "null"),
  );
}
let preferenceQueue = Promise.resolve();
export function saveExplorer(preferences: ExplorerPreferences): Promise<void> {
  const payload = JSON.parse(JSON.stringify(preferences));
  const pending = preferenceQueue
    .catch(() => {})
    .then(async () => {
      if (desktop) await invoke("save_explorer", { preferences: payload });
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
    for (const path of Object.keys(demoFiles)) {
      const note = await readNote("demo", path);
      for (const bookmark of note.bookmarks) {
        if (q && (bookmark.name.toLowerCase().includes(q) || bookmark.quote.toLowerCase().includes(q)))
          result.bookmarks.push({ root: "demo", path, bookmark });
      }
    }
    for (const path of Object.keys(demoFiles))
      textFor(path)
        .split("\n")
        .forEach((snippet, i) => {
          if (snippet.toLowerCase().includes(query.toLowerCase()))
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
  result.bookmarks = result.bookmarks.slice(0, 80);
  return result;
}
