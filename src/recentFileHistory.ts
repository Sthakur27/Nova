import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "./model";

export type RecentFile = { root: string; path: string };
export const RECENT_FILES_KEY = "nova:recent-files:v1";
const MAX_RECENT_FILES = 200;
const same = (a: RecentFile, b: RecentFile) => a.root === b.root && a.path === b.path;
export function parseRecentFiles(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return [];
  const result: RecentFile[] = [];
  for (const item of value) {
    if (!item || typeof item.root !== "string" || !item.root || typeof item.path !== "string" || !item.path || item.path === ".nova") continue;
    const file = { root: item.root, path: item.path };
    if (!result.some(previous => same(previous, file))) result.push(file);
    if (result.length === MAX_RECENT_FILES) break;
  }
  return result;
}
export function rememberFile(files: RecentFile[], file: RecentFile): RecentFile[] {
  return parseRecentFiles([file, ...files]);
}
export function visibleRecentFiles(files: RecentFile[], folders: Pick<Workspace, "root">[]): RecentFile[] {
  return files.filter(file => folders.some(folder => folder.root === file.root));
}
export function relocateRecentFile(files: RecentFile[], from: RecentFile, to: RecentFile): RecentFile[] {
  return parseRecentFiles(files.map(file => same(file, from) ? to : file));
}
function read(): RecentFile[] {
  const raw = localStorage.getItem(RECENT_FILES_KEY);
  try { return parseRecentFiles(JSON.parse(raw ?? "[]")); } catch { return []; }
}
export function useRecentFiles() {
  const [files, setFiles] = useState<RecentFile[]>(() => { try { return read(); } catch { return []; } });
  const [error, setError] = useState("");
  const update = useCallback((change: (files: RecentFile[]) => RecentFile[]) => {
    try {
      const next = change(read());
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
      setFiles(next); setError("");
    } catch { setError("Recent files could not be saved on this device."); }
  }, []);
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key !== RECENT_FILES_KEY && event.key !== null) return;
      try { setFiles(read()); setError(""); } catch { setError("Recent files could not be read on this device."); }
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  const remember = useCallback((file: RecentFile) => update(files => rememberFile(files, file)), [update]);
  const remove = useCallback((file: RecentFile) => update(files => files.filter(item => !same(item, file))), [update]);
  const relocate = useCallback((from: RecentFile, to: RecentFile) => update(files => relocateRecentFile(files, from, to)), [update]);
  const clear = useCallback((folders: Pick<Workspace, "root">[]) => update(files => files.filter(file => !folders.some(folder => folder.root === file.root))), [update]);
  return { files, error, remember, remove, relocate, clear };
}
