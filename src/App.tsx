import { confirmSyncOff } from "./confirmSyncOff";
import CloseTabDialog, { type CloseTabChoice } from "./CloseTabDialog";
import { installTabCloseShortcut } from "./tabShortcuts";
import ReadFind from "./ReadFind";
import FileTitle from "./FileTitle";
import { mobile } from "./platform";
import { useCompactLayout } from "./useCompactLayout";
import SyncSettings from "./SyncSettings";
import { useDriveUploads } from "./useDriveUploads";
import { useDriveConnection } from "./useDriveConnection";
import { syncIncluded } from "./syncPolicy";
import LineSpacingControl, { lineSpacings, type LineSpacing } from "./LineSpacingControl";
import { loadDraft, storeDraft, clearDraft, moveDraft } from "./drafts";
import Settings from "./Settings";
import { codeLanguage } from "./codeLanguages";
import TerminalPanel from "./TerminalPanel";
import { installPanelShortcuts } from "./panelShortcuts";
import SidePanelControls from "./SidePanelControls";
import TextWidthControl, { textWidths, type TextWidth } from "./TextWidthControl";
import { usePreference } from "./preferences";
import ScopeToggle from "./ScopeToggle";
import type {SearchScope} from "./currentSearch";
import { openTab, pinTab, reorderTab, tabId, type NoteTab } from "./tabs";
import { useTabReorder } from "./useTabReorder";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Cloud,
  CloudOff,
  ExternalLink,
  Bookmark as BookmarkIcon,
  BookOpen,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileText,
  FolderOpen,
  Code2,
  ListOrdered,
  ScanLine,
  Blend,
  Plus,
  Search,
  PanelRight,
  TerminalSquare,
  Pencil,
  Trash2,
  X,
  Check,
  Save,
  Settings as SettingsIcon,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { installZoomShortcuts } from "./zoom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor, { type EditorHandle, type EditorSnapshot } from "./Editor";
