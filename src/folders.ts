import { tabId, type NoteTab } from "./tabs";
import { parsePaneLayout, type PaneNode } from "./paneLayout";
import type { Workspace } from "./model";
export type FolderPreference = Pick<Workspace, "root" | "name" | "collapsed" | "closedDirectories">;
export type EditorMode = "source" | "edit" | "read";
export type ExplorerPreferences = {
  folders: FolderPreference[];
  active: { root: string; path: string } | null;
  mode: EditorMode;
  tabs?: NoteTab[];
  panes?: PaneNode;
};
export function addFolders(
  current: Workspace[],
  added: Workspace[],
): Workspace[] {
  const roots = new Set(current.map((folder) => folder.root));
  const next = [...current];
  for (const folder of added)
    if (!roots.has(folder.root)) {
      roots.add(folder.root);
      next.push(folder);
    }
  return next;
}
export function reorderFolders<T extends { root: string }>(
  folders: T[],
  source: string,
  target: string,
): T[] {
  const from = folders.findIndex((folder) => folder.root === source),
    to = folders.findIndex((folder) => folder.root === target);
  if (from < 0 || to < 0 || from === to) return folders;
  const next = [...folders];
  const [folder] = next.splice(from, 1);
  next.splice(to, 0, folder);
  return next;
}
export function parsePreferences(value: unknown): ExplorerPreferences | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ExplorerPreferences>;
  if (!Array.isArray(v.folders) || v.folders.length > 100) return null;
  const folders = v.folders
    .filter(
      (f): f is FolderPreference =>
        !!f && typeof f.root === "string" && typeof f.name === "string",
    )
    .map((f) => ({ root: f.root, name: f.name, collapsed: f.collapsed !== false, ...(Array.isArray(f.closedDirectories) ? { closedDirectories: f.closedDirectories.filter(p => typeof p === "string") } : {}) }));
  const unique = folders.filter(
    (f, i) => folders.findIndex((other) => other.root === f.root) === i,
  );
  const active =
    v.active &&
    typeof v.active.root === "string" &&
    typeof v.active.path === "string"
      ? v.active
      : null;
  return {
    folders: unique,
    active,
    ...(Array.isArray(v.tabs) ? { tabs: v.tabs.filter((t): t is NoteTab =>
      !!t && typeof t.root === "string" && typeof t.path === "string" && unique.some(f => f.root === t.root))
      .map(t => ({ root: t.root, path: t.path, pinned: !!t.pinned }))
      .filter((t, i, all) => all.findIndex(other => other.root === t.root && other.path === t.path) === i) } : {}),
    ...(v.panes ? { panes: parsePaneLayout(v.panes, (Array.isArray(v.tabs) ? v.tabs : []).filter(t => t && typeof t.root === "string" && typeof t.path === "string").map(tabId)) } : {}),
    mode: v.mode === "source" || v.mode === "read" ? v.mode : "edit",
  };
}

export function closedDirectories(folder: Workspace): string[] {
  if (folder.closedDirectories) return folder.closedDirectories;
  const directories = new Set<string>();
  for (const { path } of folder.files) {
    for (let slash = path.indexOf("/"); slash >= 0; slash = path.indexOf("/", slash + 1)) {
      directories.add(path.slice(0, slash));
    }
  }
  return [...directories];
}
