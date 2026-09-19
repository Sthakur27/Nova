import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { demoFiles } from "./demo";
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
export async function chooseWorkspace(): Promise<Workspace | null> {
  if (!desktop)
    throw new Error(
      "Open folders in the Nova desktop app. This browser preview uses editable sample notes.",
    );
  const root = await open({
    directory: true,
    multiple: false,
    title: "Open a notes folder",
  });
  return root ? invoke<Workspace>("open_workspace", { root }) : null;
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
export async function searchNotes(
  root: string,
  query: string,
): Promise<SearchHit[]> {
  if (root !== "demo") return invoke("search_notes", { root, query });
  const hits: SearchHit[] = [];
  for (const path of Object.keys(demoFiles)) {
    textFor(path)
      .split("\n")
      .forEach((snippet, i) => {
        if (snippet.toLowerCase().includes(query.toLowerCase()))
          hits.push({ path, line: i + 1, snippet });
      });
  }
  return hits.slice(0, 80);
}
