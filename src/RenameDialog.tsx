import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

export default function RenameDialog({ root, path, onRename, onClose, compact = false }: {
  compact?: boolean;
  root: string;
  path: string;
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const original = path.split("/").at(-1)!;
  const dot = original.lastIndexOf(".");
  const [name, setName] = useState(dot > 0 ? original.slice(0, dot) : original);
  const [extension, setExtension] = useState(dot > 0 ? original.slice(dot) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const suffix = extension.trim().replace(/^\./, "");
  const filename = name + (suffix ? `.${suffix}` : "");
  const destination = `${root.replace(/\/$/, "")}/${path.slice(0, path.lastIndexOf("/") + 1)}${filename}`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    input.current?.select();
    return () => { element.close(); if (!compact || !previous?.matches('input, textarea, [contenteditable="true"]')) previous?.focus(); };
  }, []);

  async function submit() {
    if (pending.current) return;
    if (!name.trim()) { setError("Enter a file name."); input.current?.focus(); return; }
    if (filename === original) { onClose(); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onRename(filename);
      onClose();
    } catch (error) {
      setError(String(error).replace(/^Error: /, ""));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="rename-dialog" data-compact={compact} aria-labelledby="rename-title"
    onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }}
    onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <FileText className="dialog-icon" size={24} />
      <h2 id="rename-title">Rename file</h2>
      <div className="rename-fields">
        <label>File name
          <input ref={input} value={name} readOnly={busy} autoComplete="off" spellCheck={false}
            onChange={event => { setName(event.target.value); setError(""); }} />
        </label>
        {!compact && <label>Extension
          <input value={extension} readOnly={busy} autoComplete="off" spellCheck={false}
            onChange={event => { setExtension(event.target.value); setError(""); }} />
        </label>}
      </div>
      {compact ? <p className="rename-path">{extension ? `File type stays ${extension}` : "File has no extension"}</p> : <div className="rename-path"><span>Path</span><p>{destination}</p></div>}
      {error && <p className="rename-error" role="alert">{error}</p>}
      <div className="dialog-buttons">
        <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "Renaming…" : "Rename"}</button>
      </div>
    </form>
  </dialog>;
}
