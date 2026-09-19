import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, TextSearch, X } from "lucide-react";
import { filenameMatches, type SearchHit, type Workspace } from "./model";
import { searchNotes } from "./storage";
export default function Palette({
  workspace,
  onClose,
  onOpen,
}: {
  workspace: Workspace;
  onClose: () => void;
  onOpen: (path: string, line?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const files = useMemo(
    () => (filter === "Text" ? [] : filenameMatches(workspace.files, query)),
    [workspace.files, query, filter],
  );
  const textHits = filter === "Files" ? [] : hits;
  const rows = [
    ...files.map((f) => ({
      path: f.path,
      line: undefined as number | undefined,
    })),
    ...textHits,
  ];
  useEffect(() => {
    let cancelled = false;
    setHits([]);
    setError("");
    setIndex(0);
    if (!query.trim() || filter === "Files") {
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      searchNotes(workspace.root, query.trim())
        .then((results) => {
          if (!cancelled) setHits(results);
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
  }, [query, filter, workspace.root]);
  useEffect(() => {
    panel.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const select = (path: string, line?: number) => {
    onOpen(path, line);
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
        aria-label="Find in your folder"
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
            select(rows[index].path, rows[index].line);
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
            autoFocus
            ref={input}
            aria-label="Search files and text"
            placeholder="A filename, a phrase, a passing thought…"
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
          {["All", "Files", "Text"].map((f) => (
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
          <span>Searching {workspace.name}</span>
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
              key={f.path}
              onClick={() => select(f.path)}
            >
              <FileText size={17} />
              <span>
                <strong>{f.name}</strong>
                <small>{f.path}</small>
              </span>
              <kbd>↵</kbd>
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
              aria-selected={files.length + i === index}
              className="search-result"
              key={hit.path + ":" + hit.line}
              onClick={() => select(hit.path, hit.line)}
            >
              <TextSearch size={17} />
              <span>
                <strong>
                  {hit.snippet.trim().slice(0, 160) || "(empty line)"}
                </strong>
                <small>
                  {hit.path} · line {hit.line}
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
