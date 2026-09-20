import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";

export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "installing";

export function useAppUpdate(enabled: boolean, prepare: () => Promise<void>, release: () => void) {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | undefined>();
  const update = useRef<Update | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const downloaded = useRef(false);
  const installed = useRef(false);

  const checkNow = useCallback(async () => {
    if (!enabled || busy.current || downloaded.current) return;
    busy.current = true;
    setError("");
    setPhase("checking");
    try {
      const next = await check({ timeout: 15000 });
      if (!mounted.current) { await next?.close(); return; }
      const previous = update.current;
      update.current = next;
      void previous?.close().catch(() => {});
      setVersion(next?.version ?? "");
      setPhase(next ? "available" : "current");
    } catch (cause) {
      if (mounted.current) {
        setError(`Could not check for updates. Check your connection and try again. ${String(cause)}`);
        setPhase(update.current ? "available" : "idle");
      }
    } finally { busy.current = false; }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    // Delay startup slightly so opening a note takes priority (and StrictMode can clean up).
    const startup = enabled ? window.setTimeout(() => void checkNow(), 3000) : undefined;
    return () => {
      mounted.current = false;
      window.clearTimeout(startup);
      void update.current?.close().catch(() => {});
      update.current = null;
    };
  }, [enabled, checkNow]);

  const download = async () => {
    if (busy.current || !update.current) return;
    busy.current = true;
    setError("");
    setProgress(undefined);
    setPhase("downloading");
    let total = 0, received = 0;
    try {
      await update.current.download(event => {
        if (!mounted.current) return;
        if (event.event === "Started") { total = event.data.contentLength ?? 0; received = 0; }
        if (event.event === "Progress") received += event.data.chunkLength;
        setProgress(total > 0 ? Math.min(100, Math.round(received / total * 100)) : undefined);
      }, { timeout: 120000 });
      downloaded.current = true;
      if (mounted.current) setPhase("ready");
    } catch (cause) {
      if (mounted.current) { setPhase("available"); setError(`Download failed. Try again. ${String(cause)}`); }
    } finally { busy.current = false; }
  };

  const restart = async () => {
    if (busy.current || !downloaded.current || !update.current) return;
    busy.current = true;
    setError("");
    setPhase("installing");
    let locked = false, prepared = false;
    try {
      await prepare();
      prepared = true;
      await invoke("begin_update");
      locked = true;
      if (!installed.current) {
        await update.current.install();
        installed.current = true;
      }
      await invoke("restart_after_update");
    } catch (cause) {
      if (locked) await invoke("cancel_update").catch(() => {});
      if (prepared) release();
      if (mounted.current) { setPhase("ready"); setError(`Could not restart to update. ${String(cause)}`); }
    } finally { busy.current = false; }
  };
  return { phase, version, error, progress, checkNow, download, restart };
}
