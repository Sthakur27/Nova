import { useEffect, useRef, useState } from "react";
import { Cloud, FileText, Folder, X } from "lucide-react";
import type { Workspace } from "./model";
import { syncChoice, syncEntries, syncIncluded, type SyncChoice, type SyncPolicy } from "./syncPolicy";
import { setWorkspaceSyncChoice } from "./storage";

export default function SyncSettings({ folder, folders, initialPath, onFolderChange, onClose, onSaved }: {
  folder: Workspace; folders: Workspace[]; initialPath?: string; onFolderChange: (folder: Workspace) => void; onClose: () => void; onSaved: (policy: SyncPolicy) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [policy, setPolicy] = useState(folder.syncPolicy);
  const [error, setError] = useState(folder.syncError ?? "");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const selectedRow = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
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
      const next = await setWorkspaceSyncChoice(folder.root, path, choice);
      setPolicy(next); onSaved(next); setError("");
    } catch (error) { setError(String(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  function row(path: string, directory: boolean) {
    const name = path ? path.split("/").at(-1)! : folder.name;
    return <div key={path} ref={path === initialPath ? selectedRow : undefined} className={`sync-row${path === initialPath ? " sync-row-current" : ""}`} style={{ paddingLeft: 12 + (path ? path.split("/").length : 0) * 14 }}>
      {directory ? <Folder size={15} /> : <FileText size={15} />}
      <div className="sync-name"><span title={path || folder.root}>{name}</span><small>{syncIncluded(policy, path) ? (directory ? "Include by default" : "Included") : (directory ? "Local by default" : "Local only")}</small></div>
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
      <div><h1 id="sync-title">Sync</h1><p>Choose what stays local and what joins sync.</p></div>
      <button autoFocus className="icon-button" aria-label="Close sync settings" disabled={busy} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="sync-intro"><strong>Google Drive · Not connected</strong>
      <p>Sync transfers are not available in this build yet. Your choices are saved on this device; nothing is uploading.</p>
      <p>Folder defaults apply to existing and new notes. Override any file or subfolder; changing a parent keeps those exceptions.</p>
      <p>These choices apply to Nova only. Other backup or sync apps can still upload files they manage.</p>
    </div>
    {error && <p className="folder-error" role="alert">{error}</p>}
    <div className="sync-filters">
      <label>Folder<select value={folder.root} disabled={busy} onChange={event => {
        const next = folders.find(item => item.root === event.target.value);
        if (next) onFolderChange(next);
      }}>{folders.map(item => <option key={item.root} value={item.root}>{item.name}</option>)}</select></label>
      <label>Find a file or subfolder<input type="search" value={query} placeholder="Search paths…" onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="sync-list">{row("", true)}{entries.filter(entry => entry.path.toLowerCase().includes(query.toLowerCase())).map(entry => row(entry.path, entry.directory))}
      {entries.length === 0 && <p className="sync-empty">No notes yet. The folder default will apply to new notes.</p>}
      {entries.length > 0 && !entries.some(entry => entry.path.toLowerCase().includes(query.toLowerCase())) && <p className="sync-empty">No matching files or subfolders.</p>}
    </div>
    <footer className="settings-footer"><span role="status">{busy ? "Saving choices…" : `${included} of ${folder.files.length} notes selected · Not connected`}</span><button disabled={busy} onClick={onClose}>Done</button></footer>
  </dialog>;
}
