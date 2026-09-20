import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { driveSupported } from "./platform";
export type DriveStatus = { account?: string | null; connected: boolean; email: string | null; configured: boolean; error?: string | null };
export function useDriveConnection() {
  const [status, setStatus] = useState<DriveStatus>({ connected: false, email: null, configured: false });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(driveSupported);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    if (!driveSupported) return;
    let active = true;
    invoke<DriveStatus>("drive_status").then(value => { if (active) { setStatus(value); setError(value.error ?? ""); } })
      .catch(error => { if (active) setError(String(error)); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  async function run(command: "drive_connect" | "drive_disconnect") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try { setStatus(await invoke<DriveStatus>(command)); }
    catch (error) { setError(String(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return { status, busy, checking, error, supported: driveSupported,
    connect: () => run("drive_connect"), disconnect: () => run("drive_disconnect"),
    cancel: () => invoke("drive_cancel").catch(error => setError(String(error))),
  };
}
export type DriveConnection = ReturnType<typeof useDriveConnection>;
