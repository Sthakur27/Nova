import {openTab,pinTab,tabId,type NoteTab} from "./tabs";
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
  ChevronRight,
  FileText,
  FolderOpen,
  Code2,
  Plus,
  Search,
  PanelRight,
  Pencil,
  Trash2,
  X,
  Check,
  Save,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor, { type EditorHandle, type EditorSnapshot } from "./Editor";
import Palette from "./Palette";
import Explorer from "./Explorer";
import FormatToolbar from "./FormatToolbar";
import { addFolders, type EditorMode } from "./folders";
import VoiceControl from "./VoiceControl";
import {
  chooseWorkspaces,
  loadFolders,
  loadExplorer,
  saveExplorer,
  openWorkspace,
  demoWorkspace,
  desktop,
  readNote,
  saveBookmarks,
  saveNote,
} from "./storage";
import type { Bookmark, DocumentData, Workspace } from "./model";
const Markdown = lazy(() => import("./Markdown"));
const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
export default function App() {
  const [tabs,setTabs]=useState<NoteTab[]>([]);
  const pendingPins=useRef(new Set<string>());
  const tabsRef=useRef<NoteTab[]>([]);
  const snapshots=useRef(new Map<string,EditorSnapshot>());
  const [editorSnapshot,setEditorSnapshot]=useState<EditorSnapshot|undefined>();
  const updateTabs=useCallback((next:NoteTab[])=>{tabsRef.current=next;setTabs(next);for(const key of snapshots.current.keys())if(!next.some(t=>tabId(t)===key))snapshots.current.delete(key);},[]);
  const pin=useCallback((root:string,path:string)=>updateTabs(pinTab(tabsRef.current,tabId({root,path}))),[updateTabs]);
  const [folders, setFolders] = useState<Workspace[]>([demoWorkspace]);
  const [foldersReady, setFoldersReady] = useState(false);
  const [externalDrag, setExternalDrag] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(demoWorkspace);
  const [path, setPath] = useState("Getting started.md");
  const [data, setData] = useState<DocumentData | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const marksRef = useRef<Bookmark[]>([]);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [mode, setMode] = useState<EditorMode>("edit");
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
  const current = useRef({
    workspace,
    path,
    folders,
    mode,
    hasDocument: !!data,
    foldersReady,
  });
  current.current = {
    workspace,
    path,
    folders,
    mode,
    hasDocument: !!data,
    foldersReady,
  };
  const applyMarks = useCallback((marks: Bookmark[]) => {
    marksRef.current = marks;
    setBookmarks(marks);
  }, []);
  const changed = useCallback(() => {
    pin(current.current.workspace.root,current.current.path);
    dirtyRef.current = true;
    setDirty(true);
  }, [pin]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await loadExplorer();
        const restored = prefs
          ? await loadFolders(prefs.folders)
          : [demoWorkspace];
        if (cancelled) return;
        setFolders(restored);
        const mode = prefs?.mode ?? "edit";
        setMode(mode);
        const candidates: { folder: Workspace; path: string }[] = [];
        const active = restored.find(
          (f) => f.root === prefs?.active?.root && !f.error,
        );
        if (active && prefs?.active)
          candidates.push({ folder: active, path: prefs.active.path });
        for (const folder of restored)
          if (!folder.error && folder.files.length)
            candidates.push({ folder, path: folder.files[0].path });
        let opened = false;
        for (const candidate of candidates) {
          try {
            const note = await readNote(candidate.folder.root, candidate.path);
            if (cancelled) return;
            revision.current = note.revision;
            setWorkspace(candidate.folder);
            setPath(candidate.path);
            setData(note);
            updateTabs([{root:candidate.folder.root,path:candidate.path,pinned:false}]);
            setPreview(note.text);
            applyMarks(note.bookmarks);
            opened = true;
            if (
              !/\.(md|markdown|mdx)$/i.test(candidate.path) &&
              mode === "edit"
            )
              setMode("source");
            break;
          } catch (error) {
            setNotice(String(error));
          }
        }
        if (!opened) {
          setWorkspace(
            restored[0] ?? { name: "Your folders", root: "", files: [] },
          );
          setPath("");
          setData(null);
        }
      } catch (error) {
        setNotice(String(error));
      } finally {
        if (!cancelled) {
          setFoldersReady(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMarks]);
  useEffect(() => {
    if (!foldersReady) return;
    void saveExplorer({
      folders: folders.map(({ root, name, collapsed }) => ({
        root,
        name,
        collapsed,
      })),
      active: data ? { root: workspace.root, path } : null,
      mode,
    }).catch((error) => setNotice(String(error)));
  }, [foldersReady, folders, workspace.root, path, mode, !!data]);
  const save = useCallback(async (): Promise<boolean> => {
    if (saveInFlight.current) return saveInFlight.current;
    const run = async () => {
      if (current.current.foldersReady) {
        try {
          const c = current.current;
          await saveExplorer({
            folders: c.folders.map(({ root, name, collapsed }) => ({
              root,
              name,
              collapsed,
            })),
            active: c.hasDocument
              ? { root: c.workspace.root, path: c.path }
              : null,
            mode: c.mode,
          });
        } catch (error) {
          setNotice(String(error));
          return false;
        }
      }
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
    async (nextPath: string, line?: number, nextWorkspace?: Workspace, pinned=false) => {
      const requested=nextWorkspace??current.current.workspace;
      if(pinned){pendingPins.current.add(tabId({root:requested.root,path:nextPath}));pin(requested.root,nextPath);}
      if(current.current.hasDocument&&requested.root===current.current.workspace.root&&nextPath===current.current.path&&!line)return true;
      if (voiceBusy.current) {
        setNotice("Finish or cancel voice typing before switching files.");
        return false;
      }
      if (operation.current) return false;
      operation.current = true;
      try {
        if (!(await save())) return false;
        if (dirtyRef.current) {
          setNotice(
            "The note changed while saving. Save again before switching files.",
          );
          return false;
        }
        setLoading(true);
        const ws = nextWorkspace ?? current.current.workspace;
        const note = await readNote(ws.root, nextPath);
        const old=current.current;
        if(editor.current&&old.hasDocument)snapshots.current.set(tabId({root:old.workspace.root,path:old.path}),editor.current.snapshot());
        const id=tabId({root:ws.root,path:nextPath});
        const cached=snapshots.current.get(id);
        // An external file change invalidates its cached history.
        setEditorSnapshot(cached&&cached.state.doc.toString()===note.text?cached:undefined);
        updateTabs(openTab(tabsRef.current,{root:ws.root,path:nextPath,pinned:pinned||pendingPins.current.has(id)||tabsRef.current.some(t=>tabId(t)===id&&t.pinned)}));
        pendingPins.current.delete(id);
        revision.current = note.revision;
        setWorkspace(ws);
        setPath(nextPath);
        setData(note);
        setPreview(note.text);
        applyMarks(note.bookmarks);
        setActiveMark(null);
        setCursor([1, 1]);
        if (!/\.(md|markdown|mdx)$/i.test(nextPath)) setMode("source");
        if (line) {
          setMode("source");
          setTimeout(() => {
            const lines = note.text.split("\n");
            jump(
              lines
                .slice(0, line - 1)
                .reduce((sum, s) => sum + s.length + 1, 0),
            );
          }, 50);
        }
        return true;
      } catch (e) {
        setNotice(String(e));
        return false;
      } finally {
        setLoading(false);
        operation.current = false;
      }
    },
    [applyMarks, jump, save, pin,updateTabs],
  );
  const closeTab=async(tab:NoteTab)=>{
    if(voiceBusy.current||operation.current){setNotice('Finish the current operation before closing a tab.');return;}
    const id=tabId(tab),all=tabsRef.current,next=all.filter(t=>tabId(t)!==id);
    if(current.current.hasDocument&&tabId({root:current.current.workspace.root,path:current.current.path})===id){
      const neighbor=next[Math.min(all.findIndex(t=>tabId(t)===id),next.length-1)];
      if(neighbor){const folder=current.current.folders.find(f=>f.root===neighbor.root);if(!folder||!await openNote(neighbor.path,undefined,folder))return;}
      else{if(!await save()||dirtyRef.current)return;setData(null);setPath('');applyMarks([]);setEditorSnapshot(undefined);}
    }
    updateTabs(next);
  };
  const changeFolders = (next: Workspace[]) => {
    if (current.current.foldersReady) setFolders(next);
  };
  const acceptFolders = async (added: Workspace[]) => {
    if (!current.current.foldersReady) return;
    const next = addFolders(current.current.folders, added);
    if (next.length > 100) {
      setNotice("You can add up to 100 folders.");
      return;
    }
    setFolders(next);
    if (!current.current.hasDocument) {
      const first = added.find((f) => !f.error && f.files.length);
      if (first) await openNote(first.files[0].path, undefined, first);
    }
  };
  const openFolder = async () => {
    if (voiceBusy.current) {
      setNotice("Finish or cancel voice typing before adding folders.");
      return;
    }
    try {
      await acceptFolders(await chooseWorkspaces());
    } catch (error) {
      setNotice(String(error));
    }
  };
  const refreshFolder = async (root: string) => {
    try {
      const refreshed = await openWorkspace(root);
      setFolders((old) =>
        old.map((f) =>
          f.root === root ? { ...refreshed, collapsed: f.collapsed } : f,
        ),
      );
    } catch (error) {
      setNotice(String(error));
      setFolders((old) =>
        old.map((f) => (f.root === root ? { ...f, error: String(error) } : f)),
      );
    }
  };
  const removeFolder = async (root: string) => {
    if (voiceBusy.current || operation.current) {
      setNotice("Finish the current operation before removing a folder.");
      return;
    }
    const next = current.current.folders.filter((f) => f.root !== root);
    if (
      current.current.workspace.root === root &&
      current.current.hasDocument
    ) {
      const first = next.find((f) => !f.error && f.files.length);
      if (first) {
        if (!(await openNote(first.files[0].path, undefined, first))) return;
      } else {
        if (!(await save()) || dirtyRef.current) return;
        setData(null);
        setPath("");
        applyMarks([]);
        setWorkspace(next[0] ?? { name: "Your folders", root: "", files: [] });
      }
    }
    updateTabs(tabsRef.current.filter(t=>t.root!==root));
    setFolders(next);
  };
  const dropHandler = useRef<(paths: string[]) => void>(() => {});
  dropHandler.current = (paths) => {
    if (voiceBusy.current) {
      setNotice("Finish or cancel voice typing before adding folders.");
      return;
    }
    void loadFolders(
      paths.map((root) => ({ root, name: root.split(/[\\/]/).at(-1) || root })),
    )
      .then((added) => {
        const valid = added.filter((f) => !f.error);
        if (valid.length !== added.length)
          setNotice(
            "Drop folders rather than individual files. Unavailable folders were skipped.",
          );
        return acceptFolders(valid);
      })
      .catch((error) => setNotice(String(error)));
  };
  useEffect(() => {
    if (!desktop) return;
    let disposed = false,
      unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (disposed) return;
        setExternalDrag(
          event.payload.type === "enter" || event.payload.type === "over",
        );
        if (event.payload.type === "drop")
          dropHandler.current(event.payload.paths);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => setNotice(String(error)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
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
        setMode("edit");
        setNotice(
          "Select this passage in Edit mode to bookmark text that crosses Markdown formatting.",
        );
        return;
      }
      selection = { from, to: from + quote.length, quote };
    } else if (mode === "read") {
      setMode("edit");
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
  const switchMode = (next: EditorMode) => {
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
        <Explorer
          folders={folders}
          activeRoot={workspace.root}
          activePath={path}
          onOpen={(folder, path,pinned) => void openNote(path, undefined, folder,pinned)}
          onChange={changeFolders}
          onRemove={(root) => void removeFolder(root)}
          onRefresh={(root) => void refreshFolder(root)}
          onAdd={() => void openFolder()}
          externalDrag={externalDrag}
        />
        <div className="sidebar-bottom">
          <div className="local-indicator">
            <span />
            {folders.length} {folders.length === 1 ? "folder" : "folders"} ·
            stored locally
          </div>
          <p>Drag folder handles to organize your space.</p>
          <button className="open-folder" onClick={openFolder}>
            <Plus size={15} />
            Add folders
          </button>
          <div className="sidebar-footnote">Your files. Your space.</div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="tab-bar">
          <div className="note-tabs" role="tablist" aria-label="Open notes">
            {tabs.map(tab=>{const active=!!data&&tab.root===workspace.root&&tab.path===path;const name=tab.path.split('/').at(-1);return <div key={tabId(tab)} className={'note-tab '+(active?'active ':'')+(!tab.pinned?'preview-tab':'')}>
              <button role="tab" aria-selected={active} title={tab.root+'/'+tab.path+(!tab.pinned?' · Preview — double-click to keep open':'')} onDoubleClick={()=>pin(tab.root,tab.path)} onClick={()=>{const folder=folders.find(f=>f.root===tab.root);if(folder)void openNote(tab.path,undefined,folder);}}><FileText size={14}/><span>{name}</span>{active&&dirty&&<span className="dirty-dot"/>}</button>
              {!tab.pinned&&<button className="tab-pin" title="Keep tab open" aria-label={`Keep ${name} open`} onClick={()=>pin(tab.root,tab.path)}><Plus size={12}/></button>}
              <button className="tab-close" aria-label={`Close ${name}`} onClick={()=>void closeTab(tab)}><X size={12}/></button>
            </div>;})}
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
              setMode((old) =>
                old === "read" ? (isMarkdown ? "edit" : "source") : old,
              );
              editor.current?.beginDictation();
            }}
            onText={(text) => {
              editor.current?.insertDictation(text);
              setMode((old) =>
                old === "read" ? (isMarkdown ? "edit" : "source") : old,
              );
            }}
            onCancel={() => editor.current?.cancelDictation()}
            onBusy={(busy) => {
              voiceBusy.current = busy;
            }}
            onError={(error) => setNotice(error)}
          />
          <div className="view-switch">
            <button
              onClick={() => switchMode("source")}
              className={mode === "source" ? "selected" : ""}
              title="Edit Markdown source"
            >
              <Code2 size={14} />
              Source
            </button>
            <button
              onClick={() => switchMode("edit")}
              disabled={!isMarkdown}
              className={mode === "edit" ? "selected" : ""}
              title="Edit formatted Markdown"
            >
              <Pencil size={13} />
              Edit
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
            data-unsaved={dirty}
            aria-label="Save note"
            title={`Save (${mod} S)`}
            onClick={() => void save()}
          >
            <Save size={15} />
          </button>
        </div>
        {data && mode === "edit" && isMarkdown && (
          <FormatToolbar onFormat={(style) => editor.current?.format(style)} />
        )}
        <div className="document-area">
          {loading && <div className="loading">Opening your note…</div>}
          {data && (
            <div className={"write-pane " + (mode === "read" ? "hidden" : "")}>
              <Editor
                key={JSON.stringify([workspace.root, path, data.revision])}
                ref={editor}
                initial={data.text}
                snapshot={editorSnapshot}
                bookmarks={bookmarks}
                onChange={changed}
                onBookmarks={applyMarks}
                onCursor={(line, col) => setCursor([line, col])}
                onBookmark={beginBookmark}
                onSave={() => void save()}
                isMarkdown={isMarkdown}
                visual={mode === "edit" && isMarkdown}
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
                        onClick={() => switchMode("source")}
                      >
                        Open in Source mode
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
            {mode !== "read"
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
                Select a passage in Edit mode, then add your first bookmark.
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
          folders={folders}
          onClose={() => {
            setPalette(false);
            if (mode !== "read")
              editor.current?.jump(editor.current.selection().from);
          }}
          onOpen={(root, p, l) => {
            const folder = folders.find((f) => f.root === root);
            if (folder) void openNote(p, l, folder);
          }}
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
