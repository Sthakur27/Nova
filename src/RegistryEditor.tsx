import { useEffect, useRef, useState } from "react";
import { invoke } from "./resetLocalState";
import { clearDraft, loadDraft, storeDraft } from "./drafts";
import type { DocumentData, Workspace } from "./model";

type Saved = { text: string; revision: string };
export default function RegistryEditor({ folder, onClose, onSaved }: {
  folder: Workspace; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Saved | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const recovery = useRef<Promise<void>>(Promise.resolve());
  const root = folder.root;
  const remember = (next: Saved) => {
    const data: DocumentData = { ...next, bookmarks: [] };
    recovery.current = storeDraft(root, ".nova", data);
    void recovery.current.catch(error => setError(`Could not preserve recovery draft: ${String(error)}`));
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = dialog.current!;
    el.showModal();
    let cancelled = false;
    void Promise.all([invoke<Saved>("read_registry_document", { root }), loadDraft(root, ".nova")]).then(([disk, recovery]) => {
      if (cancelled) return;
      const next = recovery && recovery.text !== disk.text ? recovery : disk;
      setSaved(disk); setDraft(next);
      if (next !== disk) setStatus("Recovered unsaved .nova edits.");
    }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; el.close(); previous?.focus(); };
  }, [root]);
  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    setValidation(null);
    const timer = setTimeout(() => {
      void invoke("validate_registry_document", { root, text: draft.text }).then(() => {
        if (!cancelled) setValidation("");
      }).catch(error => { if (!cancelled) setValidation(String(error)); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draft, root]);
  const close = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await recovery.current; onClose(); }
    catch (error) { setError(`Could not preserve recovery draft. Copy your edits before closing: ${String(error)}`); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = async () => {
    if (pending.current || !draft || validation !== "" || draft.revision !== saved?.revision || draft.text === saved?.text) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await recovery.current;
      const revision = await invoke<string>("save_registry_document", { root, text: draft.text, revision: draft.revision });
      const next = { text: draft.text, revision };
      setDraft(next); setSaved(next);
      await clearDraft(root, ".nova");
      setStatus("Saved .nova.");
      await onSaved();
    } catch (error) { setError(String(error)); }
    finally { pending.current = false; setBusy(false); }
  };
  const reload = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const disk = await invoke<Saved>("read_registry_document", { root });
      await clearDraft(root, ".nova");
      recovery.current = Promise.resolve();
      setSaved(disk); setDraft(disk); setStatus("Reloaded saved .nova; discarded the recovery draft.");
    } catch (error) { setError(String(error)); }
    finally { pending.current = false; setBusy(false); }
  };
  const conflict = !!draft && !!saved && draft.revision !== saved.revision;
  return <dialog ref={dialog} className="rename-dialog registry-editor" aria-labelledby="registry-title"
    onCancel={event => { event.preventDefault(); void close(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    }}>
    <h2 id="registry-title">.nova · {folder.name}</h2>
    <p>Workspace metadata. Edit JSON, then save explicitly. Invalid edits stay in your recovery draft.</p>
    <p>Starred paths, sync choices, and custom fields are editable. Cloud identity and tracking fields are managed by Nova and must keep their saved values.</p>
    {draft && <textarea autoFocus aria-label=".nova JSON" spellCheck={false} value={draft.text} disabled={busy}
      onChange={event => { const next = { ...draft, text: event.target.value }; setDraft(next); setValidation(null); setStatus(""); remember(next); }} />}
    {draft && validation === null && <p role="status">Validating…</p>}
    {validation && <p role="alert" className="rename-error">{validation}</p>}
    {conflict && <p role="alert" className="rename-error">The saved file changed since this draft was created. Copy your edits before reloading.</p>}
    {error && <p role="alert" className="rename-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    <div className="dialog-buttons">
      <button disabled={busy || !draft} onClick={() => { if (window.confirm("Discard this .nova draft and reload the saved file? Copy any edits you want to keep first.")) void reload(); }}>Discard draft and reload</button>
      <button disabled={busy} onClick={() => void close()}>Close</button>
      <button className="primary" disabled={busy || !draft || validation !== "" || conflict || draft.text === saved?.text} onClick={() => void save()}>Save .nova</button>
    </div>
  </dialog>;
}
