import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import Editor, { type EditorHandle } from "../Editor";
import { supportsDocumentView } from "../documentLimits";
import type { Bookmark } from "../model";
import FilenameDialog from "./FilenameDialog";
import { pendingNote, type WebNote, type WebStore } from "./store";

export function exportText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export type NoteEditorHandle = { flush: () => Promise<void>; export: () => void };
export default forwardRef<NoteEditorHandle, { note: WebNote; store: WebStore; onSaved: () => void; onSaving: (saving: boolean) => void; panelControl?: ReactNode; focusControl?: ReactNode }>(function NoteEditor({ note, store, onSaved, onSaving, panelControl, focusControl }, handle) {
  const editor = useRef<EditorHandle>(null);
  const saved = useRef(note);
  const queue = useRef(Promise.resolve());
  const count = useRef(0);
  const failed = useRef(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<"edit" | "source">("edit");
  const [initial, setInitial] = useState(note);
  useEffect(() => {
    if (count.current || failed.current) return;
    const contentChanged = saved.current.text !== note.text || saved.current.name !== note.name;
    saved.current = note;
    if (contentChanged) { setInitial(note); setVersion(value => value + 1); }
  }, [note]);
  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      if (count.current || failed.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", leaving);
    return () => window.removeEventListener("beforeunload", leaving);
  }, []);
  const flush = async () => { await queue.current; if (failed.current) throw new Error("Export your unsaved edits before leaving this note."); };
  useImperativeHandle(handle, () => ({ flush, export: () => exportText(saved.current.name, editor.current?.text() ?? saved.current.text) }));
  function persist(name?: string, marks?: Bookmark[]) {
    if (!editor.current) return;
    const text = editor.current.text();
    const bookmarks = marks ?? editor.current.marks();
    count.current++; setSaving(true); onSaving(true);
    queue.current = queue.current.then(async () => {
      if (failed.current) return;
      try {
        // Preserve an existing file's CRLF convention on subsequent uploads.
        const normalized = saved.current.text.includes("\r\n") ? text.replace(/\r?\n/g, "\r\n") : text;
        saved.current = await store.save({ ...saved.current, text: normalized, name: name ?? saved.current.name, bookmarks });
        setError(""); onSaved();
      } catch (error) { failed.current = true; setError(String(error)); }
    }).finally(() => { count.current--; if (!count.current) { setSaving(false); onSaving(false); } });
  }
  async function rename(name: string) {
    await flush();
    if (name === saved.current.name) return;
    const existing = await store.notes(note.account);
    if (existing.some(other => other.key !== note.key && other.parent === note.parent && other.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error("A note with that name already exists in this folder.");
    }
    persist(name); await flush();
    setInitial(saved.current); setVersion(value => value + 1);
  }
  const markdown = /\.(md|markdown)$/i.test(note.name);
  const rich = markdown && supportsDocumentView(note.text.length);
  return <section className="web-writing" aria-label="Note">
    {renaming && <FilenameDialog title="Rename note" initialName={saved.current.name} action="Rename" onSubmit={rename} onClose={() => setRenaming(false)} />}
    <div className="web-note-toolbar">
      {panelControl}
      <strong title={note.name}>{note.name}</strong>
      <div className="web-desktop-actions" role="group" aria-label="Editing mode">
        {rich && <button aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>Edit</button>}
        <button aria-pressed={!rich || mode === "source"} onClick={() => setMode("source")}>Source</button>
      </div>
      <button className="web-desktop-actions" onClick={() => setRenaming(true)}>Rename</button>
      <button className="web-desktop-actions" onClick={() => exportText(saved.current.name, editor.current?.text() ?? saved.current.text)}>Export</button>
      {focusControl}
      <details className="web-note-menu" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
      }}>
        <summary aria-label="Note actions" title="Note actions"><MoreHorizontal size={20}/></summary>
        <div>
          {rich && <button onClick={event => { setMode(mode === "edit" ? "source" : "edit"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{mode === "edit" ? "Switch to Source" : "Switch to Edit"}</button>}
          <button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setRenaming(true); }}>Rename</button>
          <button onClick={event => { exportText(saved.current.name, editor.current?.text() ?? saved.current.text); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Export</button>
        </div>
      </details>
    </div>

    {error && <p className="web-error" role="alert">{error}</p>}
    <div className="document-area"><Editor key={version} ref={editor} initial={initial.text} bookmarks={initial.bookmarks}
      onChange={() => persist()} onBookmarks={marks => persist(undefined, marks)} onCursor={() => {}}
      onBookmark={() => {}} onSave={() => persist()} isMarkdown={markdown} filePath={note.name}
      onRequestRename={() => setRenaming(true)}
      documentMode={rich && mode === "edit" ? "edit" : undefined}
      showLineNumbers={false} showLineHighlight={false} wordWrap spellcheck /></div>
    <div className="web-save-state" role="status">{failed.current ? "Not saved — export your edits before closing" : saving ? "Saving on this device…" : note.error ? "Saved on this device · sync needs attention" : pendingNote(note) ? "Saved on this device · waiting to sync" : "Saved on this device · synced"}</div>
  </section>;
});
