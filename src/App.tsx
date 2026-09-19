import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bookmark as BookmarkIcon,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Search,
  PanelRight,
  Pencil,
  Trash2,
  X,
  Check,
  Save,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor, { type EditorHandle } from "./Editor";
import Palette from "./Palette";
import VoiceControl from "./VoiceControl";
import {
  chooseWorkspace,
  demoWorkspace,
  desktop,
  readNote,
  saveBookmarks,
  saveNote,
} from "./storage";
import type { Bookmark, DocumentData, Workspace } from "./model";
const Markdown = lazy(() => import("./Markdown"));
const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
function FileTree({
  paths,
  active,
  onOpen,
  prefix = "",
}: {
  paths: string[];
  active: string;
  onOpen: (path: string) => void;
  prefix?: string;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = new Map<string, string[]>();
  const files: string[] = [];
  paths.forEach((path) => {
    const rest = path.slice(prefix.length),
      slash = rest.indexOf("/");
    if (slash < 0) files.push(path);
    else {
      const name = rest.slice(0, slash);
      groups.set(name, [...(groups.get(name) ?? []), path]);
    }
  });
  return (
    <>
      {[...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, children]) => (
          <div key={name}>
            <button
              className="tree-row folder-row"
              aria-expanded={!closed.has(name)}
              onClick={() =>
                setClosed((s) => {
                  const next = new Set(s);
                  if (next.has(name)) next.delete(name);
                  else next.add(name);
                  return next;
                })
              }
            >
              {closed.has(name) ? (
                <ChevronRight size={13} />
              ) : (
                <ChevronDown size={13} />
              )}
              <Folder size={15} />
              <span>{name}</span>
            </button>
            {!closed.has(name) && (
              <div className="tree-children">
                <FileTree
                  paths={children}
                  active={active}
                  onOpen={onOpen}
                  prefix={prefix + name + "/"}
                />
              </div>
            )}
          </div>
        ))}
      {files.sort().map((path) => (
        <button
          key={path}
          className={"tree-row file-row " + (path === active ? "active" : "")}
          onClick={() => onOpen(path)}
        >
          <FileText size={15} />
          <span>{path.slice(prefix.length)}</span>
          {path === active && <span className="active-dot" />}
        </button>
      ))}
    </>
  );
}
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(demoWorkspace);
  const [path, setPath] = useState("Getting started.md");
  const [data, setData] = useState<DocumentData | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const marksRef = useRef<Bookmark[]>([]);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [mode, setMode] = useState<"read" | "write">("read");
  const [preview, setPreview] = useState("");
  const [palette, setPalette] = useState(false);
  const [rail, setRail] = useState(true);
  const [cursor, setCursor] = useState([1, 1]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeMark, setActiveMark] = useState<string | null>(null);
  const [bookmarkDraft, setBookmarkDraft] = useState<{
    id?: string;
    name: string;
    from: number;
    to: number;
    quote: string;
  } | null>(null);
  const editor = useRef<EditorHandle>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const revision = useRef("");
  const operation = useRef(false);
  const voiceBusy = useRef(false);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  const current = useRef({ workspace, path });
  current.current = { workspace, path };
  const applyMarks = useCallback((marks: Bookmark[]) => {
    marksRef.current = marks;
    setBookmarks(marks);
  }, []);
  const changed = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);
  useEffect(() => {
    readNote("demo", "Getting started.md")
      .then((note) => {
        revision.current = note.revision;
        setData(note);
        setPreview(note.text);
        applyMarks(note.bookmarks);
      })
      .catch((e) => setNotice(String(e)))
      .finally(() => setLoading(false));
  }, [applyMarks]);
  const save = useCallback(async (): Promise<boolean> => {
    if (saveInFlight.current) return saveInFlight.current;
    const run = async () => {
      if (!editor.current) return true;
      const { workspace: ws, path: file } = current.current;
      const text = editor.current.text(),
        marks = marksRef.current;
      setSaving(true);
      try {
        if (dirtyRef.current)
          revision.current = await saveNote(
            ws.root,
            file,
            text,
            revision.current,
          );
        await saveBookmarks(ws.root, file, marks);
        if (editor.current?.text() === text) {
          dirtyRef.current = false;
          setDirty(false);
        }
        return true;
      } catch (e) {
        setNotice(String(e));
        return false;
      } finally {
        setSaving(false);
      }
    };
    saveInFlight.current = run();
    try {
      return await saveInFlight.current;
    } finally {
      saveInFlight.current = null;
    }
  }, []);
  const jump = useCallback((from: number, to = from) => {
    editor.current?.jump(from, to);
    const text = editor.current?.text() ?? "";
    const line = text.slice(0, from).split("\n").length;
    requestAnimationFrame(() => {
      const nodes = [
        ...(previewElement.current?.querySelectorAll<HTMLElement>(
          "[data-line]",
        ) ?? []),
      ];
      const target =
        nodes.filter((n) => Number(n.dataset.line) <= line).at(-1) ?? nodes[0];
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.classList.add("jump-target");
      setTimeout(() => target?.classList.remove("jump-target"), 1700);
    });
  }, []);
  const openNote = useCallback(
    async (nextPath: string, line?: number, nextWorkspace?: Workspace) => {
      if (voiceBusy.current) {
        setNotice("Finish or cancel voice typing before switching files.");
        return;
      }
      if (operation.current) return;
      operation.current = true;
      try {
        if (!(await save())) return;
        if (dirtyRef.current) {
          setNotice(
            "The note changed while saving. Save again before switching files.",
          );
          return;
        }
        setLoading(true);
        const ws = nextWorkspace ?? current.current.workspace;
        const note = await readNote(ws.root, nextPath);
        revision.current = note.revision;
        setWorkspace(ws);
        setPath(nextPath);
        setData(note);
        setPreview(note.text);
        applyMarks(note.bookmarks);
        setActiveMark(null);
        setCursor([1, 1]);
        if (line) {
          setMode("write");
          setTimeout(() => {
            const lines = note.text.split("\n");
            jump(
              lines
                .slice(0, line - 1)
                .reduce((sum, s) => sum + s.length + 1, 0),
            );
          }, 50);
        }
      } catch (e) {
        setNotice(String(e));
      } finally {
        setLoading(false);
        operation.current = false;
      }
    },
    [applyMarks, jump, save],
  );
  const openFolder = async () => {
    if (voiceBusy.current) {
      setNotice("Finish or cancel voice typing before opening a folder.");
      return;
    }
    if (!(await save())) return;
    try {
      const ws = await chooseWorkspace();
      if (!ws) return;
      if (ws.files.length) await openNote(ws.files[0].path, undefined, ws);
      else {
        setWorkspace(ws);
        setPath("");
        setData(null);
        applyMarks([]);
        setNotice(
          "This folder has no .md, .markdown, .txt, or .mdx files yet. Add a file, then refresh the folder.",
        );
      }
    } catch (e) {
      setNotice(String(e));
    }
  };
  const beginBookmark = useCallback(() => {
    if (!editor.current) return;
    let selection = editor.current.selection();
    const browserSelection = window.getSelection();
    if (
      mode === "read" &&
      browserSelection?.toString() &&
      previewElement.current?.contains(browserSelection.anchorNode)
    ) {
      const quote = browserSelection.toString().slice(0, 500),
        text = editor.current.text();
      const sourceNode =
        browserSelection.anchorNode?.parentElement?.closest<HTMLElement>(
          "[data-line]",
        );
      const line = Number(sourceNode?.dataset.line ?? 1);
      const offset = text
        .split("\n")
        .slice(0, line - 1)
        .reduce((sum, s) => sum + s.length + 1, 0);
      const from = text.indexOf(quote, offset);
      if (from < 0) {
        setMode("write");
        setNotice(
          "Select this passage in Write mode to bookmark text that crosses Markdown formatting.",
        );
        return;
      }
      selection = { from, to: from + quote.length, quote };
    } else if (mode === "read") {
      setMode("write");
      setNotice(
        "Select a passage, or place your cursor on a line, then add a bookmark.",
      );
      return;
    }
    if (!selection.quote.trim()) {
      setNotice("Choose a line or passage with text to bookmark.");
      return;
    }
    setBookmarkDraft({ ...selection, name: "" });
  }, [mode]);
  const persistMarks = async (marks: Bookmark[]) => {
    applyMarks(marks);
    // Flush note text with its updated anchors so they remain a consistent pair.
    await save();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (e.key.toLowerCase() === "b" && e.shiftKey && !e.defaultPrevented) {
        e.preventDefault();
        beginBookmark();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [save, beginBookmark]);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || voiceBusy.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    let disposed = false,
      unlisten: (() => void) | undefined,
      unlistenQuit: (() => void) | undefined;
    if (desktop)
      void getCurrentWindow()
        .onCloseRequested(async (e) => {
          e.preventDefault();
          if (voiceBusy.current) {
            setNotice("Finish or cancel voice typing before closing Nova.");
            return;
          }
          if ((await save()) && !dirtyRef.current)
            await getCurrentWindow().destroy();
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        });
    if (desktop)
      void listen("nova:request-quit", async () => {
        if (voiceBusy.current) {
          setNotice("Finish or cancel voice typing before quitting Nova.");
          return;
        }
        if ((await save()) && !dirtyRef.current) await invoke("quit_app");
      }).then((fn) => {
        if (disposed) fn();
        else unlistenQuit = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
      unlistenQuit?.();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [save]);
  const switchMode = (next: "read" | "write") => {
    if (next === "read") setPreview(editor.current?.text() ?? data?.text ?? "");
    setMode(next);
  };
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(path);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol">✳</span>
          <span>
            nova<span className="brand-period">.</span>
          </span>
          <span className="prototype-label">PREVIEW</span>
        </div>
        <button className="search-trigger" onClick={() => setPalette(true)}>
          <Search size={16} />
          <span>Find anything</span>
          <kbd>{mod} K</kbd>
        </button>
        <div className="workspace-label">
          <span>EXPLORER</span>
          <button
            className="icon-button"
            aria-label="Open folder"
            title="Open folder"
            onClick={openFolder}
          >
            <FolderOpen size={15} />
          </button>
        </div>
        <div className="folder-title">
          <ChevronDown size={14} />
          <FolderOpen size={16} />
          <strong>{workspace.name}</strong>
          <button
            className="icon-button"
            aria-label="Refresh folder"
            title="Refresh folder"
            onClick={async () => {
              if (workspace.root !== "demo") {
                try {
                  const ws = await invoke<Workspace>("open_workspace", {
                    root: workspace.root,
                  });
                  setWorkspace(ws);
                } catch (e) {
                  setNotice(String(e));
                }
              } else setNotice("Sample workspace is up to date.");
            }}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <nav className="file-tree" aria-label="Files">
          <FileTree
            paths={workspace.files.map((f) => f.path)}
            active={path}
            onOpen={(p) => void openNote(p)}
          />
        </nav>
        <div className="sidebar-bottom">
          <div className="local-indicator">
            <span />
            {workspace.root === "demo" ? "Sample workspace" : "Local folder"}
          </div>
          <p>
            {workspace.root === "demo"
              ? "A few notes to make yourself at home."
              : workspace.root}
          </p>
          <button className="open-folder" onClick={openFolder}>
            <FolderOpen size={15} />
            Open a folder
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footnote">Your files. Your space.</div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="tab-bar">
          <div className="file-tab">
            <FileText size={15} />
            <span>{path.split("/").at(-1) || "No file open"}</span>
            {dirty && <span className="dirty-dot" />}
          </div>
          <div className="tab-bar-space" />
          <button
            className="icon-button"
            onClick={() => setRail((r) => !r)}
            aria-label="Toggle bookmarks"
            title="Toggle bookmarks"
          >
            <PanelRight size={17} />
          </button>
        </header>
        <div className="document-toolbar">
          <div className="breadcrumbs">
            <span>{workspace.name}</span>
            <ChevronRight size={13} />
            <span>{path.split("/").at(-1)}</span>
          </div>
          <VoiceControl
            disabled={!data || loading || saving}
            onBegin={() => {
              setMode("write");
              editor.current?.beginDictation();
            }}
            onText={(text) => {
              editor.current?.insertDictation(text);
              setMode("write");
            }}
            onCancel={() => editor.current?.cancelDictation()}
            onBusy={(busy) => {
              voiceBusy.current = busy;
            }}
            onError={(error) => setNotice(error)}
          />
          <div className="view-switch">
            <button
              onClick={() => switchMode("write")}
              className={mode === "write" ? "selected" : ""}
            >
              <Pencil size={13} />
              Write
            </button>
            <button
              onClick={() => switchMode("read")}
              className={mode === "read" ? "selected" : ""}
            >
              <BookOpen size={14} />
              Read
            </button>
          </div>
          <button
            className="icon-button"
            aria-label="Save note"
            title={`Save (${mod} S)`}
            onClick={() => void save()}
          >
            <Save size={15} />
          </button>
        </div>
        <div className="document-area">
          {loading && <div className="loading">Opening your note…</div>}
          {data && (
            <div className={"write-pane " + (mode !== "write" ? "hidden" : "")}>
              <Editor
                key={workspace.root + path + data.revision}
                ref={editor}
                initial={data.text}
                bookmarks={bookmarks}
                onChange={changed}
                onBookmarks={applyMarks}
                onCursor={(line, col) => setCursor([line, col])}
                onBookmark={beginBookmark}
                onSave={() => void save()}
                isMarkdown={isMarkdown}
              />
            </div>
          )}
          {data && mode === "read" && (
            <div className="read-pane" ref={previewElement}>
              <article className="prose">
                <div className="document-eyebrow">
                  {isMarkdown ? "A NOTE IN YOUR SPACE" : "PLAIN & SIMPLE"}
                </div>
                <Suspense fallback={<p>Rendering your note…</p>}>
                  {preview.length > 500_000 ? (
                    <div className="large-file-message">
                      <h2>A little more room to write.</h2>
                      <p>
                        This file is large. Use the virtualized source editor to
                        keep memory use down; formatted preview is limited to
                        500,000 characters in this prototype.
                      </p>
                      <button
                        className="primary"
                        onClick={() => switchMode("write")}
                      >
                        Open in Write mode
                      </button>
                    </div>
                  ) : isMarkdown ? (
                    <Markdown text={preview} />
                  ) : (
                    <pre className="plain-preview">
                      {preview.split("\n").map((line, i) => (
                        <div data-line={i + 1} key={i}>
                          {line || "\u00a0"}
                        </div>
                      ))}
                    </pre>
                  )}
                </Suspense>
                <div className="end-mark">✳</div>
              </article>
            </div>
          )}
          {!data && !loading && (
            <div className="empty-editor">
              <FolderOpen size={32} />
              <h2>A folder is all you need.</h2>
              <p>Open a folder with Markdown or text files.</p>
              <button className="primary" onClick={openFolder}>
                Open folder
              </button>
            </div>
          )}
        </div>
        <footer className="status-bar">
          <span>
            <span className="status-dot" />
            {saving
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : "All changes saved"}
          </span>
          <span>
            {mode === "write"
              ? `Ln ${cursor[0]}, Col ${cursor[1]}`
              : "Reading mode"}
          </span>
          <span>{isMarkdown ? "Markdown" : "Plain text"}</span>
          <span>UTF-8</span>
        </footer>
      </main>
      {rail && (
        <aside className="bookmark-rail">
          <header>
            <BookmarkIcon size={16} />
            <strong>Bookmarks</strong>
            <span className="count">{bookmarks.length}</span>
            <button
              className="icon-button"
              onClick={beginBookmark}
              title={`Add bookmark (${mod} Shift B)`}
              aria-label="Add bookmark"
            >
              <Plus size={17} />
            </button>
          </header>
          <div className="rail-intro">Your way back to the good parts.</div>
          <div className="bookmark-list">
            {bookmarks.map((b, i) => (
              <div
                className={
                  "bookmark-card " + (activeMark === b.id ? "current" : "")
                }
                key={b.id}
              >
                <button
                  className="bookmark-jump"
                  disabled={b.unresolved}
                  title={b.quote}
                  onClick={() => {
                    setActiveMark(b.id);
                    jump(b.from, b.to);
                  }}
                >
                  <div className="bookmark-meta">
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      {b.unresolved
                        ? "Needs a new anchor"
                        : `Line ${b.line ?? (editor.current?.text() ?? data?.text ?? "").slice(0, b.from).split("\n").length}`}
                    </span>
                  </div>
                  <strong>{b.name}</strong>
                  <p>{b.quote || "The bookmarked text was removed."}</p>
                </button>
                <div className="bookmark-actions">
                  <button
                    className="icon-button"
                    aria-label={`Rename ${b.name}`}
                    title="Rename bookmark"
                    onClick={() => setBookmarkDraft({ ...b })}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${b.name}`}
                    title="Remove bookmark"
                    onClick={() =>
                      void persistMarks(
                        marksRef.current.filter((m) => m.id !== b.id),
                      )
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!bookmarks.length && (
            <div className="empty-bookmarks">
              <BookmarkIcon size={25} />
              <p>Keep a place in your note.</p>
              <small>
                Select a passage in Write mode, then add your first bookmark.
              </small>
            </div>
          )}
          <button className="add-bookmark" onClick={beginBookmark}>
            <Plus size={15} />
            Bookmark a passage
          </button>
          <div className="bookmark-tip">
            <span className="tip-icon">✧</span>
            <p>
              Not just headings.
              <br />A sentence, a paragraph, a thought.
            </p>
          </div>
          <footer className="rail-footer">
            <kbd>{mod}</kbd>
            <kbd>⇧</kbd>
            <kbd>B</kbd>
            <span>to bookmark</span>
          </footer>
        </aside>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {palette && (
        <Palette
          workspace={workspace}
          onClose={() => {
            setPalette(false);
            if (mode === "write")
              editor.current?.jump(editor.current.selection().from);
          }}
          onOpen={(p, l) => void openNote(p, l)}
        />
      )}
      {bookmarkDraft && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBookmarkDraft(null);
          }}
        >
          <form
            className="bookmark-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Name your bookmark"
            onKeyDown={(e) => {
              if (e.key === "Escape") setBookmarkDraft(null);
              if (e.key === "Tab") {
                const controls = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>("input,button"),
                );
                const at = controls.indexOf(
                  document.activeElement as HTMLElement,
                );
                if (e.shiftKey && at === 0) {
                  e.preventDefault();
                  controls.at(-1)?.focus();
                } else if (!e.shiftKey && at === controls.length - 1) {
                  e.preventDefault();
                  controls[0]?.focus();
                }
              }
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!bookmarkDraft.name.trim()) return;
              const mark = {
                ...bookmarkDraft,
                name: bookmarkDraft.name.trim(),
                id: bookmarkDraft.id ?? crypto.randomUUID(),
              };
              const next = bookmarkDraft.id
                ? marksRef.current.map((b) =>
                    b.id === mark.id ? { ...b, name: mark.name } : b,
                  )
                : [...marksRef.current, mark].sort((a, b) => a.from - b.from);
              void persistMarks(next);
              setActiveMark(mark.id);
              setBookmarkDraft(null);
            }}
          >
            <BookmarkIcon className="dialog-icon" size={25} />
            <h2>{bookmarkDraft.id ? "A new name." : "Remember this part."}</h2>
            <p>A name to help you find your way back.</p>
            <label htmlFor="bookmark-name">Bookmark name</label>
            <input
              id="bookmark-name"
              autoFocus
              maxLength={100}
              placeholder="What’s worth remembering?"
              value={bookmarkDraft.name}
              onChange={(e) =>
                setBookmarkDraft({ ...bookmarkDraft, name: e.target.value })
              }
            />
            <blockquote>{bookmarkDraft.quote}</blockquote>
            <div className="dialog-buttons">
              <button type="button" onClick={() => setBookmarkDraft(null)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={!bookmarkDraft.name.trim()}
                type="submit"
              >
                <Check size={15} />
                {bookmarkDraft.id ? "Save name" : "Add bookmark"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
