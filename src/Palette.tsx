import WorkspaceReplace from "./WorkspaceReplacePanel";
import type { ReplaceIdentity } from "./workspaceReplace";
import { useSearchPreferences } from "./useSearchPreferences";
import { searchMatcher } from "./searchOptions";
import ScopeToggle from "./ScopeToggle";
import "./palette.css";
import {
  searchCurrentNote,
  type CurrentNote,
  type SearchScope,
} from "./currentSearch";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Bookmark as BookmarkIcon,
  FileText,
  LayoutGrid,
  Command,
  Search,
  Settings2,
  TextSearch,
  Replace,
  X,
} from "lucide-react";
import { filenameMatches, type Workspace } from "./model";
import {
  searchNotes, searchFiles, cancelSearch, type FileSearchMatch,
  type FolderSearchHit,
  type BookmarkSearchHit,
} from "./storage";
export default function Palette({
  folders,
  commands = [],
  initialFilter = "All",
  activeNote,
  getActiveText,
  scope,
  onScopeChange,
  onNavigateCurrent,
  onClose,
  onOpen,
  getReplaceBlockedFiles,
}: {
  getReplaceBlockedFiles?: () => ReplaceIdentity[];
  folders: Workspace[];
  initialFilter?: "All" | "Files";
  commands?: { id: string; label: string; description: string; keywords?: string; run: () => void }[];
  activeNote: Omit<CurrentNote, "text"> | null;
  getActiveText: () => string;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  onNavigateCurrent: (from?: number, to?: number) => void;
  onClose: () => void;
  onOpen: (
    root: string,
    path: string,
    line?: number,
    bookmarkId?: string,
  ) => void;
}) {
  const currentOnly = scope === "current" && !!activeNote;
  const searchFolders = useMemo(
    () =>
      currentOnly && activeNote
        ? folders
            .filter((f) => f.root === activeNote.root)
            .map((f) => ({
              ...f,
              files: [
                {
                  path: activeNote.path,
                  name: activeNote.path.split("/").at(-1)!,
                },
              ],
            }))
        : folders,
    [folders, currentOnly, activeNote],
  );
  const [query, setQuery] = useState("");
  const { options, setOptions, advanced, setAdvanced } = useSearchPreferences(folders.map(folder => folder.root));
  const search = useMemo(() => {
    try { return { matcher: searchMatcher(query, options), error: "" }; }
    catch { return { matcher: null, error: "Invalid regular expression. Check your search pattern." }; }
  }, [query, options]);
  const [filter, setFilter] = useState<string>(initialFilter);
  useEffect(() => { if (currentOnly && filter === "Replace") setFilter("Text"); }, [currentOnly, filter]);
  const [hits, setHits] = useState<FolderSearchHit[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remoteFiles, setRemoteFiles] = useState<FileSearchMatch[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => window.removeEventListener("keydown", closeOnEscape, { capture: true });
  }, [onClose]);
  const files = useMemo(() => {
    if (filter === "Replace" || filter === "Settings" || filter === "Text" || filter === "Bookmarks") return [];
    const loaded = searchFolders.flatMap(folder => folder.files.map(file => ({
      ...file, root: folder.root, folderName: folder.name,
    })));
    const found = currentOnly ? [] : remoteFiles.map(file => ({
      ...file, folderName: folders.find(folder => folder.root === file.root)?.name ?? "",
    }));
    const unique = new Map([...loaded, ...found].map(file => [JSON.stringify([file.root, file.path]), file]));
    if (!search.matcher) return [];
    const candidates = [...unique.values()].filter(file => search.matcher!.acceptsPath(file.path) && search.matcher!.matches(file.path));
    return filenameMatches(candidates, options.regexp ? "" : query);
  }, [searchFolders, query, filter, remoteFiles, folders, currentOnly, search, options]);
  useEffect(() => {
    let cancelled = false;
    setRemoteFiles([]); setFilesError(""); setFilesBusy(false);
    if (!search.matcher || currentOnly || (!query.trim() && !options.include.trim() && !options.exclude.trim()) || (filter !== "Files" && filter !== "All") || !folders.some(folder => folder.directories)) return;
    setFilesBusy(true);
    let started = false;
    const timer = setTimeout(() => {
      started = true;
      searchFiles(folders, query, options).then(result => {
        if (!cancelled) { setRemoteFiles(result.files); setFilesError(result.warnings.join(" · ")); }
      }).catch(error => { if (!cancelled) setFilesError(String(error)); })
        .finally(() => { if (!cancelled) setFilesBusy(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); if (started) cancelSearch(true); };
  }, [folders, query, currentOnly, filter, options, search]);
  const localHits = useMemo(
    () =>
      search.matcher && activeNote && currentOnly && query.trim() && filter !== "Settings" && filter !== "Files" && filter !== "Bookmarks"
        ? searchCurrentNote({ ...activeNote, text: getActiveText() }, query, options)
        : [],
    [activeNote, currentOnly, query, filter, getActiveText, search, options],
  );
  const localBookmarks = useMemo(
    () =>
      search.matcher && activeNote && currentOnly && query.trim()
        ? activeNote.bookmarks
            .filter(
              (b) =>
                search.matcher!.acceptsPath(activeNote.path) &&
                (search.matcher!.matches(b.name) || search.matcher!.matches(b.quote)),
            )
            .slice(0, 80)
            .map((bookmark) => ({
              root: activeNote.root,
              path: activeNote.path,
              bookmark,
            }))
        : [],
    [activeNote, currentOnly, query, search],
  );
  const textHits =
    filter === "Replace" || filter === "Settings" || filter === "Files" || filter === "Bookmarks"
      ? []
      : currentOnly
        ? localHits
        : hits;
  const bookmarkHits =
    filter === "Replace" || filter === "Settings" || filter === "Files" || filter === "Text"
      ? []
      : currentOnly
        ? localBookmarks
        : bookmarks;
  const matchingCommands = (filter === "Settings" || (filter === "All" && query.trim())) ? commands.filter((command) =>
    query.trim().toLowerCase().split(/\s+/).every((word) =>
      `${command.label} ${command.keywords ?? ""}`.toLowerCase().includes(word)),
  ) : [];
  const runCommand = (command: (typeof commands)[number]) => {
    command.run();
    onClose();
  };
  const rows = [
    ...files.map((f) => ({
      root: f.root,
      path: f.path,
      line: undefined as number | undefined,
      bookmarkId: undefined as string | undefined,
    })),
    ...bookmarkHits.map((hit) => ({
      root: hit.root,
      path: hit.path,
      line: undefined,
      bookmarkId: hit.bookmark.id,
    })),
    ...textHits.map((hit) => ({ ...hit, bookmarkId: undefined })),
  ];
  useEffect(() => {
    let cancelled = false;
    setHits([]);
    setBookmarks([]);
    setError("");
    setIndex(0);
    if (!search.matcher || currentOnly || !query.trim() || filter === "Files" || filter === "Settings" || filter === "Replace") {
      setBusy(false);
      return;
    }
    setBusy(true);
    let started = false;
    const timer = setTimeout(() => {
      started = true;
      searchNotes(folders, query.trim(), options)
        .then((results) => {
          if (!cancelled) {
            setHits(results.hits);
            setBookmarks(results.bookmarks);
            setError(results.warnings.join(" · "));
          }
        })
        .catch((e) => {
          if (!cancelled) setError(String(e));
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (started && folders.some(folder => folder.root !== "demo")) cancelSearch(false);
    };
  }, [query, filter, folders, currentOnly, options, search]);
  useEffect(() => setIndex(0), [query, options, filter, scope]);
  useEffect(() => {
    panel.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const select = (
    root: string,
    path: string,
    line?: number,
    bookmarkId?: string,
    from?: number,
    to?: number,
  ) => {
    if (currentOnly && activeNote) {
      const mark = bookmarkId
        ? activeNote.bookmarks.find((b) => b.id === bookmarkId)
        : undefined;
      const hit = line ? localHits.find((h) => h.line === line) : undefined;
      onClose();
      onNavigateCurrent(
        from ?? (mark && !mark.unresolved ? mark.from : hit?.from),
        to ?? (mark && !mark.unresolved ? mark.to : hit?.to),
      );
    } else {
      onOpen(root, path, line, bookmarkId);
      onClose();
    }
  };
  return (
    <div
      className="overlay palette-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={
          currentOnly ? "Find in current tab" : "Find across your folders"
        }
        ref={panel}
        onKeyDown={(e) => {
          if (e.target === input.current && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setIndex((i) =>
              Math.max(
                0,
                Math.min(matchingCommands.length + rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
              ),
            );
          }
          if (e.key === "Enter" && e.target === input.current && matchingCommands[index - rows.length]) {
            e.preventDefault();
            runCommand(matchingCommands[index - rows.length]);
          } else if (e.key === "Enter" && e.target === input.current && rows[index]) {
            e.preventDefault();
            const row = rows[index];
            select(
              row.root,
              row.path,
              row.line,
              row.bookmarkId,
              "from" in row ? (row.from as number) : undefined,
              "to" in row ? (row.to as number) : undefined,
            );
          }
          if (e.key === "Tab") {
            const controls = Array.from(
              panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),summary"),
            );
            const at = controls.indexOf(document.activeElement as HTMLElement);
            if (e.shiftKey && at === 0) {
              e.preventDefault();
              controls.at(-1)?.focus();
            } else if (!e.shiftKey && at === controls.length - 1) {
              e.preventDefault();
              controls[0]?.focus();
            }
          }
        }}
      >
        <div className="console-header">
          <span className="console-emblem" aria-hidden="true"><Command size={15} /></span>
          <span>Command console</span>
          <span className="console-status"><i aria-hidden="true" />{busy ? "Searching" : "Ready"}</span>
        </div>
        <div className="search-scope">
          <ScopeToggle
            label="Search scope"
            scope={currentOnly ? "current" : "everywhere"}
            disabled={!activeNote}
            onChange={(next) => {
              setIndex(0);
              onScopeChange(next);
              input.current?.focus();
            }}
          />
          <span title={currentOnly ? activeNote?.path : undefined}>
            {currentOnly
              ? activeNote?.path.split("/").at(-1)
              : "All added folders"}
          </span>
        </div>
        <div className="palette-filters" role="group" aria-label="Search type">
          {[
            { name: "All", Icon: LayoutGrid },
            { name: "Files", Icon: FileText },
            { name: "Bookmarks", Icon: BookmarkIcon },
            { name: "Text", Icon: TextSearch },
            { name: "Settings", Icon: Settings2 },
            ...(!currentOnly ? [{ name: "Replace", Icon: Replace }] : []),
          ].map(({ name: f, Icon }) => (
            <button
              key={f}
              aria-label={f}
              title={f}
              aria-pressed={f === filter}
              className={f === filter ? "selected" : ""}
              onClick={() => {
                setFilter(f);
                input.current?.focus();
              }}
            >
              <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
            </button>
          ))}
          <span>
            {filter === "Settings" ? "Global settings" : currentOnly
              ? "Searching current text"
              : `Searching ${folders.length} ${folders.length === 1 ? "folder" : "folders"}`}
          </span>
        </div>
        <div className="palette-input">
          <Search size={22} />
          <input
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            autoFocus
            ref={input}
            aria-label={filter === "Files" ? "Search files by name" : "Search files, bookmarks, text, and settings"}
            placeholder={
              filter === "Files" ? "Search files by name…" : filter === "Settings" ? "Find a setting…" : currentOnly
                ? "Find in this note…"
                : "A filename, a bookmark, a setting…"
            }
            aria-invalid={!!search.error}
            aria-describedby={search.error ? "palette-query-error" : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="palette-match-options" role="group" aria-label="Search matching options">
            {([
              ["caseSensitive", "Match case", "Aa"],
              ["wholeWord", "Match whole word", "ab"],
              ["regexp", "Use regular expression", ".*"],
            ] as const).map(([key, label, glyph]) => (
              <button key={key} type="button" title={label} aria-label={label}
                aria-pressed={options[key]} disabled={filter === "Settings"}
                className={key === "wholeWord" ? "whole-word" : ""}
                onClick={() => { setOptions(previous => ({ ...previous, [key]: !previous[key] })); input.current?.focus(); }}>
                {glyph}
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            aria-label="Close search"
            title="Close search (Esc)"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="palette-advanced">
          <button type="button" className="palette-advanced-toggle" aria-expanded={advanced}
            aria-controls="palette-advanced-fields" onClick={() => setAdvanced(value => !value)}>
            <ChevronRight size={14} className={advanced ? "expanded" : ""} aria-hidden="true" />
            Advanced search
            {(options.includeHidden || options.include.trim() || options.exclude.trim()) && <span className="palette-filter-badge">Filters active</span>}
          </button>
          {advanced && <div id="palette-advanced-fields" className="palette-advanced-fields">
            <label>Files to include
              <input value={options.include} placeholder="e.g. *.md, notes/**" spellCheck={false}
                disabled={filter === "Settings"}
                onChange={event => setOptions(previous => ({ ...previous, include: event.target.value }))} />
            </label>
            <label>Files to exclude
              <input value={options.exclude} placeholder="e.g. archive/**, *.log" spellCheck={false}
                disabled={filter === "Settings"}
                onChange={event => setOptions(previous => ({ ...previous, exclude: event.target.value }))} />
            </label>
            <label className="palette-hidden-filter"><input type="checkbox" checked={options.includeHidden ?? false} disabled={filter === "Settings"}
              onChange={event => setOptions(previous => ({...previous, includeHidden: event.target.checked}))}/>Include hidden files and folders</label>
            <p>Comma-separated paths or patterns: * matches a name, ** matches nested folders. Paths are relative to each folder.</p>
          </div>}
        </div>
        {search.error && filter !== "Settings" && <p id="palette-query-error" role="alert" className="search-message error">{search.error}</p>}
        {filter === "Replace" && !currentOnly ? <WorkspaceReplace folders={folders} query={query} options={options}
          blocked={() => [...(getReplaceBlockedFiles?.() ?? (activeNote ? [activeNote] : [])), ...(activeNote?.root === "demo" ? [activeNote] : [])]} /> : <div
          className="search-results"
          role="listbox"
          aria-label="Search results"
        >
          {files.length > 0 && (
            <div className="section-label">
              {query ? "File names" : "Your files"} <span>{files.length}</span>
            </div>
          )}
          {files.map((f, i) => (
            <button
              role="option"
              aria-selected={i === index}
              className="search-result"
              key={f.root + ":" + f.path}
              onClick={() => select(f.root, f.path)}
            >
              <FileText size={17} />
              <span>
                <strong>{f.name}</strong>
                <small title={f.root}>
                  {f.folderName} / {f.path}
                </small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
          {bookmarkHits.length > 0 && (
            <div className="section-label">
              Bookmarks <span>{bookmarkHits.length}</span>
            </div>
          )}
          {bookmarkHits.map((hit, i) => (
            <button
              role="option"
              aria-selected={files.length + i === index}
              className="search-result"
              key={hit.root + ":" + hit.path + ":" + hit.bookmark.id}
              onClick={() =>
                select(hit.root, hit.path, undefined, hit.bookmark.id)
              }
            >
              <BookmarkIcon size={17} />
              <span>
                <strong>{hit.bookmark.name}</strong>
                <small>
                  {folders.find((f) => f.root === hit.root)?.name} / {hit.path}
                </small>
                <small>{hit.bookmark.quote.slice(0, 160)}</small>
              </span>
            </button>
          ))}
          {textHits.length > 0 && (
            <div className="section-label">
              Inside files{" "}
              <span>
                {textHits.length}
                {textHits.length === 80 ? "+" : ""}
              </span>
            </div>
          )}
          {textHits.map((hit, i) => (
            <button
              role="option"
              aria-selected={files.length + bookmarkHits.length + i === index}
              className="search-result"
              key={hit.root + ":" + hit.path + ":" + hit.line + ":" + i}
              onClick={() =>
                select(
                  hit.root,
                  hit.path,
                  hit.line,
                  undefined,
                  "from" in hit ? (hit.from as number) : undefined,
                  "to" in hit ? (hit.to as number) : undefined,
                )
              }
            >
              <TextSearch size={17} />
              <span>
                <strong>
                  {hit.snippet.trim().slice(0, 160) || "(empty line)"}
                </strong>
                <small>
                  {folders.find((f) => f.root === hit.root)?.name} / {hit.path}{" "}
                  · line {hit.line}
                </small>
              </span>
            </button>
          ))}
          {matchingCommands.length > 0 && <div className="section-label">Settings</div>}
          {matchingCommands.map((command, i) => (
            <button
              role="option"
              aria-selected={rows.length + i === index}
              className="search-result"
              key={command.id}
              onClick={() => runCommand(command)}
            >
              <Settings2 size={17} aria-hidden="true" />
              <span>
                <strong>{command.label}</strong>
                <small>{command.description}</small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
          {!currentOnly && (busy || filesBusy) && (
            <p className="search-message">{filesBusy && !busy ? "Finding files…" : "Looking inside your files…"}</p>
          )}
          {!currentOnly && (error || filesError) && (
            <p className="search-message error">{error || filesError}</p>
          )}
          {!search.error && (currentOnly || (!busy && !filesBusy && !error && !filesError)) && !rows.length && !matchingCommands.length && (
            <p className="search-message">No matches. Try another word.</p>
          )}
        </div>
        }
        <div className="palette-footer">
          <span>
            {filter === "Replace" ? <><kbd>Tab</kbd> to navigate</> : <><kbd>↑</kbd><kbd>↓</kbd> to navigate</>}
          </span>
          <span>
            <kbd>↵</kbd> {filter === "Replace" ? "to activate" : "to open"}
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
          <span>
            {filter === "Settings" ? "Applies across your workspace" : currentOnly
              ? "Includes unsaved edits"
              : "Text search uses saved files"}
          </span>
        </div>
      </div>
    </div>
  );
}
