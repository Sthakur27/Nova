import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "./resetLocalState";
import { listen } from "@tauri-apps/api/event";
import { driveTransfer } from "./driveTransfer";
import { driveSupported } from "./platform";
export type UploadItem = { path: string; state: "uploading" | "uploaded" | "error"; message: string };
export type SyncChange = { path: string; previousPath: string };
type Report = { root: string; folderUrl: string; items: UploadItem[]; changes?: SyncChange[]; uploaded?: boolean };
type SyncContext = { roots: string[]; focusedFile?: () => { root: string; path: string } | null; protectedPaths: (root: string) => string[]; onComplete: (root: string, changes: SyncChange[]) => Promise<void> };
export function useDriveUploads(connected: boolean) {
  const context = useRef<SyncContext | null>(null);
  const queuedRoots = useRef(new Set<string>());
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [transferringRoot, setTransferringRoot] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, UploadItem>>({});
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [completed, setCompleted] = useState<Record<string,string>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const versions = useRef<Record<string, number>>({});
  const enabled = useRef(connected); enabled.current = connected;
  const queue = useRef(Promise.resolve());
  const timers = useRef(new Map<string,ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!driveSupported) return;
    const subscription = listen<UploadItem & {root: string}>("drive-upload-progress", ({payload}) => {
      if (!enabled.current) return;
      if (payload.state === "uploading") setTransferringRoot(payload.root);
      setItems(old => ({...old,[`${payload.root}\n${payload.path}`]:payload}));
    });
    return () => { void subscription.then(unlisten => unlisten()); };
  }, []);
  useEffect(() => {
    if (!connected) { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); setItems({}); setErrors({}); setCompleted({}); setLastSyncedAt({}); setPending({}); setTransferringRoot(null); }
  }, [connected]);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);
  const upload = useCallback((root: string, onlyPath?: string) => {
    if (!driveSupported || root === "demo" || !root || !enabled.current) return Promise.resolve();
    if (queuedRoots.current.has(root)) return queue.current;
    queuedRoots.current.add(root);
    if (!onlyPath) { clearTimeout(timers.current.get(root)); timers.current.delete(root); }
    const task = queue.current.then(async () => {
      if (!enabled.current || document.visibilityState === "hidden") { queuedRoots.current.delete(root); return; }
      if (onlyPath && (!document.hasFocus() || context.current?.focusedFile?.()?.root !== root || context.current?.focusedFile?.()?.path !== onlyPath)) { queuedRoots.current.delete(root); return; }
      setActiveRoot(root);
      const version = versions.current[root] ?? 0;
      const protectedPaths = context.current?.protectedPaths(root) ?? [];
      try {
        const report = await driveTransfer(() => {
          const selected = context.current?.focusedFile?.();
          const protectedPaths = context.current?.protectedPaths(root) ?? [];
          if (!enabled.current || document.visibilityState === "hidden"
            || (onlyPath && (!document.hasFocus() || selected?.root !== root || selected.path !== onlyPath || protectedPaths.includes(onlyPath)))) return Promise.resolve(null);
          return invoke<Report>("drive_upload", {root, protectedPaths, ...(onlyPath ? {onlyPath} : {})});
        });
        if (!report) return;
        setItems(old => {
          const next = onlyPath ? {...old} : Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith(`${root}\n`)));
          for (const item of report.items) next[`${root}\n${item.path}`] = item;
          return JSON.stringify(old) === JSON.stringify(next) ? old : next;
        });
        await context.current?.onComplete(root, report.changes ?? []);
        const failed = report.items.filter(item => item.state === "error");
        const changed = !!report.uploaded || !!report.changes?.length;
        if (!failed.length && enabled.current && changed) {
          setLastSyncedAt(old => ({...old,[root]:Date.now()}));
        }
        if (failed.length) setErrors(old => ({...old,[root]:`${failed.length} file${failed.length === 1 ? "" : "s"} need attention. See the messages below.`}));
        else if (!onlyPath && enabled.current && !protectedPaths.length
          && !(context.current?.protectedPaths(root).length)
          && version === (versions.current[root] ?? 0)) {
          setErrors(old => old[root] ? {...old,[root]:""} : old);
          setCompleted(old => old[root] ? old : {...old,[root]:new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})});
          setLastSyncedAt(old => old[root] ? old : {...old,[root]:Date.now()});
          setPending(old => old[root] ? {...old,[root]:false} : old);
        }
      } catch (error) { setErrors(old => ({...old,[root]:String(error)})); }
      finally { queuedRoots.current.delete(root); setActiveRoot(null); setTransferringRoot(null); }
    });
    queue.current = task;
    return task;
  }, []);
  const schedule = useCallback((root: string) => {
    if (!driveSupported || !enabled.current || !root || root === "demo") return;
    versions.current[root] = (versions.current[root] ?? 0) + 1;
    setPending(old => ({...old,[root]:true}));
    clearTimeout(timers.current.get(root));
    timers.current.set(root,setTimeout(() => { timers.current.delete(root); void upload(root); },1500));
    setCompleted(old => ({...old,[root]:""}));
    setItems(old => Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith(`${root}\n`))));
  }, [upload]);
  useEffect(() => {
    if (!driveSupported || !connected) return;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      for (const root of context.current?.roots ?? []) void upload(root);
    };
    const initial = setTimeout(check, 2500);
    const timer = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [connected, upload]);
  useEffect(() => {
    if (!driveSupported || !connected) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden" || !document.hasFocus()) return;
      const selected = context.current?.focusedFile?.();
      if (!selected || !context.current?.roots.includes(selected.root)
        || context.current.protectedPaths(selected.root).includes(selected.path)
        || queuedRoots.current.has(selected.root)) return;
      void upload(selected.root, selected.path);
    }, 5000);
    return () => clearInterval(timer);
  }, [connected, upload]);
  async function openFolder(root: string) {
    try { await driveTransfer(() => invoke("drive_open_folder",{root})); }
    catch (error) { setErrors(old => ({...old,[root]:String(error)})); }
  }
  return {activeRoot,transferringRoot,items,errors,completed,lastSyncedAt,pending,upload,schedule,openFolder, configure: (next: SyncContext) => { context.current = next; }};
}
export type DriveUploads = ReturnType<typeof useDriveUploads>;
