import ScopeToggle from "./ScopeToggle";
import "./palette.css";
import {
  searchCurrentNote,
  type CurrentNote,
  type SearchScope,
} from "./currentSearch";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark as BookmarkIcon,
  FileText,
  LayoutGrid,
  Command,
  Search,
  TextSearch,
  X,
} from "lucide-react";
import { filenameMatches, type Workspace } from "./model";
import {
  searchNotes,
  type FolderSearchHit,
  type BookmarkSearchHit,
} from "./storage";
export default function Palette({
  folders,
  commands = [],
  activeNote,
  getActiveText,
  scope,
  onScopeChange,
  onNavigateCurrent,
  onClose,
  onOpen,
}: {
  folders: Workspace[];
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
  const [filter, setFilter] = useState("All");
  const [hits, setHits] = useState<FolderSearchHit[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  const files = useMemo(
    () =>
      filter === "Text" || filter === "Bookmarks"
        ? []
        : filenameMatches(
            searchFolders.flatMap((folder) =>
              folder.files.map((file) => ({
                ...file,
                root: folder.root,
                folderName: folder.name,
              })),
            ),
            query,
          ),
    [searchFolders, query, filter],
  );
  const localHits = useMemo(
    () =>
      activeNote && currentOnly && query.trim() && filter !== "Files" && filter !== "Bookmarks"
        ? searchCurrentNote({ ...activeNote, text: getActiveText() }, query)
        : [],
    [activeNote, currentOnly, query, filter, getActiveText],
  );
  const localBookmarks = useMemo(
    () =>
      activeNote && currentOnly && query.trim()
        ? activeNote.bookmarks
            .filter(
              (b) =>
                b.name.toLowerCase().includes(query.trim().toLowerCase()) ||
                b.quote.toLowerCase().includes(query.trim().toLowerCase()),
            )
            .slice(0, 80)
            .map((bookmark) => ({
              root: activeNote.root,
              path: activeNote.path,
              bookmark,
            }))
        : [],
    [activeNote, currentOnly, query],
  );
  const textHits =
    filter === "Files" || filter === "Bookmarks"
      ? []
      : currentOnly
        ? localHits
        : hits;
  const bookmarkHits =
    filter === "Files" || filter === "Text"
      ? []
      : currentOnly
        ? localBookmarks
        : bookmarks;
  const matchingCommands = filter === "All" ? commands.filter((command) =>
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
    if (currentOnly || !query.trim() || filter === "Files") {
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      searchNotes(folders, query.trim())
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
    };
  }, [query, filter, folders, currentOnly]);
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
      className="overlay"
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
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) =>
              Math.max(
                0,
                Math.min(matchingCommands.length + rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
              ),
            );
          }
          if (e.key === "Enter" && e.target === input.current && matchingCommands[index]) {
            e.preventDefault();
            runCommand(matchingCommands[index]);
          } else if (e.key === "Enter" && e.target === input.current && rows[index - matchingCommands.length]) {
            e.preventDefault();
            const row = rows[index - matchingCommands.length];
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
              panel.current!.querySelectorAll<HTMLElement>("button,input"),
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
            {currentOnly
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
            aria-label="Search files, bookmarks, and text"
            placeholder={
              currentOnly
                ? "Find in this note…"
                : "A filename, a bookmark, a command…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label="Close search"
            title="Close search (Esc)"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div
          className="search-results"
          role="listbox"
          aria-label="Search results"
        >
          {matchingCommands.length > 0 && <div className="section-label">Commands</div>}
          {matchingCommands.map((command, i) => (
            <button
              role="option"
              aria-selected={i === index}
              className="search-result"
              key={command.id}
              onClick={() => runCommand(command)}
            >
              <Command size={17} aria-hidden="true" />
              <span>
                <strong>{command.label}</strong>
                <small>{command.description}</small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
          {files.length > 0 && (
            <div className="section-label">
              {query ? "File names" : "Your files"} <span>{files.length}</span>
            </div>
          )}
          {files.map((f, i) => (
            <button
              role="option"
              aria-selected={matchingCommands.length + i === index}
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
              aria-selected={matchingCommands.length + files.length + i === index}
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
              aria-selected={matchingCommands.length + files.length + bookmarkHits.length + i === index}
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
          {!currentOnly && busy && (
            <p className="search-message">Looking inside your files…</p>
          )}
          {!currentOnly && error && (
            <p className="search-message error">{error}</p>
          )}
          {(currentOnly || (!busy && !error)) && !rows.length && !matchingCommands.length && (
            <p className="search-message">No matches. Try another word.</p>
          )}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
          <span>
            {currentOnly
              ? "Includes unsaved edits"
              : "Text search uses saved files"}
          </span>
        </div>
      </div>
    </div>
  );
}
