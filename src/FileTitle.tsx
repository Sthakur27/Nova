import { useId, useLayoutEffect, useRef, useState } from "react";

export function fileTitle(path = "") {
  const name = path.split(/[\\/]/).at(-1) || "Untitled";
  const extension = name.lastIndexOf(".");
  // Preserve extensionless files and leading-dot names such as .env.
  return extension > 0 ? name.slice(0, extension) : name;
}

export default function FileTitle({ path, onRename }: { path: string; onRename?: (name: string) => Promise<void> }) {
  const name = fileTitle(path);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const cancelled = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();

  useLayoutEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
  }, [editing]);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "0px";
    input.current.style.height = `${input.current.scrollHeight}px`;
  }, [editing, draft]);

  function beginEditing() {
    cancelled.current = false;
    setDraft(name);
    setError("");
    setEditing(true);
  }

  async function commit() {
    if (pending.current || cancelled.current || !onRename) return;
    const next = draft.trim();
    if (!next || /[/\\:*?"<>|\x00-\x1f\x7f]/.test(next) || next === "." || next === "..") {
      setError("Enter a valid file name without slashes or special characters.");
      return;
    }
    if (next === name) { setEditing(false); return; }
    const original = path.split(/[\\/]/).at(-1) ?? "";
    const dot = original.lastIndexOf(".");
    const extension = dot > 0 ? original.slice(dot) : "";
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onRename(next + extension);
      setEditing(false);
    } catch (error) {
      setError(String(error).replace(/^Error: /, ""));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <header className="file-heading">
    {editing ? <>
      <textarea ref={input} className="file-title-input" aria-label="File name" dir="auto"
        value={draft} rows={1} readOnly={busy} aria-busy={busy} aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined} spellCheck={false}
        onChange={event => { setDraft(event.target.value); setError(""); }}
        onBlur={() => { void commit(); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Escape") {
            event.preventDefault();
            if (pending.current) return;
            cancelled.current = true;
            setEditing(false);
          } else if (event.key === "Enter" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s")) {
            event.preventDefault();
            void commit();
          }
        }} />
      {error && <p id={errorId} className="file-title-error" role="alert">{error}</p>}
    </> : <h1 className="file-title" title={name} dir="auto">
      {onRename ? <button type="button" className="file-title-button" aria-label={`Rename ${name}`}
        onPointerDown={event => {
          // Enter editing before the browser starts selecting heading text.
          // Touch still uses click so dragging the page does not start a rename.
          if (event.button !== 0 || event.pointerType === "touch") return;
          event.preventDefault();
          beginEditing();
        }}
        onClick={beginEditing}>{name}</button> : name}
    </h1>}
  </header>;
}
