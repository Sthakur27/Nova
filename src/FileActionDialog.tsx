import { useEffect, useRef, useState } from "react";
import type { Workspace } from "./model";
export default function FileActionDialog({ folder, path, action, onSubmit, onClose }: {
  folder: Workspace; path: string; action: "move" | "delete" | "folder";
  onSubmit: (destination: string) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState(path.slice(0, Math.max(0, path.lastIndexOf("/"))));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => { const previous = document.activeElement as HTMLElement; const el = dialog.current!; el.showModal(); return () => { el.close(); previous?.focus(); }; }, []);
  return <dialog ref={dialog} className="rename-dialog" aria-labelledby="file-action-title" onCancel={e => { e.preventDefault(); if (!pending.current) onClose(); }} onKeyDown={e => e.stopPropagation()}>
    <form onSubmit={async e => { e.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError(""); try { await onSubmit(destination); onClose(); } catch (error) { setError(String(error)); } finally { pending.current = false; setBusy(false); } }}>
      <h2 id="file-action-title">{action === "folder" ? "New folder" : action === "move" ? "Move file" : "Delete file"}</h2>
      <p>{path}</p>
      {action !== "delete" ? <div className="rename-fields file-move-fields"><label>{action === "folder" ? "Folder path" : "Destination folder"} within {folder.name}<input list="folder-destinations" autoFocus value={destination} disabled={busy} onChange={e => setDestination(e.target.value)} placeholder={action === "folder" ? "Projects/Research" : "Leave empty for the root folder"} /><datalist id="folder-destinations">{(folder.directories ?? []).map(directory => <option key={directory} value={directory}/>)}</datalist><small>{action === "folder" ? "Use / to create nested folders." : "Choose an existing folder, or leave empty to move to the root."}</small></label></div> : <p>This permanently deletes the local file and its bookmarks. Existing Google Drive copies are kept, and Nova will not download this deleted file again automatically.</p>}
      {error && <p role="alert" className="rename-error">{error}</p>}
      <div className="dialog-buttons"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Working…" : action === "folder" ? "Create folder" : action === "move" ? "Move" : "Delete"}</button></div>
    </form>
  </dialog>;
}
