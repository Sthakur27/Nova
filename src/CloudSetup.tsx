import { Cloud } from "lucide-react";
import type { DriveConnection } from "./useDriveConnection";
export default function CloudSetup({drive, loading, error, retry}: {drive: DriveConnection; loading: boolean; error: string; retry: () => void}) {
  return <main className="cloud-setup"><Cloud size={40}/><h1>Your notes, everywhere.</h1>
    <p>Connect Google Drive to open your Cloud notes on this device. Your spaces appear automatically and your edits save as you write.</p>
    <p className="cloud-setup-detail">Notes stay available offline after downloading. Nova stores them in its own .nova folder in your Drive.</p>
    {drive.checking ? <p role="status">Checking your connection…</p> : !drive.status.connected ? <>
      <button disabled={!drive.supported || !drive.status.configured || drive.busy} onClick={()=>void drive.connect()}>{drive.busy ? "Waiting for Google…" : "Connect Google Drive"}</button>
      {drive.busy && <button onClick={()=>void drive.cancel()}>Cancel sign-in</button>}
      {!drive.status.configured && <p>This build needs Google sign-in configuration.</p>}
    </> : <><p role="status">{loading ? "Bringing your Cloud notes to this device…" : "Preparing Cloud…"}</p>{!loading && <button onClick={retry}>Try again</button>}</>}
    {(drive.error || error) && <p role="alert">{drive.error || error}</p>}
  </main>;
}
