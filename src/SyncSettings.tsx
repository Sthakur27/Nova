import { useEffect, useRef, useState } from "react";
import { Cloud, FileText, Folder, X } from "lucide-react";
import type { Workspace } from "./model";
import { syncChoice, syncEntries, syncIncluded, type SyncChoice, type SyncPolicy } from "./syncPolicy";
import { setWorkspaceSyncChoice } from "./storage";

export default function SyncSettings({ folder, onClose, onSaved }: {
  folder: Workspace; onClose: () => void; onSaved: (policy: SyncPolicy) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [policy, setPolicy] = useState(folder.syncPolicy);
  const [error, setError] = useState(folder.syncError ?? "");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
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
    return <div key={path} className="sync-row" style={{ paddingLeft: 12 + (path ? path.split("/").length : 0) * 14 }}>
      {directory ? <Folder size={15} /> : <FileText size={15} />}
      <div className="sync-name"><span title={path || folder.root}>{name}</span><small>{syncIncluded(policy, path) ? (directory ? "Include by default" : "Included") : (directory ? "Local by default" : "Local only")}</small></div>
      <select aria-label={`Sync choice for ${path || folder.name}`} value={syncChoice(policy, path)} disabled={busy || !!folder.syncError}
        onChange={event => void change(path, event.target.value as SyncChoice)}>
        <option value="inherit">{path ? "Use folder default" : "Local by default"}</option>
        <option value="include">{directory ? "Include by default" : "Include in sync"}</option>
        <option value="exclude">{directory ? "Local by default" : "Keep local"}</option>
      </select>
    </div>;
  }
  return <dialog ref={dialog} className="settings-dialog sync-dialog" aria-labelledby="sync-title" onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }}>
    <header className="settings-header"><div className="settings-emblem"><Cloud size={21} /></div>
      <div><h1 id="sync-title">Sync selection</h1><p>{folder.name}</p></div>
      <button autoFocus className="icon-button" aria-label="Close sync selection" disabled={busy} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="sync-intro"><strong>Google Drive is not connected. Nothing is uploading.</strong>
      <p>Save your choices for future sync. Folder defaults apply to new notes too. Files and subfolders can override them; changing a parent keeps those exceptions.</p>
      <p>These choices only control Nova’s future sync. Other apps, including Google Drive for desktop, can still sync files in folders they manage.</p>
    </div>
    {error && <p className="folder-error" role="alert">{error}</p>}
    <div className="sync-list">{row("", true)}{entries.map(entry => row(entry.path, entry.directory))}</div>
    <footer className="settings-footer"><span role="status">{busy ? "Saving choices…" : `${included} of ${folder.files.length} notes selected · Not connected`}</span><button disabled={busy} onClick={onClose}>Done</button></footer>
  </dialog>;
}
