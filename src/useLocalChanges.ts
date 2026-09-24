import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "./resetLocalState";
import { LocalChangeRetry } from "./localFileReload";
import { desktop } from "./platform";
export type LocalWatch = { root: string; files: string[]; directories: string[] };
type Stamp = { path: string; stamp: string | null; error: string | null };
export type LocalChangeEvent = { generation: string; changes: LocalWatch[]; rescan: boolean; error?: string };
type Options = {
  targets: () => LocalWatch[];
  busy: () => boolean;
  onFile: (root: string, path: string, error: string | null) => Promise<void>;
  onDirectory: (root: string, path: string) => Promise<void>;
  onError: (message: string) => void;
};
type Pending = { root: string; paths: Map<string, boolean> };

/** Native events drive work. Timers only batch or retry already pending changes. */
export function useLocalChanges(enabled: boolean, options: Options) {
  const latest = useRef(options); latest.current = options;
  const stamps = useRef(new Map<string, string>());
  // Stable across unrelated renders, but reconfigure when a tab/folder is opened or closed.
  const signature = JSON.stringify(options.targets().map(target => ({ root: target.root,
    files: [...new Set(target.files)].sort(), directories: [...new Set(target.directories)].sort(),
  })).sort((a, b) => a.root.localeCompare(b.root)));
  useEffect(() => {
    if (!desktop || !enabled) return;
    const targets: LocalWatch[] = JSON.parse(signature);
    const generation = crypto.randomUUID();
    let stopped = false, running = false, configureNeeded = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unlisten: (() => void) | undefined;
    let setup: Promise<unknown> = Promise.resolve();
    const pending = new Map<string, Pending>();
    const errors = new Set<string>();
    const retries = new Map<string, number>();
    const retained = new Set(targets.flatMap(target => [...target.files, ...target.directories].map(path => JSON.stringify([target.root, path]))));
    for (const key of stamps.current.keys()) if (!retained.has(key)) stamps.current.delete(key);
    const report = (message: string) => { if (!stopped && !errors.has(message)) { errors.add(message); latest.current.onError(message); } };
    const queue = (root: string, paths: string[], force: boolean) => {
      const target = pending.get(root) ?? { root, paths: new Map<string, boolean>() };
      for (const path of paths) target.paths.set(path, force || target.paths.get(path) === true);
      if (target.paths.size) pending.set(root, target);
    };
    const queueAll = (force: boolean) => {
      for (const target of targets) queue(target.root, [...target.files, ...target.directories], force);
    };
    const schedule = (delay = 100) => {
      if (stopped || timer !== undefined || document.hidden) return;
      timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
    };
    const retry = (root: string, path: string, force: boolean, error: unknown) => {
      if (error instanceof LocalChangeRetry) { queue(root, [path], force); return; }
      const key = JSON.stringify([root, path]);
      const attempts = (retries.get(key) ?? 0) + 1;
      retries.set(key, attempts);
      if (attempts < 3) queue(root, [path], force);
      else report(`Unable to refresh external changes for ${path || root}: ${String(error)}. Refocus the window or refresh the folder to retry.`);
    };
    const flush = async () => {
      if (stopped || running || document.hidden) return;
      if (latest.current.busy()) { schedule(250); return; }
      running = true;
      try {
        if (configureNeeded) {
          configureNeeded = false;
          setup = invoke<{warnings: string[]}>("watch_local_changes", { targets, generation });
          try {
            const result = await setup as {warnings: string[]};
            if (stopped) return;
            for (const warning of result.warnings) report(warning);
          } catch (error) {
            report(`Live file watching is unavailable: ${String(error)}. Refocus the window or refresh the folder to retry.`);
          }
        }
        if (stopped) return;
        const batches = [...pending.values()]; pending.clear();
        for (const batch of batches) {
          const target = targets.find(target => target.root === batch.root);
          if (!target) continue;
          let result: Stamp[];
          try { result = await invoke<Stamp[]>("local_path_stamps", { root: batch.root, paths: [...batch.paths.keys()] }); }
          catch (error) {
            for (const [path, force] of batch.paths) retry(batch.root, path, force, error);
            continue;
          }
          if (stopped) return;
          for (const entry of result) {
            const force = batch.paths.get(entry.path) === true;
            const key = JSON.stringify([batch.root, entry.path]);
            const value = JSON.stringify([entry.stamp, entry.error]);
            const previous = stamps.current.get(key);
            // Native notifications also catch edits with unchanged/coarse timestamps.
            // Repeated missing-file notifications need only one user-facing notice.
            if (previous === value && (!force || entry.stamp === null || entry.error)) continue;
            if (latest.current.busy()) { queue(batch.root, [entry.path], force); continue; }
            try {
              if (target.files.includes(entry.path)) {
                await latest.current.onFile(batch.root, entry.path, entry.error ?? (entry.stamp === null ? "File was deleted or moved." : null));
              }
              if (stopped) return;
              if (target.directories.includes(entry.path) && (force || previous !== undefined)) {
                await latest.current.onDirectory(batch.root, entry.path);
              }
              stamps.current.set(key, value);
              retries.delete(key);
            } catch (error) { retry(batch.root, entry.path, force, error); }
          }
        }
      } finally {
        running = false;
        if (pending.size || configureNeeded) schedule(250);
      }
    };
    const wake = () => {
      if (document.hidden) return;
      errors.clear(); retries.clear();
      configureNeeded = true;
      queueAll(true);
      schedule();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    // Install the listener first so no event falls between watch setup and observation.
    void getCurrentWindow().listen<LocalChangeEvent>("nova:local-changes", ({ payload }) => {
      if (stopped || payload.generation !== generation) return;
      if (payload.error) report(payload.error);
      if (payload.rescan) { configureNeeded = true; queueAll(true); }
      for (const change of payload.changes) {
        const target = targets.find(target => target.root === change.root);
        if (!target) continue;
        queue(change.root, [
          ...change.files.filter(path => target.files.includes(path)),
          ...change.directories.filter(path => target.directories.includes(path)),
        ], true);
      }
      schedule();
    }).then(stop => {
      if (stopped) { stop(); return; }
      unlisten = stop;
      queueAll(false);
      schedule(0);
    }).catch(error => report(`Unable to listen for local file changes: ${String(error)}`));
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      unlisten?.();
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      void setup.catch(() => {}).then(() => invoke("unwatch_local_changes", { generation })).catch(() => {});
    };
  }, [enabled, signature]);
}
