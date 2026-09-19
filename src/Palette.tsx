import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark as BookmarkIcon, FileText, Search, TextSearch, X } from "lucide-react";
import { filenameMatches, type Workspace } from "./model";
import { searchNotes, type FolderSearchHit, type BookmarkSearchHit } from "./storage";
export default function Palette({
  folders,
  onClose,
  onOpen,
}: {
  folders: Workspace[];
  onClose: () => void;
  onOpen: (root: string, path: string, line?: number, bookmarkId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [hits, setHits] = useState<FolderSearchHit[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const files = useMemo(
    () =>
      (filter === "Text" || filter === "Bookmarks")
        ? []
        : filenameMatches(
            folders.flatMap((folder) =>
              folder.files.map((file) => ({
                ...file,
                root: folder.root,
                folderName: folder.name,
              })),
            ),
            query,
          ),
    [folders, query, filter],
  );
  const textHits = filter === "Files" || filter === "Bookmarks" ? [] : hits;
  const bookmarkHits = filter === "Files" || filter === "Text" ? [] : bookmarks;
  const rows = [
    ...files.map((f) => ({
      root: f.root,
      path: f.path,
      line: undefined as number | undefined,
      bookmarkId: undefined as string | undefined,
    })),
    ...bookmarkHits.map((hit) => ({ root: hit.root, path: hit.path, line: undefined, bookmarkId: hit.bookmark.id })),
    ...textHits.map((hit) => ({ ...hit, bookmarkId: undefined })),
  ];
  useEffect(() => {
    let cancelled = false;
    setHits([]);
    setBookmarks([]);
    setError("");
    setIndex(0);
    if (!query.trim() || filter === "Files") {
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
  }, [query, filter, folders]);
  useEffect(() => {
    panel.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const select = (root: string, path: string, line?: number, bookmarkId?: string) => {
    onOpen(root, path, line, bookmarkId);
    onClose();
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
        aria-label="Find across your folders"
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) =>
              Math.max(
                0,
                Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
              ),
            );
          }
          if (e.key === "Enter" && e.target === input.current && rows[index]) {
            e.preventDefault();
            select(rows[index].root, rows[index].path, rows[index].line, rows[index].bookmarkId);
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
        <div className="palette-input">
          <Search size={22} />
          <input
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            autoFocus
            ref={input}
            aria-label="Search files, bookmarks, and text"
            placeholder="A filename, a bookmark, a phrase…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="palette-filters">
          {["All", "Files", "Bookmarks", "Text"].map((f) => (
            <button
              key={f}
              className={f === filter ? "selected" : ""}
              onClick={() => {
                setFilter(f);
                input.current?.focus();
              }}
            >
              {f}
            </button>
          ))}
          <span>
            Searching {folders.length}{" "}
            {folders.length === 1 ? "folder" : "folders"}
          </span>
        </div>
        <div
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
              key={hit.root + ":" + hit.path + ":" + hit.line}
              onClick={() => select(hit.root, hit.path, hit.line)}
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
          {busy && <p className="search-message">Looking inside your files…</p>}
          {error && <p className="search-message error">{error}</p>}
          {!busy && !error && !rows.length && (
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
          <span>Text search uses saved files</span>
        </div>
      </div>
    </div>
  );
}
