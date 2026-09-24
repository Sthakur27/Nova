import { useEffect, useRef, useState } from "react";
import type { Workspace } from "./model";
import type { SearchOptions } from "./searchOptions";
import { applyWorkspaceReplacement, previewWorkspaceReplace, replacementKey, type ReplaceIdentity, type ReplacePreview } from "./workspaceReplace";
import "./workspaceReplace.css";

export default function WorkspaceReplace({folders, query, options, blocked}: {
  folders: Workspace[]; query: string; options: SearchOptions; blocked: () => ReplaceIdentity[];
}) {
  const [replacement, setReplacement] = useState("");
  const [files, setFiles] = useState<ReplacePreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const signature = JSON.stringify([query, options, replacement, folders.map(folder => folder.root)]);
  useEffect(() => { generation.current++; setFiles([]); setSelected(new Set()); setMessages([]); }, [signature]);
  useEffect(() => () => { generation.current++; }, []);
  const preview = async () => {
    const ticket = ++generation.current;
    setBusy(true); setMessages([]); setFiles([]); setSelected(new Set());
    try {
      const result = await previewWorkspaceReplace(folders, query, replacement, options, blocked);
      if (ticket !== generation.current) return;
      setFiles(result.files); setSelected(new Set(result.files.map(replacementKey)));
      setMessages([...result.warnings, ...(result.files.length ? [] : ["No eligible files would change."])]);
    } catch (error) { if (ticket === generation.current) setMessages([String(error)]); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    const ticket = ++generation.current;
    setBusy(true);
    const applied = new Set<string>();
    const results: string[] = [];
    // Snapshot only the reviewed and checked rows. Editing the search never expands this batch.
    for (const file of files.filter(file => selected.has(replacementKey(file)))) {
      if (ticket !== generation.current) break;
      try { await applyWorkspaceReplacement(file, blocked); applied.add(replacementKey(file)); }
      catch (error) { results.push(`${file.path}: ${String(error)}`); }
    }
    if (ticket !== generation.current) { setBusy(false); return; }
    setFiles(previous => previous.filter(file => !applied.has(replacementKey(file))));
    setSelected(new Set());
    setMessages([`Replaced in ${applied.size} ${applied.size === 1 ? "file" : "files"}.`, ...results]);
    setBusy(false);
  };
  return <section className="workspace-replace" aria-label="Replace across files" aria-busy={busy}>
    <label>Replace with<input value={replacement} disabled={busy} onChange={event => setReplacement(event.target.value)} placeholder="Replacement text (empty deletes matches)" /></label>
    <p>Local saved files only. Unsaved edits, recovery drafts, and Cloud spaces are skipped; open demo tabs are also skipped. Replacement text is literal, including $1. Review before applying; each selected file is saved immediately.</p>
    <div className="workspace-replace-actions">
      <button disabled={busy || !query.trim()} onClick={() => void preview()}>{busy ? "Working…" : "Preview replacements"}</button>
      <button disabled={busy || !selected.size} onClick={() => void apply()}>Replace in {selected.size} selected {selected.size === 1 ? "file" : "files"}</button>
    </div>
    <div role="status">{messages.map((message, index) => <p key={index}>{message}</p>)}</div>
    {files.map(file => {
      const key = replacementKey(file);
      return <article key={key}>
        <label><input type="checkbox" checked={selected.has(key)} disabled={busy} onChange={event => setSelected(previous => {
          const next = new Set(previous); if (event.target.checked) next.add(key); else next.delete(key); return next;
        })}/>{folders.find(folder => folder.root === file.root)?.name} / {file.path} · {file.changes.length} replacements</label>
        <details><summary>Review before and after</summary><div className="workspace-replace-comparison">
          <div><strong>Before</strong><pre>{file.before}</pre></div><div><strong>After</strong><pre>{file.after}</pre></div>
        </div></details>
      </article>;
    })}
  </section>;
}
