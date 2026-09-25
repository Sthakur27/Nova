import { useId, useLayoutEffect, useRef, useState } from "react";

export function fileTitle(path = "") {
  const name = path.split(/[\\/]/).at(-1) || "Untitled";
  const extension = name.lastIndexOf(".");
  // Preserve extensionless files and leading-dot names such as .env.
  return extension > 0 ? name.slice(0, extension) : name;
}

export default function FileTitle({ path, onRename, onRequestRename }: { path: string; onRename?: (name: string) => Promise<void>; onRequestRename?: () => void }) {
  const name = fileTitle(path);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const cancelled = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const initialCaret = useRef(0);
  const errorId = useId();

  useLayoutEffect(() => {
    if (editing && input.current) {
      input.current.focus();
      input.current.setSelectionRange(initialCaret.current, initialCaret.current);
    }
  }, [editing]);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "0px";
    input.current.style.height = `${input.current.scrollHeight}px`;
  }, [editing, draft]);

  function beginEditing(element?: HTMLElement, x?: number, y?: number) {
    if (onRequestRename) { onRequestRename(); return; }
    initialCaret.current = name.length;
    if (element && x !== undefined && y !== undefined) {
      // Hit-test the rendered heading before replacing it with the text field.
      const position = document.caretPositionFromPoint?.(x, y);
      const range = position ? undefined : document.caretRangeFromPoint?.(x, y);
      const node = position?.offsetNode ?? range?.startContainer;
      const offset = position?.offset ?? range?.startOffset;
      if (node && offset !== undefined && element.contains(node)) {
        const prefix = document.createRange();
        prefix.selectNodeContents(element);
        prefix.setEnd(node, offset);
        initialCaret.current = Math.min(name.length, prefix.toString().length);
      }
    }
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
          beginEditing(event.currentTarget, event.clientX, event.clientY);
        }}
        onClick={event => beginEditing(event.currentTarget,
          event.detail ? event.clientX : undefined, event.detail ? event.clientY : undefined)}>{name}</button> : name}
    </h1>}
  </header>;
}
