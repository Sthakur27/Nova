import { confirmSyncOff, stopsSync } from "./confirmSyncOff";
import DriveRestore from "./DriveRestore";
import { useEffect, useRef, useState } from "react";
import { Cloud, FileText, Folder, X, ExternalLink, Upload, LoaderCircle, CheckCircle2, AlertCircle } from "lucide-react";
import type { DriveUploads } from "./useDriveUploads";
import type { DriveConnection } from "./useDriveConnection";
import type { Workspace } from "./model";
import { syncChoice, syncEntries, syncIncluded, type SyncChoice, type SyncPolicy } from "./syncPolicy";
import { setWorkspaceSyncChoice } from "./storage";

export default function SyncSettings({ onRestored, uploads, onUpload, drive, folder, folders, initialPath, onFolderChange, onClose, onSaved }: {
  onRestored: (root:string) => Promise<void>; uploads: DriveUploads; onUpload: () => Promise<void>; drive: DriveConnection; folder: Workspace; folders: Workspace[]; initialPath?: string; onFolderChange: (folder: Workspace) => void; onClose: () => void; onSaved: (policy: SyncPolicy) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [policy, setPolicy] = useState(folder.syncPolicy);
  const [error, setError] = useState(folder.syncError ?? "");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const selectedRow = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!pending.current) setPolicy(folder.syncPolicy); }, [folder.syncPolicy]);
  const [query, setQuery] = useState("");
  const [slowCredentialCheck, setSlowCredentialCheck] = useState(false);
  useEffect(() => {
    if (!drive.checking) { setSlowCredentialCheck(false); return; }
    const timer = setTimeout(() => setSlowCredentialCheck(true), 8000);
    return () => clearTimeout(timer);
  }, [drive.checking]);
  useEffect(() => {
    dialog.current?.showModal();
    if (initialPath) {
      selectedRow.current?.scrollIntoView?.({ block: "center" });
      selectedRow.current?.querySelector("select")?.focus();
    }
  }, [initialPath]);
  const entries = syncEntries(folder.files.map(file => file.path));
  const included = folder.files.filter(file => syncIncluded(policy, file.path)).length;
  async function change(path: string, choice: SyncChoice) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (stopsSync(policy, path, choice, folder.files.map(file => file.path))
        && !await confirmSyncOff(path || folder.name)) return;
      const next = await setWorkspaceSyncChoice(folder.root, path, choice);
      setPolicy(next); onSaved(next); setError("");
    } catch (error) { setError(String(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  function row(path: string, directory: boolean) {
    const transfer = uploads.items[`${folder.root}\n${path}`];
    const selected = syncIncluded(policy, path);
    const name = path ? path.split("/").at(-1)! : folder.name;
    return <div key={path} ref={path === initialPath ? selectedRow : undefined} className={`sync-row${!path ? " sync-root-row" : ""}${path === initialPath ? " sync-row-current" : ""}`} style={{ paddingLeft: 14 + Math.min(path ? path.split("/").length : 0, 4) * 12 }}>
      {directory ? <Folder size={15} /> : <FileText size={15} />}
      <div className="sync-name"><span title={path || folder.root}>{name}</span><small data-included={syncIncluded(policy, path)}>{syncIncluded(policy, path) ? (directory ? "Include by default" : "Included") : (directory ? "Local by default" : "Local only")}</small>{!directory && selected && <small className={`sync-file-transfer ${transfer?.state ?? "pending"}`} title={transfer?.message}>{transfer?.state === "uploading" ? <LoaderCircle size={12} /> : transfer?.state === "uploaded" ? <CheckCircle2 size={12} /> : transfer?.state === "error" ? <AlertCircle size={12} /> : null}{transfer?.message ?? "Waiting for sync"}</small>}</div>
      <select aria-label={`Sync choice for ${path || folder.name}`} value={syncChoice(policy, path)} disabled={busy || !!folder.syncError || !folder.root}
        onChange={event => void change(path, event.target.value as SyncChoice)}>
        <option value="inherit">{path ? "Use folder default" : "Default (local only)"}</option>
        <option value="include">{directory ? "Include by default" : "Include in sync"}</option>
        <option value="exclude">{directory ? "Local by default" : "Keep local"}</option>
      </select>
    </div>;
  }
  return <dialog ref={dialog} className="settings-dialog sync-dialog" aria-labelledby="sync-title" onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }}>
    <header className="settings-header"><div className="settings-emblem"><Cloud size={21} /></div>
      <div><h1 id="sync-title">Sync</h1><p>{drive.status.connected ? "Choose what stays local and what joins sync." : "Connect your Google Drive account."}</p></div>
      <button autoFocus className="icon-button" aria-label="Close sync settings" disabled={busy} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="sync-body">
    <div className="sync-intro">
      <div className={`drive-connection${drive.status.connected ? " drive-connected" : ""}`}>
        <div className="drive-account"><strong>{drive.checking ? "Checking Google Drive…" : drive.status.connected ? "Google Drive connected" : "Connect Google Drive"}</strong>{drive.status.connected && <p>{drive.status.email}</p>}</div>
        {drive.status.connected ? <>
          <button disabled={drive.busy || !!uploads.activeRoot} title="Remove this device’s saved access. Your Drive files stay intact." onClick={async () => { if (await confirmSyncOff("this device")) await drive.disconnect(); }}>Disconnect</button>
        </> : <>
          <p>Sign in with Google in your browser, allow Nova’s Drive access, then return here. No server setup or payment is needed.</p>
          <button className="drive-connect" disabled={!drive.supported || drive.busy || drive.checking || !drive.status.configured}
            onClick={() => void drive.connect()}>{drive.busy ? "Waiting for Google…" : "Connect Google Drive"}</button>
          {drive.busy && <><p role="status">Finish sign-in in your browser. This window will update automatically.</p><button onClick={() => void drive.cancel()}>Cancel sign-in</button></>}
          {!drive.supported && <p>Connect using Nova for desktop, iPhone, or iPad. This preview or platform does not support Google sign-in.</p>}
          {drive.supported && !drive.checking && !drive.status.configured && <p>This build is missing Google sign-in configuration. Install a build with Google sign-in configured for this device.</p>}
        </>}
        {slowCredentialCheck && <p role="status">Your system credential store is still responding. Check for a macOS Keychain or Windows credential prompt and allow Nova to read its saved Google connection.</p>}
        {drive.error && <p role="alert">{drive.error}</p>}
      </div>
      {drive.status.connected && <div className="sync-transfer-panel">
        <div className="sync-transfer-actions">
          <button disabled={!!uploads.activeRoot || folder.root === "demo" || !included || busy} onClick={() => void onUpload()}>
            {uploads.activeRoot === folder.root ? <LoaderCircle size={15} className="sync-spin" /> : <Upload size={15} />}
            {uploads.activeRoot === folder.root ? "Syncing…" : "Sync now"}
          </button>
          <button disabled={!!uploads.activeRoot || folder.root === "demo"} onClick={() => void uploads.openFolder(folder.root)}><ExternalLink size={15} />Open in Drive</button>
        </div>
        <p role="status">{uploads.activeRoot === folder.root ? "Checking Drive and syncing selected notes…" : uploads.errors[folder.root] || (uploads.completed[folder.root] ? `Selected notes synced · ${uploads.completed[folder.root]}` : "Selected notes sync after saving and check Drive every minute while Nova is open. Unsaved edits and conflicting changes are preserved.")}</p>
        <small>Uploads go to this workspace’s linked folder inside .nova on Google Drive. Use “Bring notes to this device” for a new local copy. Turning sync off stops uploads and downloads and keeps both copies. Deleting locally keeps the Drive copy; a missing Drive copy pauses sync and keeps your local file.</small>
      </div>}

    </div>
    {error && <p className="folder-error" role="alert">{error}</p>}
    {Object.entries(uploads.items).filter(([key,item]) => key.startsWith(`${folder.root}\n`) && item.state === "error" && !folder.files.some(file => file.path === item.path)).map(([key,item]) => <p key={key} className="folder-error" role="status">{item.path}: {item.message}</p>)}
    {drive.status.connected && <>
    <DriveRestore disabled={!!uploads.activeRoot || drive.busy} onRestored={onRestored} />
    <div className="sync-section-heading"><h2>Files & folders</h2><span>{included} selected</span></div>
    <div className="sync-filters">
      <label>Workspace<select value={folder.root} disabled={busy} onChange={event => {
        const next = folders.find(item => item.root === event.target.value);
        if (next) onFolderChange(next);
      }}>{folders.map(item => <option key={item.root} value={item.root}>{item.name}</option>)}</select></label>
      <label>Find a file or folder<input type="search" value={query} placeholder="Search paths…" onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <p className="sync-selection-hint">Folder defaults include future notes. Individual choices override them.</p>
    <div className="sync-list">{row("", true)}{entries.filter(entry => entry.path.toLowerCase().includes(query.toLowerCase())).map(entry => row(entry.path, entry.directory))}
      {entries.length === 0 && <p className="sync-empty">No notes yet. The folder default will apply to new notes.</p>}
      {entries.length > 0 && !entries.some(entry => entry.path.toLowerCase().includes(query.toLowerCase())) && <p className="sync-empty">No matching files or subfolders.</p>}
    </div>
    <details className="sync-help"><summary>How folder choices work</summary><p>The nearest folder default applies unless a file has its own choice. Changing a parent preserves those exceptions. These choices only affect Nova, not other backup or sync apps.</p></details>
    </>}
    </div>
    <footer className="settings-footer"><span role="status">{busy ? "Saving choices…" : !drive.status.connected ? "Connect Google Drive to choose files" : `${included} of ${folder.files.length} notes selected · ${drive.status.connected ? "Drive connected" : "Not connected"}`}</span><button disabled={busy} onClick={onClose}>Done</button></footer>
  </dialog>;
}
