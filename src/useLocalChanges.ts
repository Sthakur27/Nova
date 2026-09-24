import { useEffect, useRef } from "react";
import { invoke } from "./resetLocalState";
import { LocalChangeRetry } from "./localFileReload";
import { desktop } from "./platform";
export type LocalWatch = { root: string; files: string[]; directories: string[] };
type Stamp = { path: string; stamp: string | null; error: string | null };
type Options = {
  targets: () => LocalWatch[];
  busy: () => boolean;
  onFile: (root: string, path: string, error: string | null) => Promise<void>;
  onDirectory: (root: string, path: string) => Promise<void>;
  onError: (message: string) => void;
};
/** Poll metadata only; read file bodies only on first observation or a change. */
export function useLocalChanges(enabled: boolean, options: Options) {
  const latest = useRef(options); latest.current = options;
  useEffect(() => {
    if (!desktop || !enabled) return;
    let stopped = false, running = false;
    const stamps = new Map<string, string>();
    const errors = new Map<string, string>();
    const poll = async () => {
      if (stopped || running || document.hidden || latest.current.busy()) return;
      running = true;
      const retained = new Set<string>();
      try {
        for (const target of latest.current.targets()) {
          const paths = [...new Set([...target.files, ...target.directories])];
          for (const path of paths) retained.add(JSON.stringify([target.root, path]));
          try {
            const result = await invoke<Stamp[]>("local_path_stamps", { root: target.root, paths });
            if (stopped) return;
            for (const entry of result) {
              const key = JSON.stringify([target.root, entry.path]);
              const value = JSON.stringify([entry.stamp, entry.error]);
              const previous = stamps.get(key);
              if (previous === value) continue;
              if (latest.current.busy()) continue;
              // Ignore responses for folders/tabs removed during the IPC request.
              const current = latest.current.targets().find(t => t.root === target.root);
              if (!current) continue;
              if (current.files.includes(entry.path)) {
                await latest.current.onFile(target.root, entry.path, entry.error ?? (entry.stamp === null ? "File was deleted or moved." : null));
              }
              if (current.directories.includes(entry.path) && previous !== undefined) {
                await latest.current.onDirectory(target.root, entry.path);
              }
              stamps.set(key, value);
            }
            errors.delete(target.root);
          } catch (error) {
            if (error instanceof LocalChangeRetry) continue;
            const message = `Unable to check external changes: ${String(error)}`;
            if (errors.get(target.root) !== message) latest.current.onError(message);
            errors.set(target.root, message);
          }
        }
        for (const key of stamps.keys()) if (!retained.has(key)) stamps.delete(key);
      } finally { running = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    const wake = () => void poll();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, [enabled]);
}