import Palette from "./Palette";
import Explorer from "./Explorer";
import FileActionDialog from "./FileActionDialog";
import RenameDialog from "./RenameDialog";
import FormatToolbar from "./FormatToolbar";
import { FontControl, TextSizeControl, editorFonts, textSizes, type EditorFont } from "./TypographyControls";
import type { FormatAction } from "./richMarkdown";
import { addFolders, type EditorMode } from "./folders";
import VoiceControl from "./VoiceControl";
import NovaMark from "./NovaMark";
import GalaxyMark from "./GalaxyMark";
import { initialScrollTop } from "./scrollSpace";
import { readFileMode, saveFileMode } from "./fileModes";
import { RICH_DOCUMENT_LIMIT, supportsDocumentView } from "./documentLimits";
import PlasmaEffects from "./PlasmaEffects";
import {
  chooseWorkspaces,
  createNote,
  renameNote,
  moveNote,
  deleteNote,
  discardEmptyUntitled,
  revealNote,
  setFileStar,
  setWorkspaceSyncChoice,
  loadFolders,
  loadExplorer,
  saveExplorer,
  openWorkspace,
  demoWorkspace,
  desktop,
  readNote,
  saveBookmarks,
  searchNotes,
  type BookmarkSearchHit,
  saveNote,
} from "./storage";
import type { Bookmark, DocumentData, Workspace } from "./model";
import type { LargeReadHandle } from "./LargeRead";
const LargeRead = lazy(() => import("./LargeRead"));
const Markdown = lazy(() => import("./Markdown"));
const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
const supportsTranslucency = !mobile;
function BlackHoleIcon() {
  return (
    <svg className="black-hole-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g transform="rotate(-28 12 12)">
        <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
        <circle cx="12" cy="12" r="5" fill="#111017" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2 12c0 2.2 4.5 4 10 4s10-1.8 10-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7.8 9.4a5 5 0 0 1 7.5-1.2" stroke="#e7d6ff" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

async function readRecoverableNote(root: string, path: string) {
  const draft = await loadDraft(root, path);
  // Retain the original revision so Save still detects external changes.
  return { note: draft ?? await readNote(root, path), recovered: !!draft };
}

export default function App() {
  const compact = useCompactLayout();
  const [mobileView, setMobileView] = useState<"notes" | "editor" | "bookmarks">("editor");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultExtension, setDefaultExtension, extensionError] = usePreference<string>("default-extension", ".txt");
  const starQueue = useRef(Promise.resolve());
  const createdNotes = useRef(new Map<string, { root: string; path: string }>());
  const [fileAction, setFileAction] = useState<{ folder: Workspace; path: string; action: "move" | "delete" } | null>(null);
  const drive = useDriveConnection();
  const uploads = useDriveUploads(drive.status.connected);
  const [syncFolder, setSyncFolder] = useState<Workspace | null>(null);
  const [syncPath, setSyncPath] = useState<string | undefined>();
  const [syncBusy, setSyncBusy] = useState(false);
  const syncPending = useRef(false);
  async function toggleFileSync(folder: Workspace, notePath: string) {
    if (syncPending.current || folder.syncError) return;
    syncPending.current = true;
    setSyncBusy(true);
    try {
      const included = syncIncluded(folder.syncPolicy, notePath);
      if (included && !await confirmSyncOff(notePath)) return;
      const policy = await setWorkspaceSyncChoice(folder.root, notePath, included ? "exclude" : "include");
      setFolders(old => old.map(item => item.root === folder.root ? { ...item, syncPolicy: policy } : item));
      setWorkspace(old => old.root === folder.root ? { ...old, syncPolicy: policy } : old);
      uploads.schedule(folder.root);
    } catch (error) { setNotice(String(error)); }
    finally { syncPending.current = false; setSyncBusy(false); }
  }
  function showSync(folder: Workspace, notePath?: string) {
    setSyncPath(notePath);
    setSyncFolder(folders.find(item => item.root === folder.root) ?? folders[0] ?? folder);
  }
  const [renameTarget, setRenameTarget] = useState<{ folder: Workspace; path: string } | null>(null);
  const [readControls, setReadControls] = useState<HTMLDivElement | null>(null);
  const [galaxyMode, setGalaxyMode, galaxyError] = usePreference<boolean>("galaxy", true);
  const [translucent, setTranslucent, translucencyError] = usePreference<boolean>("translucent", true);
  const [supernova, setSupernova] = useState(0);
  const [showLineNumbers, setShowLineNumbers, numbersError] = usePreference<boolean>("line-numbers", true);
  const [showLineHighlight, setShowLineHighlight, highlightError] = usePreference<boolean>("line-highlight", false);
  const [wordWrap, setWordWrap, wrapError] = usePreference<boolean>("word-wrap", true);
  const [spellcheck, setSpellcheck, spellingError] = usePreference<boolean>("spellcheck", true);
  const [fontSize, setFontSize, fontError] = usePreference<string>("editor-size", "default", textSizes);
  const [editorFont, setEditorFont, editorFontError] = usePreference<EditorFont>("editor-font", "default", editorFonts);
  const [textWidth, setTextWidth, widthError] = usePreference<TextWidth>("text-width", "default", textWidths);
  const [lineSpacing, setLineSpacing, spacingError] = usePreference<LineSpacing>("line-spacing", "default", lineSpacings);
  const toggleGalaxy = () => setGalaxyMode(!galaxyMode);
  const toggleLineNumbers = () => setShowLineNumbers(!showLineNumbers);
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const syncFocus = () =>
      setWindowFocused(document.hasFocus() && !document.hidden);
    window.addEventListener("focus", syncFocus);
    window.addEventListener("blur", syncFocus);
    document.addEventListener("visibilitychange", syncFocus);
    return () => {
      window.removeEventListener("focus", syncFocus);
      window.removeEventListener("blur", syncFocus);
      document.removeEventListener("visibilitychange", syncFocus);
    };
  }, []);
  const [tabs, setTabs] = useState<NoteTab[]>([]);
  const pendingPins = useRef(new Set<string>());
  const tabsRef = useRef<NoteTab[]>([]);
  const snapshots = useRef(new Map<string, EditorSnapshot>());
  const [editorSnapshot, setEditorSnapshot] = useState<
    EditorSnapshot | undefined
  >();
  const updateTabs = useCallback((next: NoteTab[]) => {
    tabsRef.current = next;
    setTabs(next);
    for (const key of snapshots.current.keys())
      if (!next.some((t) => tabId(t) === key)) snapshots.current.delete(key);
  }, []);
  const reorderTabs = useCallback((id: string, beforeId: string | null) => {
    updateTabs(reorderTab(tabsRef.current, id, beforeId));
  }, [updateTabs]);
  const tabStripRef = useTabReorder(reorderTabs);
  const pin = useCallback(
    (root: string, path: string) => {
      const id = tabId({ root, path });
      if (tabsRef.current.some(t => tabId(t) === id && !t.pinned))
        updateTabs(pinTab(tabsRef.current, id));
    },
    [updateTabs],
  );
  const [folders, setFolders] = useState<Workspace[]>([demoWorkspace]);
  const [foldersReady, setFoldersReady] = useState(false);
  const [externalDrag, setExternalDrag] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(demoWorkspace);
  const [path, setPath] = useState("Getting started.md");
  const [data, setData] = useState<DocumentData | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const marksRef = useRef<Bookmark[]>([]);
  const [closePrompt, setClosePrompt] = useState<{ path: string; resolve: (choice: CloseTabChoice) => void } | null>(null);
  const closingTab = useRef(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved" | "error">("saved");
  const draftWrite = useRef(0);
  const draftFailed = useRef(false);
  const [mode, setMode] = useState<EditorMode>("edit");
  const [preview, setPreview] = useState("");
  const [searchScope,setSearchScope]=useState<SearchScope>("everywhere");
  const [palette, setPalette] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalStarted, setTerminalStarted] = useState(false);
  const [terminalControls, setTerminalControls] = useState<HTMLDivElement | null>(null);
  const toggleTerminal = () => { setTerminalStarted(true); setTerminalOpen(open => !open); };
  const [rail, setRail, railError] = usePreference<boolean>("bookmarks-panel", true);
  const [navigation, setNavigation, navigationError] = usePreference<boolean>("navigation-panel", true);
  const [topBars, setTopBars, topBarsError] = usePreference<boolean>("top-bars", true);
  const [statusBar, setStatusBar, statusBarError] = usePreference<boolean>("status-bar", true);
  const [focusMode, setFocusMode, focusModeError] = usePreference<boolean>("focus-mode", false);
  const [hoveredBottom, setHoveredBottom] = useState(false);
  const [hoveredTop, setHoveredTop] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<"left" | "right" | null>(null);
  const [bookmarkScope, setBookmarkScope] = useState<SearchScope>("current");
  const [allBookmarks, setAllBookmarks] = useState<BookmarkSearchHit[]>([]);
  const [bookmarksBusy, setBookmarksBusy] = useState(false);
  const [bookmarksError, setBookmarksError] = useState("");
  useEffect(() => {
    if ((!rail && !compact) || bookmarkScope !== "everywhere") {
      setBookmarksBusy(false);
      return;
    }
    let cancelled = false;
    setBookmarksBusy(true);
    setBookmarksError("");
    searchNotes(folders, "").then((result) => {
      if (cancelled) return;
      setAllBookmarks(result.bookmarks);
      setBookmarksError(result.warnings.join(" · "));
    }).catch((error) => {
      if (!cancelled) setBookmarksError(String(error));
    }).finally(() => {
      if (!cancelled) setBookmarksBusy(false);
    });
    return () => { cancelled = true; };
  }, [rail, compact, bookmarkScope, folders, path, workspace.root]);
  const currentBookmarks = data ? bookmarks.map((bookmark) => ({ root: workspace.root, path, bookmark })) : [];
  const visibleBookmarks = bookmarkScope === "current" ? currentBookmarks : [
    ...currentBookmarks,
    ...allBookmarks.filter((hit) =>
      folders.some((folder) => folder.root === hit.root) &&
      !(hit.root === workspace.root && hit.path === path)),
  ];
  const [activeFormats, setActiveFormats] = useState<FormatAction[]>([]);
  const [paragraphStyle, setParagraphStyle] = useState<FormatAction>("paragraph");
  const [cursor, setCursor] = useState([1, 1]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    // Browser previews already provide their own page zoom shortcuts.
    if (!desktop) return;
    return installZoomShortcuts(
      window,
      (factor) => getCurrentWebview().setZoom(factor),
      (error) => setNotice(`Unable to change zoom: ${String(error)}`),
    );
  }, []);
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
  const attachPreview = useCallback((element: HTMLDivElement | null) => {
    previewElement.current = element;
    if (element) element.scrollTo({ top: initialScrollTop(element, mobile), behavior: "instant" });
  }, []);
  const largeRead = useRef<LargeReadHandle>(null);
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
  const preserveDraft = useCallback(async (): Promise<boolean> => {
    const c = current.current;
    if (!c.hasDocument || !editor.current || !dirtyRef.current) return true;
    const write = ++draftWrite.current;
    setDraftStatus("saving");
    try {
      await storeDraft(c.workspace.root, c.path, {
        text: editor.current.text(), revision: revision.current, bookmarks: marksRef.current,
      });
      if (write === draftWrite.current) {
        draftFailed.current = false;
        setDraftStatus("saved");
      }
      return true;
    } catch (error) {
      if (write === draftWrite.current) {
        draftFailed.current = true;
        setDraftStatus("error");
      }
      setNotice(`Unable to preserve your draft. Save before closing: ${String(error)}`);
      return false;
    }
  }, []);
  const changed = useCallback(() => {
    pin(current.current.workspace.root, current.current.path);
    dirtyRef.current = true;
    setDirty(true);
    // The editor immediately supplies the updated anchors via onBookmarks.
  }, [pin]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const savedPrefs = await loadExplorer();
        // Secondary desktop windows and browser windows opened with Control-N
        // share the explorer, but start on the existing welcome screen.
        const freshWindow = desktop
          ? getCurrentWindow().label.startsWith("nova-")
          : new URLSearchParams(window.location.search).get("new-window") === "true";
        const prefs = freshWindow
          ? { ...savedPrefs, folders: savedPrefs?.folders ?? [demoWorkspace], active: null, tabs: [] }
          : savedPrefs;
        const restored = prefs
          ? await loadFolders(prefs.folders)
          : [demoWorkspace];
        if (cancelled) return;
        setFolders(restored);
        const mode = prefs?.mode ?? "edit";
        setMode(mode);
        const restoredTabs = prefs?.tabs ?? [];
        updateTabs(restoredTabs);
        const candidates: { folder: Workspace; path: string }[] = [];
        const active = restored.find(
          (f) => f.root === prefs?.active?.root && !f.error,
        );
        if (active && prefs?.active)
          candidates.push({ folder: active, path: prefs.active.path });
        for (const tab of restoredTabs) {
          const folder = restored.find(f => f.root === tab.root);
          if (folder) candidates.push({ folder, path: tab.path });
        }
        for (const folder of prefs?.tabs ? [] : restored)
          if (!folder.error && folder.files.length)
            candidates.push({ folder, path: folder.files[0].path });
        let opened = false;
        for (const candidate of candidates) {
          try {
            const { note, recovered } = await readRecoverableNote(candidate.folder.root, candidate.path);
            dirtyRef.current = recovered;
            setDirty(recovered);
            if (cancelled) return;
            revision.current = note.revision;
            setWorkspace(candidate.folder);
            setPath(candidate.path);
            setData(note);
            updateTabs(restoredTabs.length ? restoredTabs : [
              {
                root: candidate.folder.root,
                path: candidate.path,
                pinned: false,
              },
            ]);
            setPreview(note.text);
            applyMarks(note.bookmarks);
            opened = true;
            setMode(readFileMode(candidate.path, mode));
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
      folders: folders.map(({ root, name, collapsed, closedDirectories }) => ({
        root,
        name,
        collapsed,
        closedDirectories,
      })),
      active: data ? { root: workspace.root, path } : null,
      mode,
      tabs,
    }).catch((error) => setNotice(String(error)));
  }, [foldersReady, folders, workspace.root, path, mode, !!data, tabs]);
  const save = useCallback(async (): Promise<boolean> => {
    if (saveInFlight.current) return saveInFlight.current;
    const run = async () => {
      if (current.current.foldersReady) {
        try {
          const c = current.current;
          await saveExplorer({
            folders: c.folders.map(({ root, name, collapsed, closedDirectories }) => ({
              root,
              name,
              collapsed,
              closedDirectories,
            })),
            active: c.hasDocument
              ? { root: c.workspace.root, path: c.path }
              : null,
            mode: c.mode,
            tabs: tabsRef.current,
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
        if (syncIncluded(ws.syncPolicy, file)) uploads.schedule(ws.root);
        if (editor.current?.text() === text) {
          await clearDraft(ws.root, file);
          if (editor.current?.text() === text && marksRef.current === marks) {
            dirtyRef.current = false;
            draftFailed.current = false;
            setDirty(false);
          } else { await preserveDraft(); }
        } else { await preserveDraft(); }
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
  }, [preserveDraft]);
  useEffect(() => {
    if (!mobile) return;
    const preserve = () => { if (document.hidden) void preserveDraft(); };
    const flush = () => { void preserveDraft(); };
    document.addEventListener("visibilitychange", preserve);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", preserve); window.removeEventListener("pagehide", flush); };
  }, [preserveDraft]);
  const jump = useCallback((from: number, to = from) => {
    editor.current?.jump(from, to);
    const text = editor.current?.text() ?? "";
    const line = text.slice(0, from).split("\n").length;
    requestAnimationFrame(() => {
      if (largeRead.current) {
        largeRead.current.jump(line);
        return;
      }
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
    async (
      nextPath: string,
      line?: number,
      nextWorkspace?: Workspace,
      bookmarkId?: string,
      pinned = false,
    ) => {
      setMobileView("editor");
      const requested = nextWorkspace ?? current.current.workspace;
      if (pinned) {
        pendingPins.current.add(
          tabId({ root: requested.root, path: nextPath }),
        );
        pin(requested.root, nextPath);
      }
      if (
        current.current.hasDocument &&
        requested.root === current.current.workspace.root &&
        nextPath === current.current.path &&
        !line &&
        !bookmarkId
      )
        return true;
      if (voiceBusy.current) {
        setNotice("Finish or cancel voice typing before switching files.");
        return false;
      }
      if (operation.current || saveInFlight.current) return false;
      operation.current = true;
      try {
        if (!(await preserveDraft())) return false;
        setLoading(true);
        const ws = nextWorkspace ?? current.current.workspace;
        const { note, recovered } = await readRecoverableNote(ws.root, nextPath);
        const old = current.current;
        if (editor.current && old.hasDocument)
          snapshots.current.set(
            tabId({ root: old.workspace.root, path: old.path }),
            editor.current.snapshot(),
          );
        const id = tabId({ root: ws.root, path: nextPath });
        const cached = snapshots.current.get(id);
        // An external file change invalidates its cached history.
        setEditorSnapshot(
          cached && cached.state.doc.toString() === note.text
            ? cached
            : undefined,
        );
        updateTabs(
          openTab(tabsRef.current, {
            root: ws.root,
            path: nextPath,
            pinned:
              pinned ||
              pendingPins.current.has(id) ||
              tabsRef.current.some((t) => tabId(t) === id && t.pinned),
          }),
        );
        pendingPins.current.delete(id);
        dirtyRef.current = recovered;
        setDirty(recovered);
        revision.current = note.revision;
        setWorkspace(ws);
        setPath(nextPath);
        setData(note);
        setPreview(note.text);
        applyMarks(note.bookmarks);
        setActiveMark(null);
        setCursor([1, 1]);
        setMode(readFileMode(nextPath));
        if (bookmarkId) {
          const mark = note.bookmarks.find((b) => b.id === bookmarkId);
          if (mark && !mark.unresolved) {
            setActiveMark(mark.id);
            setMode("source");
            setTimeout(() => jump(mark.from, mark.to), 50);
          } else {
            setNotice(
              "This bookmark needs a new anchor. Its original passage could not be found.",
            );
          }
        } else if (line) {
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
    [applyMarks, jump, preserveDraft, pin, updateTabs],
  );
  const newTab = useCallback(async () => {
    if (!current.current.foldersReady || operation.current || voiceBusy.current) return;
    operation.current = true;
    let nextPath: string | undefined;
    let folder: Workspace | undefined;
    try {
      if (!(await preserveDraft())) return;
      folder = current.current.folders.find(f => f.root === current.current.workspace.root && !f.error)
        ?? current.current.folders.find(f => !f.error);
      if (!folder) throw new Error("Add a folder before creating a note.");
      nextPath = await createNote(folder.root, defaultExtension);
      const created = { root: folder.root, path: nextPath };
      createdNotes.current.set(tabId(created), created);
      folder = { ...folder, ...(await openWorkspace(folder.root)), collapsed: false };
      setFolders(old => old.map(f => f.root === folder!.root ? folder! : f));
    } catch (error) { setNotice(String(error)); }
    finally { operation.current = false; }
    if (nextPath && folder) {
      await openNote(nextPath, undefined, folder, undefined, true);
    }
  }, [preserveDraft, openNote, defaultExtension]);
  const renameFile = async (folder: Workspace, oldPath: string, name: string, moving = false) => {
    if (operation.current || saveInFlight.current || voiceBusy.current) throw new Error("Finish the current operation before renaming.");
    operation.current = true;
    try {
      if (!(await preserveDraft())) throw new Error("Could not preserve your draft before renaming.");
      await starQueue.current;
      const nextPath = await (moving ? moveNote(folder.root, oldPath, name) : renameNote(folder.root, oldPath, name));
      await moveDraft(folder.root, oldPath, nextPath);
      if (nextPath !== oldPath) createdNotes.current.delete(tabId({ root: folder.root, path: oldPath }));
      name = nextPath.split("/").at(-1)!;
      const updated = { ...folder, starred: (folder.starred ?? []).map(p => p === oldPath ? nextPath : p), files: folder.files.map(f => f.path === oldPath ? { path: nextPath, name } : f) };
      setFolders(old => old.map(f => f.root === folder.root ? { ...f, files: updated.files, starred: (f.starred ?? []).map(p => p === oldPath ? nextPath : p) } : f));
      const oldId = tabId({ root: folder.root, path: oldPath });
      const cached = snapshots.current.get(oldId);
      if (cached) snapshots.current.set(tabId({ root: folder.root, path: nextPath }), cached);
      updateTabs(tabsRef.current.map(t => tabId(t) === oldId ? { ...t, path: nextPath } : t));
      if (current.current.workspace.root === folder.root) {
        setWorkspace(updated);
        if (current.current.path === oldPath) {
          setEditorSnapshot(editor.current?.snapshot());
          current.current = { ...current.current, workspace: updated, path: nextPath };
          setPath(nextPath);
        }
      }
    } finally { operation.current = false; }
  };
  const discardCreatedNote = useCallback(async (note: { root: string; path: string }) => {
    const id = tabId(note);
    if (!createdNotes.current.has(id) || await loadDraft(note.root, note.path)) return;
    await starQueue.current;
    if (await discardEmptyUntitled(note.root, note.path)) {
      const withoutNote = (folder: Workspace): Workspace => folder.root === note.root
        ? { ...folder, files: folder.files.filter(file => file.path !== note.path), starred: folder.starred?.filter(path => path !== note.path) }
        : folder;
      setFolders(folders => folders.map(withoutNote));
      setWorkspace(withoutNote);
      snapshots.current.delete(id);
    }
    createdNotes.current.delete(id);
  }, []);
  const closeTab = async (tab: NoteTab) => {
    if (saveInFlight.current || closingTab.current) return;
    if (voiceBusy.current || operation.current) {
      setNotice("Finish the current operation before closing a tab.");
      return;
    }
    closingTab.current = true;
    let discardedActive = false;
    let closed = false;
    try {
      operation.current = true;
      const active = current.current.hasDocument && tabId({ root: current.current.workspace.root, path: current.current.path }) === tabId(tab);
      const draft = active ? null : await loadDraft(tab.root, tab.path);
      if ((active && dirtyRef.current) || draft) {
        const choice = await new Promise<CloseTabChoice>(resolve => setClosePrompt({ path: tab.path, resolve }));
        setClosePrompt(null);
        if (choice === "cancel") return;
        if (choice === "save") {
          if (active) {
            if (!(await save()) || dirtyRef.current) return;
          } else if (draft) {
            const savedRevision = await saveNote(tab.root, tab.path, draft.text, draft.revision);
            // Retain a recoverable draft with the new revision if bookmark saving fails.
            await storeDraft(tab.root, tab.path, { ...draft, revision: savedRevision });
            await saveBookmarks(tab.root, tab.path, draft.bookmarks);
            await clearDraft(tab.root, tab.path);
            const folder = current.current.folders.find(folder => folder.root === tab.root);
            if (folder && syncIncluded(folder.syncPolicy, tab.path)) uploads.schedule(tab.root);
          }
        } else {
          await clearDraft(tab.root, tab.path);
          if (active) {
            discardedActive = true;
            dirtyRef.current = false;
            setDirty(false);
          }
        }
      }
      operation.current = false;
      const id = tabId(tab),
        all = tabsRef.current,
        next = all.filter((t) => tabId(t) !== id);
      if (
        current.current.hasDocument &&
        tabId({
          root: current.current.workspace.root,
          path: current.current.path,
        }) === id
      ) {
        const neighbor =
          next[
            Math.min(
              all.findIndex((t) => tabId(t) === id),
              next.length - 1,
            )
          ];
        if (neighbor) {
          const folder = current.current.folders.find(
            (f) => f.root === neighbor.root,
          );
          if (!folder || !(await openNote(neighbor.path, undefined, folder)))
            return;
        } else {
          if (!(await preserveDraft())) return;
          setData(null);
          setPath("");
          applyMarks([]);
          setEditorSnapshot(undefined);
        }
      }
      updateTabs(next);
      closed = true;
      operation.current = true;
      try { await discardCreatedNote(tab); }
      catch (error) { setNotice(`Could not clean up empty note: ${String(error)}`); }
      finally { operation.current = false; }
    } catch (error) {
      setNotice(`Could not close tab: ${String(error)}`);
    } finally {
      if (discardedActive && !closed) {
        dirtyRef.current = true;
        setDirty(true);
        await preserveDraft();
      }
      operation.current = false;
      closingTab.current = false;
    }
  };
  useEffect(() => installTabCloseShortcut(window, mod === "⌘", () => {
    if (document.querySelector("dialog[open]") || palette || bookmarkDraft || closingTab.current) return;
    const c = current.current;
    const tab = tabsRef.current.find(tab => tab.root === c.workspace.root && tab.path === c.path);
    if (c.hasDocument && tab) void closeTab(tab);
  }));
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
  const starFile = (folder: Workspace, path: string, starred: boolean) => {
    if (operation.current || saveInFlight.current) return;
    starQueue.current = starQueue.current.catch(() => {}).then(async () => {
      try {
        const stars = await setFileStar(folder.root, path, starred);
        setFolders(old => old.map(f => f.root === folder.root ? { ...f, starred: stars, starsError: undefined } : f));
      } catch (error) { setNotice(`Could not update starred files: ${String(error)}`); }
    });
  };
  const refreshFolder = async (root: string) => {
    try {
      await starQueue.current;
      const refreshed = await openWorkspace(root);
      setFolders((old) =>
        old.map((f) =>
          f.root === root ? { ...refreshed, collapsed: f.collapsed, closedDirectories: f.closedDirectories } : f,
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
        if (!(await preserveDraft())) return;
        setData(null);
        setPath("");
        applyMarks([]);
        setWorkspace(next[0] ?? { name: "Your folders", root: "", files: [] });
      }
    }
    updateTabs(tabsRef.current.filter((t) => t.root !== root));
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
      !editor.current.isDocumentView() &&
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
    } else if (mode === "read" && !editor.current.isDocumentView()) {
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
    dirtyRef.current = true;
    setDirty(true);
    preserveDraft();
  };
  const changeFocusMode = useCallback((focused: boolean) => {
    if (!focused) {
      setNavigation(true);
      setRail(true);
      setTopBars(true);
      setStatusBar(true);
    }
    setFocusMode(focused);
  }, [setFocusMode, setNavigation, setRail, setTopBars, setStatusBar]);
  useEffect(() => {
    if (compact || syncFolder || settingsOpen || palette || bookmarkDraft || renameTarget || fileAction) return;
    return installPanelShortcuts(window, mod === "⌘", panel => {
      if (focusMode) setFocusMode(false);
      if (panel === "left") setNavigation(focusMode || !navigation);
      else if (panel === "right") setRail(focusMode || !rail);
      else if (panel === "top") setTopBars(focusMode || !topBars);
      else { setTerminalStarted(true); setTerminalOpen(open => focusMode || !open); }
    });
  }, [compact, syncFolder, settingsOpen, palette, bookmarkDraft, renameTarget, fileAction, focusMode, navigation, rail, topBars, setFocusMode, setNavigation, setRail, setTopBars]);
  useEffect(() => {
    const toggleFocus = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "g" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && !syncFolder && !settingsOpen && !palette && !bookmarkDraft && !renameTarget && !fileAction) changeFocusMode(!focusMode);
    };
    window.addEventListener("keydown", toggleFocus, { capture: true });
    return () => window.removeEventListener("keydown", toggleFocus, { capture: true });
  }, [focusMode, changeFocusMode, syncFolder, settingsOpen, palette, bookmarkDraft, renameTarget, fileAction]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (syncFolder) return;
      if (e.target instanceof Element && e.target.closest("#terminal-panel")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!e.altKey && !e.shiftKey && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "t")) {
        e.preventDefault();
        if (e.repeat) return;
        if (mobile) { void newTab(); }
        else if (e.key.toLowerCase() === "n") {
          if (desktop) void invoke("new_window").catch(error => setNotice(String(error)));
          else {
            const url = new URL(window.location.href);
            url.searchParams.set("new-window", "true");
            window.open(url.href, "_blank", "noopener");
          }
        } else if (!syncFolder && !settingsOpen && !palette && !bookmarkDraft && !renameTarget && !fileAction) void newTab();
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        if (!palette && !bookmarkDraft) setSettingsOpen(true);
        return;
      }
      if (settingsOpen || renameTarget || fileAction) return;
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
  }, [save, beginBookmark, syncFolder, settingsOpen, palette, bookmarkDraft, renameTarget, fileAction, newTab]);
  useEffect(() => {
    const preserveSession = async () => {
      const c = current.current;
      if (!c.foldersReady) return;
      await saveExplorer({
        folders: c.folders.map(({ root, name, collapsed, closedDirectories }) => ({ root, name, collapsed, closedDirectories })),
        active: c.hasDocument ? { root: c.workspace.root, path: c.path } : null,
        tabs: tabsRef.current, mode: c.mode,
      });
    };
    const preserve = async () => {
      try { await preserveSession(); return await preserveDraft(); }
      catch (error) { setNotice(`Unable to preserve your session: ${String(error)}`); return false; }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      // Native close/quit awaits the durable writes below. Browser recovery is synchronous.
      if (voiceBusy.current || draftFailed.current) { e.preventDefault(); e.returnValue = ""; }
      void preserveDraft();
    };
    window.addEventListener("beforeunload", beforeUnload);
    let disposed = false,
      unlisten: (() => void) | undefined,
      unlistenQuit: (() => void) | undefined;
    if (desktop)
      void getCurrentWindow()
        .onCloseRequested(async (e) => {
          e.preventDefault();
          if (operation.current || saveInFlight.current) return;
          if (voiceBusy.current) {
            setNotice("Finish or cancel voice typing before closing Nova.");
            return;
          }
          if (await preserve()) {
            try {
              await getCurrentWindow().destroy();
            } catch (error) { setNotice(String(error)); }
          }
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
        if (operation.current || saveInFlight.current) return;
        if (await preserve()) {
          try {
            await invoke("quit_app");
          } catch (error) { setNotice(String(error)); }
        }
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
  }, [preserveDraft]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().listen("nova:select-all", () => {
      if (editor.current?.selectAll()) return;
      // Preserve Select All in search, rename, and other native text fields.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.select();
      else document.execCommand("selectAll");
    }).then(fn => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  const switchMode = (next: EditorMode) => {
    if (next === "read") setPreview(editor.current?.text() ?? data?.text ?? "");
    setMode(next);
    try { saveFileMode(path, next); }
    catch { setNotice("View mode changed, but could not be saved on this device."); }
  };
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(path);
  const documentView = isMarkdown && supportsDocumentView(
    data?.text.length ?? 0, editorSnapshot?.state.doc.length ?? 0, preview.length,
  );
  const toggleReadTask = (offset: number, checked: boolean) => {
    editor.current?.toggleTask(offset, checked);
    setPreview(editor.current?.text() ?? "");
  };
  return (
    <div className="app-shell" data-compact={compact} data-mobile={mobile} data-mobile-view={mobileView} data-focus-mode={!compact && focusMode} data-window-focused={windowFocused} data-galaxy={galaxyMode} data-translucent={supportsTranslucency && translucent} data-editor-size={fontSize} data-editor-font={editorFont} data-text-width={textWidth} data-line-spacing={lineSpacing}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const edgeWidth = bounds.width * 0.05;
        setHoveredEdge(x <= edgeWidth ? "left" : x >= bounds.width - edgeWidth ? "right" : null);
      }}
      onPointerLeave={() => setHoveredEdge(null)}>
      {!compact && <SidePanelControls navigation={navigation} bookmarks={rail} hoveredEdge={hoveredEdge}
        onNavigation={() => setNavigation(!navigation)} onBookmarks={() => setRail(!rail)}
        onStorageError={() => setNotice("Panel widths changed, but could not be saved on this device.")} />}
      {!compact && focusMode && (
        <button className="sidebar-action focus-toggle focus-mode-exit" aria-label="Exit focus mode" aria-pressed={true}
          aria-describedby="exit-focus-tooltip" aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+G`} onClick={() => changeFocusMode(false)}>
          <BlackHoleIcon />
          <span className="focus-tooltip" id="exit-focus-tooltip" role="tooltip">
            <span>Exit focus mode</span><span className="focus-tooltip-keys"><kbd>{mod}</kbd><kbd>G</kbd></span>
          </span>
        </button>
      )}
      <PlasmaEffects active={!compact && galaxyMode && windowFocused} supernova={supernova} dirty={dirty} lineHighlight={showLineHighlight} />
      {compact && <nav className="mobile-navigation" aria-label="Main navigation">
        <button aria-label="Your notes" aria-pressed={mobileView === "notes"} onClick={() => setMobileView("notes")}><FolderOpen size={20} /><span>Notes</span></button>
        <button aria-label="Write note" aria-pressed={mobileView === "editor"} onClick={() => setMobileView("editor")}><Pencil size={20} /><span>Write</span></button>
        <button aria-label="Your bookmarks" aria-pressed={mobileView === "bookmarks"} onClick={() => setMobileView("bookmarks")}><BookmarkIcon size={20} /><span>Bookmarks</span></button>
        <button aria-label="Search notes" onClick={() => setPalette(true)}><Search size={20} /><span>Search</span></button>
        <button aria-label="Mobile settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={20} /><span>Settings</span></button>
      </nav>}
      <aside id="global-navigation" className="sidebar" hidden={compact ? mobileView !== "notes" : !navigation}>
        <div className="brand">
          <button
            className="brand-emblem"
            aria-label="Supernova"
            title="Supernova · Light up your workspace"
            onClick={() => setSupernova(performance.now())}
          >
            <NovaMark className="brand-symbol" />
          </button>
          <span>
            nova<span className="brand-period">.</span>
          </span>
          <button className="galaxy-toggle" aria-label="Galaxy mode" aria-pressed={galaxyMode}
            title={galaxyMode ? "Galaxy mode on · Click to turn off" : "Galaxy mode off · Click to turn on"}
            onClick={toggleGalaxy}>
            <GalaxyMark className="galaxy-symbol" />
          </button>
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
          onOpen={(folder, path, pinned = false) => {
            void openNote(path, undefined, folder, undefined, pinned);
          }}
          onFileAction={(folder, path, action) => {
            if (action === "reveal") void revealNote(folder.root, path).catch(error => setNotice(String(error)));
            else setFileAction({ folder, path, action });
          }}
          onSync={drive.status.connected ? folder => showSync(folder) : undefined}
          onToggleSync={drive.status.connected ? (folder, path) => void toggleFileSync(folder, path) : undefined}
          syncBusy={syncBusy}
          onStar={starFile}
          onRename={(folder, path) => setRenameTarget({ folder, path })}
          onChange={changeFolders}
          onRemove={(root) => void removeFolder(root)}
          onRefresh={(root) => void refreshFolder(root)}
          onAdd={() => void openFolder()}
          externalDrag={externalDrag}
        />
        <div className="sidebar-bottom">
          {drive.status.connected && <button className="global-sync-button" aria-haspopup="dialog" onClick={() => showSync(workspace)}>
            <Cloud size={18} aria-hidden="true" />
            <span><strong>Sync</strong><small>{uploads.activeRoot ? "Uploading…" : Object.values(uploads.errors).some(Boolean) ? "Upload needs attention" : drive.status.email}</small></span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>}
          <div className="local-indicator">
            <span />
            {folders.length} {folders.length === 1 ? "folder" : "folders"} ·
            stored locally
          </div>
          <p>{mobile ? "Notes stay on this device." : "Drag folder handles to organize your space."}</p>
          <div className="sidebar-actions">
            <button className="sidebar-action" hidden={mobile} aria-label="Add folders" title="Add folders" onClick={openFolder}>
              <Plus size={17} aria-hidden="true" />
            </button>
            <button className="sidebar-action" aria-label="Settings" title={`Settings (${mod} ,)`}
              aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={17} aria-hidden="true" />
            </button>
            <button className="sidebar-action" aria-label={drive.status.connected ? "Sync settings" : "Set up sync"}
              title={drive.status.connected ? "Sync settings" : "Set up Google Drive sync"}
              aria-haspopup="dialog" onClick={() => showSync(workspace)}>
              <Cloud size={17} aria-hidden="true" />
            </button>
            <button className="sidebar-action focus-toggle" aria-label="Enter focus mode" aria-pressed={focusMode}
              aria-describedby="enter-focus-tooltip" aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+G`} onClick={() => changeFocusMode(true)}>
              <BlackHoleIcon />
              <span className="focus-tooltip" id="enter-focus-tooltip" role="tooltip">
                <span>Focus mode</span><span className="focus-tooltip-keys"><kbd>{mod}</kbd><kbd>G</kbd></span>
              </span>
            </button>
          </div>
        </div>
      </aside>
      <main className="main-panel" hidden={compact && mobileView !== "editor"}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const top = event.currentTarget.querySelector(".top-bars-container")!.getBoundingClientRect();
          setHoveredTop(event.clientY <= Math.max(top.bottom + 12, bounds.top + 48));
          const bottomPanel = event.currentTarget.querySelector(".terminal-panel");
          const bottomEdge = bottomPanel?.getBoundingClientRect().top ?? bounds.bottom;
          setHoveredBottom(Math.abs(event.clientY - bottomEdge) <= 32);
        }}
        onPointerLeave={() => { setHoveredTop(false); setHoveredBottom(false); }}>
        <div className="top-bars-container">
        <div id="top-bars" className="top-bars" hidden={!compact && !topBars}>
        <header className="tab-bar">
          <div ref={tabStripRef} className="note-tabs" role="tablist" aria-label="Open notes">
            {tabs.map((tab) => {
              const active =
                !!data && tab.root === workspace.root && tab.path === path;
              const name = tab.path.split("/").at(-1);
              const tabFolder = folders.find(folder => folder.root === tab.root);
              const selectedForSync = !tabFolder?.syncError && syncIncluded(tabFolder?.syncPolicy, tab.path);
              return (
                <div
                  key={tabId(tab)}
                  data-tab-id={tabId(tab)}
                  className={
                    "note-tab " +
                    (active ? "active " : "") +
                    (!tab.pinned ? "preview-tab" : "")
                  }
                >
                  <button
                    role="tab"
                    aria-selected={active}
                    title={
                      tab.root +
                      "/" +
                      tab.path +
                      (!tab.pinned
                        ? " · Preview — double-click to keep open"
                        : " · Double-click to rename")
                    }
                    onDoubleClick={() => {
                      if (!tab.pinned) { pin(tab.root, tab.path); return; }
                      const folder = folders.find(f => f.root === tab.root);
                      if (folder) setRenameTarget({ folder, path: tab.path });
                    }}
                    onClick={() => {
                      const folder = folders.find((f) => f.root === tab.root);
                      if (folder) void openNote(tab.path, undefined, folder);
                    }}
                  >
                    <FileText size={14} />
                    <span>{name}</span>
                    {active && dirty && <span className="dirty-dot" />}
                  </button>
                  {drive.status.connected && <button className="tab-sync" data-selected={selectedForSync}
                    aria-label={`Sync settings for ${name}: ${selectedForSync ? "selected for sync" : "local only"}`}
                    title={selectedForSync ? (uploads.items[`${tab.root}\n${tab.path}`]?.message ?? "Selected · Waiting for upload") : "Local only · Choose sync settings"}
                    aria-haspopup="dialog" disabled={!tabFolder}
                    onClick={() => { if (tabFolder) showSync(tabFolder, tab.path); }}>
                    {selectedForSync ? <Cloud size={13} /> : <CloudOff size={13} />}
                  </button>}
                  <button
                    className="tab-close"
                    aria-label={`Close ${name}`}
                    onClick={() => void closeTab(tab)}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
          <button className="icon-button new-tab-button" onClick={() => void newTab()} aria-label="New tab" title="New tab (Ctrl T)"><Plus size={16} /></button>
          <div className="tab-bar-space" />
          {drive.status.connected && <div className="top-drive-actions"><button className="top-sync-button" aria-label={drive.status.connected ? "Sync settings · Google Drive connected" : "Connect Google Drive"}
            title={drive.status.connected ? `Connected as ${drive.status.email}` : "Connect Google Drive"} aria-haspopup="dialog" onClick={() => showSync(workspace)}>
            <Cloud size={16} aria-hidden="true" /><span>{uploads.activeRoot ? "Uploading…" : Object.values(uploads.errors).some(Boolean) ? "Sync needs attention" : "Drive connected"}</span>
          </button><button className="icon-button" aria-label="Open workspace in Google Drive"
            title="Open workspace in Google Drive" disabled={!!uploads.activeRoot || workspace.root === "demo"}
            onClick={() => void uploads.openFolder(workspace.root)}><ExternalLink size={15} aria-hidden="true" /></button></div>}
          <button hidden={compact} className="icon-button" onClick={toggleTerminal}
            aria-label={terminalOpen ? "Collapse terminal" : "Open terminal"} title={`Toggle terminal (${mod}↓)`} aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+ArrowDown`}
            aria-expanded={terminalOpen} aria-controls="terminal-panel"><TerminalSquare size={17} /></button>
          <button
            className="icon-button"
            onClick={() => compact ? setMobileView("bookmarks") : setRail(!rail)}
            aria-label="Toggle bookmarks"
            title={`Toggle bookmarks (${mod}→)`} aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+ArrowRight`}
          >
            <PanelRight size={17} />
          </button>
        </header>
        <div className="document-toolbar" data-paginated={mode === "read" && !documentView && preview.length > RICH_DOCUMENT_LIMIT}>
          <div className="breadcrumbs">
            <span>{workspace.name}</span>
            <ChevronRight size={13} />
            <span>{path.split("/").at(-1)}</span>
          </div>
          <div className="read-controls" ref={setReadControls} />
          <FontControl toolbar value={editorFont} onChange={setEditorFont} />
          <TextSizeControl toolbar value={fontSize} onChange={setFontSize} />
          <TextWidthControl toolbar value={textWidth} onChange={setTextWidth} />
          <LineSpacingControl toolbar value={lineSpacing} onChange={setLineSpacing} />
          {!mobile && <button
            className="icon-button toolbar-icon"
            aria-label="Open in File Location"
            title={workspace.root === "demo" ? "Sample notes have no file location" : "Open in File Location"}
            disabled={!desktop || !workspace.root || workspace.root === "demo" || !path}
            onClick={() => void revealNote(workspace.root, path).catch(error => setNotice(String(error)))}
          >
            <FolderOpen size={17} aria-hidden="true" />
          </button>}
          {mode !== "read" && !(documentView && mode === "edit") && (
            <button
              className="line-numbers-toggle"
              aria-pressed={showLineNumbers}
              title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
              onClick={toggleLineNumbers}
            >
              <ListOrdered size={15} aria-hidden="true" />
              Line numbers
              <span className="line-numbers-check" aria-hidden="true">
                {showLineNumbers && <Check size={13} />}
              </span>
            </button>
          )}
          <button
            className="line-numbers-toggle"
            aria-pressed={showLineHighlight}
            title={showLineHighlight ? "Hide line highlight" : "Show line highlight"}
            onClick={() => setShowLineHighlight(!showLineHighlight)}
          >
            <ScanLine size={15} aria-hidden="true" />
            Line highlight
            <span className="line-numbers-check" aria-hidden="true">
              {showLineHighlight && <Check size={13} />}
            </span>
          </button>
          {galaxyMode && <button
            className="icon-button toolbar-icon focus-toggle"
            aria-label="Translucent background"
            aria-pressed={translucent}
            aria-describedby="translucency-tooltip"
            onClick={() => setTranslucent(!translucent)}
          >
            <Blend size={17} aria-hidden="true" />
            <span className="focus-tooltip" id="translucency-tooltip" role="tooltip">
              Translucent background · {translucent ? "On" : "Off"}
            </span>
          </button>}
          {!mobile && <VoiceControl
            disabled={!data || loading || saving}
            onBegin={() => {
              setMode((old) =>
                old === "read" ? (isMarkdown ? "edit" : "source") : old,
              );
              editor.current?.beginDictation();
            }}
            onPartial={(text) => editor.current?.previewDictation(text)}
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
          />}
          <div className="view-switch">
            {isMarkdown && (
              <button
                onClick={() => switchMode("source")}
                className={mode === "source" ? "selected" : ""}
                title="Edit Markdown source"
              >
                <Code2 size={14} />
                Source
              </button>
            )}
            <button
              onClick={() => switchMode(isMarkdown ? "edit" : "source")}
              className={(isMarkdown ? mode === "edit" : mode !== "read") ? "selected" : ""}
              title={documentView ? "Edit formatted Markdown" : isMarkdown ? "Edit Markdown source (large note)" : "Edit text"}
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
        {data && mode !== "read" && isMarkdown && (
          <FormatToolbar active={activeFormats} style={paragraphStyle} onFormat={(style) => editor.current?.format(style)}
            onUndo={() => editor.current?.undo()} onRedo={() => editor.current?.redo()} />
        )}
        </div>
        <div className="panel-toggle-zone panel-toggle-top" data-expanded={topBars} data-edge-hover={hoveredTop}>
          <button className="panel-toggle" aria-label={topBars ? "Collapse top bars" : "Expand top bars"}
            title={`${topBars ? "Collapse" : "Expand"} top bars (${mod}↑)`} aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+ArrowUp`} aria-expanded={topBars} aria-controls="top-bars"
            onClick={() => setTopBars(!topBars)}>
            {topBars ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        </div>
        {data && mode === "read" && <ReadFind
          key={JSON.stringify([workspace.root, path, data.revision])}
          text={preview}
          disabled={!!(syncFolder || settingsOpen || palette || bookmarkDraft || renameTarget || fileAction)}
          onJump={jump}
        />}
        <div className="document-area">
          {loading && <div className="loading">Opening your note…</div>}
          {data && (
            <div className={"write-pane " + (mode === "read" && !documentView ? "hidden" : "")}>
              <Editor
                key={JSON.stringify([workspace.root, path, data.revision])}
                ref={editor}
                initial={data.text}
                snapshot={editorSnapshot}
                bookmarks={bookmarks}
                onChange={changed}
                onBookmarks={(marks) => { applyMarks(marks); preserveDraft(); }}
                onParagraphStyle={setParagraphStyle}
                onFormatting={setActiveFormats}
                onCursor={(line, col) => setCursor([line, col])}
                onBookmark={beginBookmark}
                onSave={() => void save()}
                onSourceSearch={() => setMode("source")}
                isMarkdown={isMarkdown}
                filePath={path}
                onRename={name => renameFile(workspace, path, name)}
                documentMode={documentView && mode !== "source" ? mode : undefined}
                showLineNumbers={showLineNumbers}
                showLineHighlight={showLineHighlight}
                wordWrap={wordWrap}
                spellcheck={spellcheck}
              />
            </div>
          )}
          {data && mode === "read" && !documentView && (
            <div className="read-pane" ref={attachPreview}>
              <div className="start-mark" aria-hidden="true"><GalaxyMark circled /></div>
              <article className="prose">
                <div className="document-eyebrow">
                  {isMarkdown ? "A NOTE IN YOUR SPACE" : "PLAIN & SIMPLE"}
                </div>
                <FileTitle key={path} path={path} onRename={name => renameFile(workspace, path, name)} />
                <Suspense fallback={<p>Rendering your note…</p>}>
                  {preview.length > RICH_DOCUMENT_LIMIT ? (
                    <LargeRead ref={largeRead} text={preview} markdown={isMarkdown} controlsContainer={readControls} onToggleTask={toggleReadTask} />
                  ) : isMarkdown ? (
                    <Markdown text={preview} onToggleTask={toggleReadTask} />
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
                <div className="end-mark">
                  <GalaxyMark circled />
                </div>
              </article>
            </div>
          )}
          {!data && !loading && (
            <div className="empty-editor">
              <FolderOpen size={32} />
              <h2>{mobile ? "A little space to think." : "A folder is all you need."}</h2>
              <p>{mobile ? "Start your first note. Your words stay on this device." : "Open a folder with Markdown or text files."}</p>
              <button className="primary" onClick={mobile ? () => void newTab() : openFolder}>
                {mobile ? "Create a note" : "Open folder"}
              </button>
            </div>
          )}
        </div>
        {!mobile && <TerminalPanel hoveredEdge={hoveredBottom} started={terminalStarted} open={terminalOpen && statusBar} root={workspace.root} controlsContainer={terminalControls}
          onOpenChange={(open) => { if (open) { setTerminalStarted(true); setStatusBar(true); } setTerminalOpen(open); }} onStorageError={() => setNotice("Terminal height changed, but could not be saved on this device.")} />}
        <div className="status-bar-container">
        <footer id="status-bar" className="status-bar" hidden={!statusBar}>
          <span>
            <span className="status-dot" />
            {saving
              ? "Saving…"
              : dirty
                ? draftStatus === "saving" ? "Saving draft…" : draftStatus === "error" ? "Draft not saved" : "Draft saved · Unsaved to file"
                : "All changes saved"}
          </span>
          <span>
            {mode !== "read"
              ? `Ln ${cursor[0]}, Col ${cursor[1]}`
              : "Reading mode"}
          </span>
          <span>{isMarkdown ? "Markdown" : codeLanguage(path)?.name ?? "Plain text"}</span>
          <span>UTF-8</span>
          <div className="status-terminal-controls" ref={setTerminalControls}>

          </div>
        </footer>
        </div>
      </main>
      {(compact ? mobileView === "bookmarks" : rail) && (
        <aside id="bookmarks-panel" className="bookmark-rail">
          <header>
            <BookmarkIcon size={16} />
            <strong>Bookmarks</strong>
            <span className="count">{visibleBookmarks.length}</span>
            <button
              className="icon-button"
              onClick={beginBookmark}
              title={`Add bookmark (${mod} Shift B)`}
              aria-label="Add bookmark"
            >
              <Plus size={17} />
            </button>
          </header>
          <ScopeToggle label="Bookmark scope" scope={bookmarkScope} onChange={setBookmarkScope} currentLabel="Current tab" allLabel="All bookmarks" />
          <div className="rail-intro">{bookmarkScope === "current" ? "Your way back to the good parts." : "Across all added folders."}</div>
          {bookmarkScope === "everywhere" && bookmarksBusy && <div role="status" className="rail-intro">Loading bookmarks…</div>}
          {bookmarkScope === "everywhere" && bookmarksError && <div role="status" className="rail-intro">{bookmarksError}</div>}
          <div className="bookmark-list">
            {visibleBookmarks.map(({ bookmark: b, root, path: bookmarkPath }, i) => {
              const isCurrent = root === workspace.root && bookmarkPath === path;
              return (
              <div
                className={
                  "bookmark-card " + (isCurrent && activeMark === b.id ? "current" : "")
                }
                key={JSON.stringify([root, bookmarkPath, b.id])}
              >
                <button
                  className="bookmark-jump"
                  disabled={isCurrent && b.unresolved}
                  title={b.quote}
                  onClick={() => {
                    if (isCurrent) {
                      setMobileView("editor");
                      setActiveMark(b.id);
                      requestAnimationFrame(() => jump(b.from, b.to));
                    } else {
                      const folder = folders.find((f) => f.root === root);
                      if (folder) void openNote(bookmarkPath, undefined, folder, b.id);
                    }
                  }}
                >
                  <div className="bookmark-meta">
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      {b.unresolved
                        ? "Needs a new anchor"
                        : !isCurrent ? "Open passage" : `Line ${b.line ?? (editor.current?.text() ?? data?.text ?? "").slice(0, b.from).split("\n").length}`}
                    </span>
                  </div>
                  {bookmarkScope === "everywhere" && <span className="bookmark-source">{folders.find((f) => f.root === root)?.name} / {bookmarkPath}</span>}
                  <strong>{b.name}</strong>
                  <p>{b.quote || "The bookmarked text was removed."}</p>
                </button>
                {isCurrent && <div className="bookmark-actions">
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
                </div>}
              </div>
            ); })}
          </div>
          {!visibleBookmarks.length && !bookmarksBusy && (
            <div className="empty-bookmarks">
              <BookmarkIcon size={25} />
              <p>{bookmarkScope === "current" ? "Keep a place in your note." : "No bookmarks in your folders yet."}</p>
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
          commands={[{
            id: "line-numbers",
            label: "Toggle line numbers",
            description: showLineNumbers ? "Currently on · Hide line numbers" : "Currently off · Show line numbers",
            keywords: "show hide numbering gutter",
            run: toggleLineNumbers,
          }]}
          scope={searchScope}
          onScopeChange={setSearchScope}
          activeNote={data?{root:workspace.root,path,bookmarks:marksRef.current}:null}
          getActiveText={() => editor.current?.text() ?? data?.text ?? ""}
          onNavigateCurrent={(from,to)=>{setMobileView("editor");if(from!==undefined){setMode('source');requestAnimationFrame(()=>jump(from,to));}else editor.current?.jump(editor.current.selection().from);}}
          onClose={() => {
            setPalette(false);
            if (mode !== "read")
              editor.current?.jump(editor.current.selection().from);
          }}
          onOpen={(root, p, l, bookmarkId) => {
            const folder = folders.find((f) => f.root === root);
            if (folder) void openNote(p, l, folder, bookmarkId);
          }}
        />
      )}
      {closePrompt && <CloseTabDialog path={closePrompt.path} onChoose={closePrompt.resolve} />}
      {fileAction && <FileActionDialog {...fileAction} onClose={() => setFileAction(null)} onSubmit={async destination => {
        const { folder, path: targetPath, action } = fileAction;
        if (action === "move") { await renameFile(folder, targetPath, destination, true); return; }
        if (operation.current || saveInFlight.current || voiceBusy.current) throw new Error("Finish the current operation before deleting.");
        operation.current = true;
        try {
          if (!(await preserveDraft())) throw new Error("Could not preserve your draft before deleting.");
          await starQueue.current;
          await deleteNote(folder.root, targetPath);
          createdNotes.current.delete(tabId({ root: folder.root, path: targetPath }));
          const updated = { ...folder, files: folder.files.filter(f => f.path !== targetPath), starred: (folder.starred ?? []).filter(p => p !== targetPath) };
          setFolders(old => old.map(f => f.root === folder.root ? { ...f, files: updated.files, starred: (f.starred ?? []).filter(p => p !== targetPath) } : f));
          const id = tabId({ root: folder.root, path: targetPath });
          snapshots.current.delete(id);
          updateTabs(tabsRef.current.filter(t => tabId(t) !== id));
          if (current.current.workspace.root === folder.root) {
            setWorkspace(updated);
            if (current.current.path === targetPath) { setData(null); setPath(""); applyMarks([]); setEditorSnapshot(undefined); current.current = { ...current.current, workspace: updated, path: "", hasDocument: false }; }
          }
        } finally { operation.current = false; }
      }} />}
      {syncFolder && <SyncSettings onRestored={async root => { const restored = await openWorkspace(root); await acceptFolders([restored]); setSyncFolder(restored); setSyncPath(undefined); }} uploads={uploads} onUpload={async () => { if (await save()) await uploads.upload(syncFolder.root); }} drive={drive} key={syncFolder.root} folder={syncFolder} folders={folders} initialPath={syncPath} onFolderChange={folder => showSync(folder)} onClose={() => setSyncFolder(null)}
        onSaved={policy => { setFolders(old => old.map(folder => folder.root === syncFolder.root ? { ...folder, syncPolicy: policy, syncError: undefined } : folder)); setWorkspace(old => old.root === syncFolder.root ? { ...old, syncPolicy: policy } : old); uploads.schedule(syncFolder.root); }} />}
      {renameTarget && (
        <RenameDialog
          path={renameTarget.path}
          root={renameTarget.folder.root === "demo" ? renameTarget.folder.name : renameTarget.folder.root}
          onRename={name => renameFile(renameTarget.folder, renameTarget.path, name)}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {settingsOpen && <Settings syncConnected={drive.status.connected} onSyncSetup={() => { setSettingsOpen(false); showSync(workspace); }} onClose={() => setSettingsOpen(false)}
        onOpenDrive={() => void uploads.openFolder(workspace.root)} openDriveDisabled={!!uploads.activeRoot || workspace.root === "demo"}
        galaxy={galaxyMode} onGalaxy={setGalaxyMode}
        lineHighlight={showLineHighlight} onLineHighlight={setShowLineHighlight}
        lineNumbers={showLineNumbers} onLineNumbers={setShowLineNumbers} wordWrap={wordWrap} onWordWrap={setWordWrap}
        spellcheck={spellcheck} onSpellcheck={setSpellcheck} bookmarks={rail} onBookmarks={setRail}
        defaultExtension={defaultExtension} onDefaultExtension={setDefaultExtension}
        fontSize={fontSize} onFontSize={setFontSize}
        editorFont={editorFont} onEditorFont={setEditorFont}
        textWidth={textWidth} onTextWidth={setTextWidth}
        lineSpacing={lineSpacing} onLineSpacing={setLineSpacing}
        storageError={editorFontError || extensionError || spacingError || widthError || galaxyError || translucencyError || numbersError || highlightError || wrapError || spellingError || fontError || railError || navigationError || topBarsError || statusBarError || focusModeError} />}
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
