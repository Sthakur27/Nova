import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { exportText } from "./NoteEditor";
import type { WebNote } from "./store";

type Recovery = NonNullable<WebNote["recovery"]>[number];
export default function RecoveryDialog({ note, onClose, onDelete }: {
  note: WebNote; onClose: () => void; onDelete: (index: number, copy: Recovery) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const title = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<{ index: number; copy: Recovery }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal(); closeButton.current?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function remove(index: number, copy: Recovery) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await onDelete(index, copy); setConfirming(undefined); closeButton.current?.focus(); }
    catch (error) { setError(String(error).replace(/^Error: /, "")); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="rename-dialog web-cloud-dialog web-recovery-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h2 id={title}>Recovery copies</h2><button ref={closeButton} disabled={busy} aria-label="Close recovery copies" onClick={onClose}><X size={18}/></button></header>
    <p className="web-cloud-help">Saved versions of {note.name} on this device. Export a copy to keep it, or delete it permanently. Your current note and Drive file stay unchanged.</p>
    {!note.recovery?.length && <p role="status">No recovery copies remain.</p>}
    <ul className="web-recovery-list" aria-busy={busy}>{note.recovery?.map((copy, index) => <li key={index}>
      <strong>Copy {index + 1} · {copy.name}</strong>
      <div className="web-cloud-actions">
        <button onClick={() => exportText(`Recovered ${copy.name}`, copy.text)}>Export recovery copy {index + 1}</button>
        <button disabled={busy} onClick={() => { setError(""); setConfirming({ index, copy }); }}>Delete recovery copy {index + 1}</button>
      </div>
      {confirming?.index === index && <div>
        <p>Delete this recovery copy permanently from this browser? This cannot be undone.</p>
        <div className="web-cloud-actions"><button disabled={busy} onClick={() => setConfirming(undefined)}>Cancel</button>
          <button disabled={busy} onClick={() => void remove(confirming.index, confirming.copy)}>{busy ? "Deleting…" : "Delete permanently"}</button></div>
      </div>}
    </li>)}</ul>
    {error && <p className="web-error" role="alert">{error}</p>}
  </dialog>;
}
