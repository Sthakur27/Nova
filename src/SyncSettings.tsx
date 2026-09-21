import { useEffect, useRef } from "react";
import { Cloud, X, ExternalLink, RefreshCw } from "lucide-react";
import { confirmSyncOff } from "./confirmSyncOff";
import type { DriveUploads } from "./useDriveUploads";
import type { DriveConnection } from "./useDriveConnection";
import type { Workspace } from "./model";
import type { SyncPolicy } from "./syncPolicy";
export default function SyncSettings({drive, uploads, folders, onClose, cloudLoading, cloudError, onRefreshCloud}: {
  onRestored:(root:string)=>Promise<void>; uploads:DriveUploads; onUpload:()=>Promise<void>; drive:DriveConnection;
  folder:Workspace; folders:Workspace[]; initialPath?:string; onFolderChange:(folder:Workspace)=>void; onClose:()=>void; onSaved:(policy:SyncPolicy)=>void;
  cloudLoading?:boolean; cloudError?:string; onRefreshCloud?:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  const spaces=folders.filter(folder=>folder.cloudSpace);
  return <dialog ref={dialog} className="settings-dialog sync-dialog" aria-labelledby="sync-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="settings-header"><div className="settings-emblem"><Cloud size={21} aria-hidden="true" /></div><div><h1 id="sync-title">Cloud</h1><p>Your notes, available on every connected device.</p></div><button autoFocus className="icon-button" aria-label="Close Cloud settings" onClick={onClose}><X size={18}/></button></header>
    <div className="sync-body"><div className="sync-intro">
      <div className="drive-connection cloud-connection"><div className="cloud-account-heading"><div className="drive-account"><span className="cloud-eyebrow">Google Drive</span><strong>{drive.checking ? "Checking connection…" : drive.status.connected ? drive.status.email : "Connect your account"}</strong></div>
        {drive.status.connected && <button className="settings-action" disabled={drive.busy || !!uploads.activeRoot || cloudLoading} onClick={async()=>{if(await confirmSyncOff("this device")) await drive.disconnect();}}>Disconnect</button>}</div>
        {!drive.status.connected && <>
          <p>Your Cloud spaces appear automatically after connecting. Local folders stay on this computer.</p>
          <button className="settings-action" disabled={!drive.supported || !drive.status.configured || drive.checking || drive.busy} onClick={()=>void drive.connect()}>{drive.busy ? "Waiting for Google…" : "Connect Google Drive"}</button>
          {drive.busy && <button className="settings-action" onClick={()=>void drive.cancel()}>Cancel sign-in</button>}
          {!drive.status.configured && !drive.checking && <p>This build needs Google sign-in configuration.</p>}
        </>}
        {drive.error && <p role="alert">{drive.error}</p>}
      </div>
      {drive.status.connected && <>
        <p className="cloud-description">Your notes save automatically and stay available offline. Changes sync when you reconnect.</p>
        {cloudLoading && <p role="status">Finding and downloading Cloud spaces…</p>}
        {cloudError && <p role="alert">{cloudError}</p>}
        <div className="cloud-spaces-heading"><h2>Your spaces</h2><button className="settings-action" disabled={cloudLoading || !!uploads.activeRoot} onClick={onRefreshCloud}><RefreshCw size={14} aria-hidden="true" />{cloudLoading ? "Refreshing…" : "Refresh Cloud"}</button></div>
        <div className="cloud-spaces">
        {spaces.map(space=><section className="cloud-space-card" key={space.root}><h2>{space.name}</h2><p>{space.files.length} notes · {uploads.activeRoot===space.root ? "Syncing…" : uploads.errors[space.root] || (uploads.completed[space.root] ? "Up to date" : "Stored on this device")}</p>
          {Object.entries(uploads.items).filter(([key,item])=>key.startsWith(`${space.root}\n`) && item.state === "error").map(([key,item])=><p role="alert" key={key}><strong>{item.path}</strong>: {item.message}</p>)}
          <div className="cloud-space-actions"><button className="settings-action" onClick={()=>void uploads.openFolder(space.root)}><ExternalLink size={14} aria-hidden="true" />Open in Drive</button>
          <button className="settings-action" disabled={!!uploads.activeRoot || cloudLoading} onClick={()=>void uploads.upload(space.root)}><RefreshCw size={14} aria-hidden="true" />Retry sync</button></div>
        </section>)}
        {!spaces.length && !cloudLoading && !cloudError && <p className="cloud-empty">No Cloud spaces yet.</p>}
        </div>
      </>}
    </div></div><footer className="settings-footer"><small>Cloud storage uses Nova’s .nova folder in Google Drive.</small><button onClick={onClose}>Done</button></footer>
  </dialog>;
}
