import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "./platform";
export type UploadItem = { path: string; state: "uploading" | "uploaded" | "error"; message: string };
type Report = { root: string; folderUrl: string; items: UploadItem[] };
export function useDriveUploads(connected: boolean) {
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, UploadItem>>({});
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [completed, setCompleted] = useState<Record<string,string>>({});
  const enabled = useRef(connected); enabled.current = connected;
  const queue = useRef(Promise.resolve());
  const timers = useRef(new Map<string,ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!desktop) return;
    const subscription = listen<UploadItem & {root: string}>("drive-upload-progress", ({payload}) => {
      setItems(old => ({...old,[`${payload.root}\n${payload.path}`]:payload}));
    });
    return () => { void subscription.then(unlisten => unlisten()); };
  }, []);
  useEffect(() => {
    if (!connected) { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); setItems({}); setErrors({}); setCompleted({}); }
  }, [connected]);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);
  const upload = useCallback((root: string) => {
    if (!desktop || root === "demo" || !root || !enabled.current) return Promise.resolve();
    clearTimeout(timers.current.get(root)); timers.current.delete(root);
    const task = queue.current.then(async () => {
      if (!enabled.current) return;
      setItems(old => Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith(`${root}\n`))));
      setActiveRoot(root); setErrors(old => ({...old,[root]:""}));
      try {
        const report = await invoke<Report>("drive_upload",{root});
        setItems(old => ({...old,...Object.fromEntries(report.items.map(item => [`${root}\n${item.path}`,item]))}));
        const failed = report.items.filter(item => item.state === "error");
        if (failed.length) setErrors(old => ({...old,[root]:`${failed.length} file${failed.length === 1 ? "" : "s"} need attention. See the messages below.`}));
        else setCompleted(old => ({...old,[root]:new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}));
      } catch (error) { setErrors(old => ({...old,[root]:String(error)})); }
      finally { setActiveRoot(null); }
    });
    queue.current = task;
    return task;
  }, []);
  const schedule = useCallback((root: string) => {
    if (!desktop || !enabled.current || !root || root === "demo") return;
    clearTimeout(timers.current.get(root));
    timers.current.set(root,setTimeout(() => { timers.current.delete(root); void upload(root); },1500));
    setCompleted(old => ({...old,[root]:""}));
    setItems(old => Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith(`${root}\n`))));
  }, [upload]);
  async function openFolder(root: string) {
    try { await invoke("drive_open_folder",{root}); }
    catch (error) { setErrors(old => ({...old,[root]:String(error)})); }
  }
  return {activeRoot,items,errors,completed,upload,schedule,openFolder};
}
export type DriveUploads = ReturnType<typeof useDriveUploads>;
