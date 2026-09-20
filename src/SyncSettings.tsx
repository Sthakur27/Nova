import { useEffect, useRef } from "react";
import { Cloud, X, ExternalLink } from "lucide-react";
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
  useEffect(()=>{dialog.current?.showModal();},[]);
  const spaces=folders.filter(folder=>folder.cloudSpace);
  return <dialog ref={dialog} className="settings-dialog sync-dialog" aria-labelledby="sync-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="settings-header"><Cloud size={24}/><div><h1 id="sync-title">Cloud</h1><p>Your notes, available on every connected device.</p></div><button autoFocus className="icon-button" aria-label="Close Cloud settings" onClick={onClose}><X size={18}/></button></header>
    <div className="sync-body"><div className="sync-intro">
      <div className="drive-connection"><strong>{drive.checking ? "Checking connection…" : drive.status.connected ? drive.status.email : "Connect Google Drive"}</strong>
        {drive.status.connected ? <button disabled={drive.busy || !!uploads.activeRoot || cloudLoading} onClick={async()=>{if(await confirmSyncOff("this device")) await drive.disconnect();}}>Disconnect</button> : <>
          <p>Your Cloud spaces appear automatically after connecting. Local folders stay on this computer.</p>
          <button disabled={!drive.supported || !drive.status.configured || drive.checking || drive.busy} onClick={()=>void drive.connect()}>{drive.busy ? "Waiting for Google…" : "Connect Google Drive"}</button>
          {drive.busy && <button onClick={()=>void drive.cancel()}>Cancel sign-in</button>}
          {!drive.status.configured && !drive.checking && <p>This build needs Google sign-in configuration.</p>}
        </>}
        {drive.error && <p role="alert">{drive.error}</p>}
      </div>
      {drive.status.connected && <>
        <p>Cloud notes autosave on this device and upload automatically. You can keep editing offline; changes upload when you reconnect.</p>
        {cloudLoading && <p role="status">Finding and downloading Cloud spaces…</p>}
        {cloudError && <p role="alert">{cloudError}</p>}
        <button disabled={cloudLoading || !!uploads.activeRoot} onClick={onRefreshCloud}>Refresh Cloud</button>
        {spaces.map(space=><section className="cloud-space-card" key={space.root}><h2>{space.name}</h2><p>{space.files.length} notes · {uploads.activeRoot===space.root ? "Syncing…" : uploads.errors[space.root] || (uploads.completed[space.root] ? "Up to date" : "Stored on this device")}</p>
          {Object.entries(uploads.items).filter(([key,item])=>key.startsWith(`${space.root}\n`) && item.state === "error").map(([key,item])=><p role="alert" key={key}><strong>{item.path}</strong>: {item.message}</p>)}
          <button onClick={()=>void uploads.openFolder(space.root)}><ExternalLink size={15}/>Open in Drive</button>
          <button disabled={!!uploads.activeRoot || cloudLoading} onClick={()=>void uploads.upload(space.root)}>Retry sync</button>
        </section>)}
      </>}
    </div></div><footer className="settings-footer"><small>Cloud storage uses Nova’s .nova folder in Google Drive.</small><button onClick={onClose}>Done</button></footer>
  </dialog>;
}
