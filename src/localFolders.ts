import type { Workspace } from "./model";
import type { EditorMode, ExplorerPreferences, FolderPreference } from "./folders";
import { parsePaneLayout, reconcilePanes, type PaneNode } from "./paneLayout";
import { tabId, type NoteTab } from "./tabs";

export type RecentFolder = FolderPreference & {
  tabs: NoteTab[];
  active: string | null;
  mode: EditorMode;
  panes?: PaneNode;
};
export const MAX_RECENT_FOLDERS = 100;
export function folderPreference(folder: Workspace): FolderPreference {
  const { root, name, collapsed, closedDirectories, expandedDirectories, cloudSpace } = folder;
  return { root, name, collapsed, closedDirectories, expandedDirectories, ...(cloudSpace ? { cloudSpace } : {}) };
}
export function rememberFolder(recents: RecentFolder[], folder: Workspace, tabs: NoteTab[], active: { root: string; path: string } | null, mode: EditorMode, panes?: PaneNode): RecentFolder[] {
  if (folder.cloudSpace || folder.root === "demo") return recents;
  const kept = tabs.filter(tab => tab.root === folder.root);
  const session: RecentFolder = { ...folderPreference(folder), tabs: kept, active: active?.root === folder.root && kept.some(tab => tab.path === active.path) ? active.path : kept[0]?.path ?? null, mode,
    ...(panes ? { panes: reconcilePanes(panes, kept.map(tabId), "main") } : {}) };
  return [session, ...recents.filter(recent => recent.root !== folder.root)].slice(0, MAX_RECENT_FOLDERS);
}
export function parseRecents(value: unknown): RecentFolder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): RecentFolder[] => {
    if (!item || typeof item.root !== "string" || typeof item.name !== "string" || item.root === "demo" || seen.has(item.root)) return [];
    seen.add(item.root);
    const tabs: NoteTab[] = Array.isArray(item.tabs) ? item.tabs.filter((tab: NoteTab) => tab && tab.root === item.root && typeof tab.path === "string")
      .map((tab: NoteTab) => ({ root: tab.root, path: tab.path, pinned: !!tab.pinned })) : [];
    const strings = (v: unknown): string[] | undefined => Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : undefined;
    return [{ root: item.root, name: item.name, collapsed: item.collapsed !== false, closedDirectories: strings(item.closedDirectories), expandedDirectories: strings(item.expandedDirectories),
      tabs: tabs.filter((tab, i) => tabs.findIndex(t => tabId(t) === tabId(tab)) === i), active: typeof item.active === "string" ? item.active : null,
      mode: item.mode === "source" || item.mode === "read" ? item.mode : "edit", panes: parsePaneLayout(item.panes, tabs.map(tabId)) }];
  }).slice(0, MAX_RECENT_FOLDERS);
}
/** Legacy roots are inspected once; only the focused local workspace remains mounted. */
export function migrateLocalFolders(prefs: ExplorerPreferences | null, loaded: Workspace[]) {
  const locals = loaded.filter(folder => !folder.cloudSpace);
  const focused = locals.find(folder => folder.root === prefs?.active?.root) ?? locals.find(folder => !folder.error) ?? locals[0];
  let recents = prefs?.recents ?? [];
  for (const folder of [...locals].reverse()) {
    recents = rememberFolder(recents, folder, prefs?.tabs ?? [], prefs?.active ?? null, prefs?.mode ?? "edit", prefs?.panes);
  }
  return { folders: loaded.filter(folder => folder.cloudSpace || folder === focused), recents };
}

/** A folder launch restores only its session; the originating window is untouched. */
export function folderWindowPreferences(saved: ExplorerPreferences | null, root: string): ExplorerPreferences {
  const current = saved?.folders.find(folder => folder.root === root);
  const recent = saved?.recents?.find(folder => folder.root === root);
  const folder = current ?? recent ?? { root, name: root.split(/[\\/]/).at(-1) || root };
  const tabs = current ? (saved?.tabs ?? []).filter(tab => tab.root === root) : recent?.tabs ?? [];
  const path = current && saved?.active?.root === root ? saved.active.path : recent?.active ?? tabs[0]?.path;
  const panes = current ? saved?.panes : recent?.panes;
  return {
    folders: [...(saved?.folders.filter(folder => folder.cloudSpace && folder.root !== root) ?? []), { ...folder, collapsed: false }],
    recents: saved?.recents ?? [], tabs,
    active: path ? { root, path } : null,
    mode: current ? saved?.mode ?? "edit" : recent?.mode ?? "edit",
    panes: panes ? reconcilePanes(panes, tabs.map(tabId), "main") : undefined,
  };
}
