import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "./resetLocalState";
import { openWorkspace } from "./storage";
import { driveTransfer } from "./driveTransfer";
import type { Workspace } from "./model";

export function useCloudSpaces(connected: boolean, ready: boolean, onSpaces: (spaces: Workspace[]) => void, syncSpace: (root: string) => Promise<void>) {
  const apply = useRef(onSpaces); apply.current = onSpaces;
  const sync = useRef(syncSpace); sync.current = syncSpace;
  const enabled = useRef(connected && ready); enabled.current = connected && ready;
  const generation = useRef(0);
  const pending = useRef<Promise<Workspace[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (!connected || !ready || document.hidden) return;
    setLoading(true); setError("");
    const ticket = generation.current;
    try {
      if (!pending.current) {
        pending.current = driveTransfer(() => invoke<string[]>("cloud_setup")).then(async roots => {
          if (!enabled.current) return [];
          // Release the shared transfer queue before asking the sync scheduler
          // to use it. Existing spaces need reconciliation as well as discovery.
          await Promise.all(roots.map(root => sync.current(root)));
          return Promise.all(roots.map(root => openWorkspace(root)));
        }).finally(() => { pending.current = null; });
      }
      const spaces = await pending.current;
      if (ticket !== generation.current) return;
      apply.current(spaces); setLoaded(true);
    } catch (error) { if (ticket === generation.current) setError(String(error)); }
    finally { if (ticket === generation.current) setLoading(false); }
  }, [connected, ready]);
  useEffect(() => {
    enabled.current = connected && ready;
    generation.current++; setLoaded(false); setLoading(false); setError("");
    if (!connected || !ready) return;
    void refresh();
    const resume = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(resume, 60_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => { enabled.current = false; generation.current++; clearInterval(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [connected, ready, refresh]);
  return {loading, error, loaded, refresh};
}
