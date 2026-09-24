import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type { Workspace } from "./model";
import { searchNotes, cancelSearch, type FolderSearchHit } from "./storage";
import { searchMatcher } from "./searchOptions";
import { useSearchPreferences } from "./useSearchPreferences";
import WorkspaceReplace from "./WorkspaceReplacePanel";
import type { ReplaceIdentity } from "./workspaceReplace";
import "./workspaceSearch.css";

export type SearchRequest = { id: number; replace: boolean; query?: string };
export default function WorkspaceSearch({ folders, active, request, blocked, onOpen, onClose }: {
  folders: Workspace[]; active: boolean; request: SearchRequest;
  blocked: () => ReplaceIdentity[];
  onOpen: (root: string, path: string, line: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState(false);
  const [hits, setHits] = useState<FolderSearchHit[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { options, setOptions, advanced, setAdvanced } = useSearchPreferences(folders.map(folder => folder.root));
  const error = useMemo(() => {
    try { searchMatcher(query, options); return ""; }
    catch { return "Invalid regular expression. Check your search pattern."; }
  }, [query, options]);
  useEffect(() => {
    if (request.query !== undefined) setQuery(request.query);
    if (request.replace) setReplace(true);
    input.current?.focus(); input.current?.select();
  }, [request]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false, started = false;
    setHits([]); setMessage(""); setBusy(false);
    if (!query.trim() || error || replace) return;
    setBusy(true);
    const timer = setTimeout(() => {
      started = true;
      void searchNotes(folders, query, options).then(result => {
        if (!cancelled) { setHits(result.hits); setMessage(result.warnings.join(" · ")); }
      }).catch(error => { if (!cancelled) setMessage(String(error)); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); if (started) cancelSearch(false); };
  }, [active, query, options, error, folders, replace]);
  const groups = new Map<string, FolderSearchHit[]>();
  for (const hit of hits) {
    const key = JSON.stringify([hit.root, hit.path]);
    const group = groups.get(key) ?? []; group.push(hit); groups.set(key, group);
  }
  return <section className="workspace-search" aria-label="Search across files" onKeyDown={event => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); onClose(); }
  }}>
    <header><strong>Search</strong><button aria-label="Close workspace search" title="Back to Files (Esc)" onClick={onClose}><X size={15}/></button></header>
    <p className="workspace-search-scope">Saved files in this window’s folders</p>
    <div className="workspace-search-query">
      <button aria-label="Toggle replacement" aria-expanded={replace} aria-controls="workspace-replacement" onClick={() => setReplace(value => !value)}><ChevronRight size={17} className={replace ? "expanded" : ""}/></button>
      <Search size={15} aria-hidden="true"/>
      <input ref={input} aria-label="Find across files" placeholder="Find" value={query} spellCheck={false} aria-invalid={!!error} onChange={event => setQuery(event.target.value)}/>
    </div>
    <div className="workspace-search-options" role="group" aria-label="Search matching options">
      {([["caseSensitive", "Match case", "Aa"], ["wholeWord", "Match whole word", "ab"], ["regexp", "Use regular expression", ".*"]] as const).map(([key, label, glyph]) =>
        <button key={key} aria-label={label} title={label} aria-pressed={options[key]} onClick={() => setOptions(old => ({...old, [key]: !old[key]}))}>{glyph}</button>)}
      <button className="workspace-search-advanced-toggle" aria-expanded={advanced} aria-controls="workspace-search-filters" onClick={() => setAdvanced(value => !value)}>Advanced{options.include || options.exclude || options.includeHidden ? " •" : ""}</button>
    </div>
    {advanced && <div id="workspace-search-filters" className="workspace-search-filters">
      <label>Files to include<input value={options.include} placeholder="*.md, notes/**" onChange={event => setOptions(old => ({...old, include: event.target.value}))}/></label>
      <label>Files to exclude<input value={options.exclude} placeholder="archive/**" onChange={event => setOptions(old => ({...old, exclude: event.target.value}))}/></label>
      <label><input type="checkbox" checked={!!options.includeHidden} onChange={event => setOptions(old => ({...old, includeHidden: event.target.checked}))}/>Include hidden files</label>
    </div>}
    {error && <p role="alert">{error}</p>}
    {replace ? <div id="workspace-replacement"><WorkspaceReplace folders={folders} query={error ? "" : query} options={options} blocked={blocked} active={active}/></div> : <>
      <p role="status">{busy ? "Searching…" : query.trim() && !error ? `${hits.length} matches in ${groups.size} files` : "Find text across your files."}{message && ` · ${message}`}</p>
      <div className="workspace-search-results">{[...groups].map(([key, group]) => <details key={key} open>
        <summary title={`${group[0].root}/${group[0].path}`}>{folders.find(folder => folder.root === group[0].root)?.name} / {group[0].path} <span>({group.length})</span></summary>
        {group.map((hit, index) => <button key={`${hit.line}:${index}`} title={hit.snippet} onClick={() => onOpen(hit.root, hit.path, hit.line)}><span>{hit.line}</span><span>{hit.snippet}</span></button>)}
      </details>)}</div>
    </>}
  </section>;
}
