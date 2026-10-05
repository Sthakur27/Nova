import { useEffect, useId, useRef, useState } from "react";
import { validName } from "./drive";

export default function FilenameDialog({ title, initialName, action, onSubmit, onClose }: {
  title: string; initialName: string; action: string;
  onSubmit: (name: string) => Promise<void>; onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal(); input.current?.focus();
    const dot = initialName.lastIndexOf(".");
    input.current?.setSelectionRange(0, dot > 0 ? dot : initialName.length);
    return () => { element.close(); previous?.focus(); };
  }, []);
  async function submit() {
    if (pending.current) return;
    if (!validName(name)) { setError("Choose a filename without slashes or reserved characters."); input.current?.focus(); return; }
    pending.current = true; setBusy(true); setError("");
    try { await onSubmit(name); onClose(); }
    catch (error) { setError(String(error).replace(/^Error: /, "")); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="rename-dialog web-filename-dialog" aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <form aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <h2 id={`${id}-title`}>{title}</h2>
      <label>Filename<input ref={input} value={name} readOnly={busy} autoComplete="off" spellCheck={false}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
        onChange={event => { setName(event.target.value); setError(""); }} /></label>
      <p id={`${id}-hint`}>Include the file extension, such as .md or .txt.</p>
      {error && <p id={`${id}-error`} role="alert" className="rename-error">{error}</p>}
      <div className="dialog-buttons"><button type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : action}</button></div>
    </form>
  </dialog>;
}
