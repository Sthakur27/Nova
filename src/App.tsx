import { documentChanged } from "./documentChanged";
import SettingDialog from "./SettingDialog";
import { settingChoices, toggleSetting } from "./settingCommands";
import ViewOptions from "./ViewOptions";
import { startEditorWindowDrag } from "./editorWindowDrag";
import TabButton from "./TabButton";
import { openAfterTabClose } from "./closeTabNavigation";
import CloudSetup from "./CloudSetup";
import { confirmCloudMove } from "./confirmCloudMove";
import { useCloudSpaces } from "./useCloudSpaces";
import CloseTabDialog, { type CloseTabChoice } from "./CloseTabDialog";
import { installTabCloseShortcut } from "./tabShortcuts";
import ReadFind from "./ReadFind";
import { installFileSearchShortcut } from "./fileSearchShortcut";
import FileTitle from "./FileTitle";
import { mobile, supportsFrosted } from "./platform";
import { useCompactLayout } from "./useCompactLayout";
import { useFocusTransition } from "./useFocusTransition";
import SyncSettings from "./SyncSettings";
import { driveTransfer } from "./driveTransfer";
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
import { useTooltips } from "./useTooltips";
import { DEFAULT_EXTENSION } from "./fileExtensions";
import { useBackgroundBlur } from "./useBackgroundBlur";
import ScopeToggle from "./ScopeToggle";
import BookmarkSections from "./BookmarkSections";
import StarredFiles from "./StarredFiles";
import type {SearchScope} from "./currentSearch";
import { openTab, pinTab, reorderTab, tabId, type NoteTab } from "./tabs";
import { useTabReorder, type PaneDrop } from "./useTabReorder";
import EditorPanes from "./EditorPanes";
import { paneMode, paneToolbar, type PaneView } from "./paneToolbar";
import { initialPane, paneLeaves, reconcilePanes, selectPaneTab, movePaneTab, mapPane, parsePaneLayout, type Pane, type PaneNode } from "./paneLayout";
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
  PanelsTopLeft,
  Plus,
  Search,
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
import { invoke, resetLocalState, localResetInProgress } from "./resetLocalState";
import { listen } from "@tauri-apps/api/event";
import Editor, { type EditorHandle, type EditorSnapshot } from "./Editor";
import Palette from "./Palette";
import Explorer from "./Explorer";
import FileActionDialog from "./FileActionDialog";
import RenameDialog from "./RenameDialog";
import FormatToolbar from "./FormatToolbar";
import { FontControl, TextSizeControl, editorFonts, textSizes, type EditorFont } from "./TypographyControls";
import type { FormatAction } from "./richMarkdown";
import { type EditorMode } from "./folders";
import { folderPreference, folderWindowPreferences, migrateLocalFolders, rememberFolder, type RecentFolder } from "./localFolders";
import VoiceControl from "./VoiceControl";
import NovaStar from "./NovaStar";
import SignalBell from "./SignalBell";
import SidebarAppearance from "./SidebarAppearance";
import GalaxyMark from "./GalaxyMark";
import SidebarSection from "./SidebarSection";
import { useAppUpdate } from "./useAppUpdate";
import { initialScrollTop } from "./scrollSpace";
import { readFileMode, saveFileMode } from "./fileModes";
import { RICH_DOCUMENT_LIMIT, supportsDocumentView } from "./documentLimits";
import PlasmaEffects from "./PlasmaEffects";
import { DEFAULT_GALAXY_PERFORMANCE, galaxyPerformanceModes, galaxyPerformanceLabels, type GalaxyPerformance } from "./galaxyPerformance";
import {
  chooseWorkspaces, openFolderWindow, listDirectory, mergeDirectory,
  createNote,
  renameNote,
  moveNote,
  deleteNote,
  discardEmptyUntitled,
  revealNote,
  setFileStar,
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
// Retain the existing on/off storage values when adding the third mode.
const backgroundModes = ["on", "off", "frosted"] as const;
const availableBackgroundModes: readonly typeof backgroundModes[number][] = supportsFrosted ? backgroundModes : backgroundModes.filter(mode => mode !== "frosted");
const backgroundLabels = { on: "Translucent", off: "Black", frosted: "Frosted" };
const launchMessages = ["Thrusters active", "Orbit stabilized", "Hyperdrive humming", "Stardust calibrated", "Cosmic vibes nominal"];
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

type PaneSession = { workspace: Workspace; path: string; data: DocumentData; mode: EditorMode; snapshot?: EditorSnapshot; dirty: boolean; cursor: [number, number]; preview: string; formats?: FormatAction[]; paragraph?: FormatAction };

export default function App() {
  const [launchMessage] = useState(() => launchMessages[Math.floor(Math.random() * launchMessages.length)]);
  const compact = useCompactLayout();
  const [mobileView, setMobileView] = useState<"notes" | "editor" | "bookmarks">("editor");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingId, setActiveSettingId] = useState<string | null>(null);
  const [defaultExtension, setDefaultExtension, extensionError] = usePreference<string>("default-extension", DEFAULT_EXTENSION);
  const starQueue = useRef(Promise.resolve());
  const createdNotes = useRef(new Map<string, { root: string; path: string }>());
  const [fileAction, setFileAction] = useState<{ folder: Workspace; path: string; action: "move" | "delete" } | null>(null);
  const drive = useDriveConnection();
  const uploads = useDriveUploads(drive.status.connected);
  const [syncFolder, setSyncFolder] = useState<Workspace | null>(null);
  const [syncPath, setSyncPath] = useState<string | undefined>();
  function showSync(folder: Workspace, notePath?: string) {
    setSyncPath(notePath);
    setSyncFolder(folders.find(item => item.root === folder.root) ?? folders[0] ?? folder);
  }
  const [renameTarget, setRenameTarget] = useState<{ folder: Workspace; path: string } | null>(null);
  const [readingLayout, setReadingLayout] = usePreference<"continuous" | "pages">("reading-layout", "continuous", ["continuous", "pages"]);
  const [readControls, setReadControls] = useState<HTMLDivElement | null>(null);
  const [galaxyPerformance, setGalaxyPerformance, galaxyPerformanceError] = usePreference<GalaxyPerformance>("galaxy-performance", DEFAULT_GALAXY_PERFORMANCE, galaxyPerformanceModes);
  const [galaxyMode, setGalaxyMode, galaxyError] = usePreference<boolean>("galaxy", true);
  const [showTooltips, setShowTooltips, tooltipsError] = usePreference<boolean>("tooltips", true);
  useTooltips(showTooltips);
  const [savedBackgroundMode, setBackgroundMode, translucencyError] = usePreference<typeof backgroundModes[number]>("translucent", "on", backgroundModes);
  const backgroundMode = !supportsFrosted && savedBackgroundMode === "frosted" ? "off" : savedBackgroundMode;
  const [frostedPanes, setFrostedPanes, frostedPanesError] = usePreference<boolean>("frosted-panes", false);
  const nextBackgroundMode = availableBackgroundModes[(availableBackgroundModes.indexOf(backgroundMode) + 1) % availableBackgroundModes.length];
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
  const [paneLayout, setPaneLayout] = useState<PaneNode>(initialPane);
  const paneLayoutRef = useRef<PaneNode>(paneLayout);
  const [activePane, setActivePane] = useState("main");
  const activePaneRef = useRef("main");
  const paneSessions = useRef(new Map<string, PaneSession>());
  const paneEditors = useRef(new Map<string, EditorHandle>());
  const paneActions = useRef<{ capture: () => void; activate: (id: string) => boolean; drop: (id: string, target: PaneDrop) => void } | null>(null);
  const updatePaneLayout = useCallback((next: PaneNode) => {
    paneLayoutRef.current = next;
    setPaneLayout(next);
  }, []);
  const focusPane = useCallback((id: string) => { activePaneRef.current = id; setActivePane(id); }, []);
  const pendingPins = useRef(new Set<string>());
  const tabsRef = useRef<NoteTab[]>([]);
  const snapshots = useRef(new Map<string, EditorSnapshot>());
  const [editorSnapshot, setEditorSnapshot] = useState<
    EditorSnapshot | undefined
  >();
  const updateTabs = useCallback((next: NoteTab[]) => {
    tabsRef.current = next;
    setTabs(next);
    updatePaneLayout(reconcilePanes(paneLayoutRef.current, next.map(tabId), activePaneRef.current));
    for (const key of snapshots.current.keys())
      if (!next.some((t) => tabId(t) === key)) snapshots.current.delete(key);
    for (const key of paneSessions.current.keys())
      if (!next.some(t => tabId(t) === key)) paneSessions.current.delete(key);
  }, []);
  const reorderTabs = useCallback((id: string, beforeId: string | null) => {
    updateTabs(reorderTab(tabsRef.current, id, beforeId));
  }, [updateTabs]);
  const dropTab = useCallback((id: string, target: PaneDrop) => paneActions.current?.drop(id, target), []);
  const tabStripRef = useTabReorder(reorderTabs, dropTab);
  const pin = useCallback(
    (root: string, path: string) => {
      const id = tabId({ root, path });
      if (tabsRef.current.some(t => tabId(t) === id && !t.pinned))
        updateTabs(pinTab(tabsRef.current, id));
    },
    [updateTabs],
  );
  const [folders, setFolders] = useState<Workspace[]>([demoWorkspace]);
  const [recents, setRecents] = useState<RecentFolder[]>([]);
  const recentsRef = useRef<RecentFolder[]>([]);
  const localActivity = useRef(new Map<string, { path: string; mode: EditorMode }>());
  const updateRecents = (next: RecentFolder[]) => { recentsRef.current = next; setRecents(next); };
  const [loadingDirectories, setLoadingDirectories] = useState<Record<string, string[]>>({});
  const directoryRequests = useRef(new Map<string, symbol>());
  const localSwitchRequest = useRef(0);
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
  const savedDocuments = useRef(new Map<string, DocumentData>());
  const readRecoverableNote = useCallback(async (root: string, path: string) => {
    const draft = await loadDraft(root, path);
    const id = tabId({ root, path });
    // A recovery draft must still open if the original file is unavailable.
    let saved: DocumentData | undefined;
    try { saved = await readNote(root, path); }
    catch (error) { if (!draft) throw error; }
    if (saved) savedDocuments.current.set(id, saved);
    else savedDocuments.current.delete(id);
    const note = draft ?? saved!;
    const recovered = documentChanged(saved, note.text, note.bookmarks);
    if (draft && !recovered) await clearDraft(root, path);
    // Keep a changed draft's original revision for conflict detection on Save.
    return { note: recovered ? note : saved!, recovered };
  }, []);
  const refreshDirty = useCallback(() => {
    const c = current.current;
    const next = documentChanged(savedDocuments.current.get(tabId({ root: c.workspace.root, path: c.path })),
      editor.current?.text() ?? "", marksRef.current);
    dirtyRef.current = next;
    setDirty(next);
    return next;
  }, []);
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved" | "error">("saved");
  const draftWrite = useRef(0);
  const draftFailed = useRef(false);
  const [mode, setMode] = useState<EditorMode>("edit");
  const sharedViewMode = useRef<EditorMode | null>(null);
  const [preview, setPreview] = useState("");
  const [searchScope,setSearchScope]=useState<SearchScope>("everywhere");
  const [palette, setPalette] = useState<false | "All" | "Files">(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalStarted, setTerminalStarted] = useState(false);
  const [terminalControls, setTerminalControls] = useState<HTMLDivElement | null>(null);
  const [rail, setRail, railError] = usePreference<boolean>("bookmarks-panel", true);
  const [navigation, setNavigation, navigationError] = usePreference<boolean>("navigation-panel", true);
  const [topBars, setTopBars, topBarsError] = usePreference<boolean>("top-bars", true);
  const [statusBar, setStatusBar, statusBarError] = usePreference<boolean>("status-bar", true);
  const changeTerminalOpen = useCallback((open: boolean) => {
    if (open) {
      setTerminalStarted(true);
      setStatusBar(true);
    }
    setTerminalOpen(open);
  }, [setStatusBar]);
  const toggleTerminal = () => changeTerminalOpen(!(terminalOpen && statusBar));
  const [focusMode, setFocusMode, focusModeError] = usePreference<boolean>("focus-mode", false);
  const focusModeActive = focusMode || (!navigation && !rail && !topBars && !statusBar);
  const [hoveredBottom, setHoveredBottom] = useState(false);
  const [hoveredTop, setHoveredTop] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<"left" | "right" | null>(null);
  const [bookmarkView, setBookmarkView] = useState<"passages" | "files">("files");
  const activeStarFolder = folders.find(folder => folder.root === workspace.root);
  const activeFileStarred = activeStarFolder?.starred?.includes(path) ?? false;
  const [bookmarkScope, setBookmarkScope] = useState<SearchScope>("current");
  const [allBookmarks, setAllBookmarks] = useState<BookmarkSearchHit[]>([]);
  const [bookmarksBusy, setBookmarksBusy] = useState(false);
  const [bookmarksError, setBookmarksError] = useState("");
  useEffect(() => {
    if ((!rail && !compact) || bookmarkScope !== "everywhere" || bookmarkView !== "passages") {
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
  }, [rail, compact, bookmarkScope, bookmarkView, folders, path, workspace.root]);
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
  if (data && !workspace.cloudSpace) localActivity.current.set(workspace.root, { path, mode });
  const applyMarks = useCallback((marks: Bookmark[]) => {
    marksRef.current = marks;
    setBookmarks(marks);
  }, []);
  const preserveDraft = useCallback(async (): Promise<boolean> => {
    if (localResetInProgress()) return true;
    const c = current.current;
    if (!c.hasDocument || !editor.current) return true;
    const write = ++draftWrite.current;
    setDraftStatus("saving");
    try {
      if (dirtyRef.current) await storeDraft(c.workspace.root, c.path, {
        text: editor.current.text(), revision: revision.current, bookmarks: marksRef.current,
      });
      else await clearDraft(c.workspace.root, c.path);
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
  const capturePane = () => {
    if (!data || !current.current.hasDocument) return;
    const id = tabId({ root: current.current.workspace.root, path: current.current.path });
    const snapshot = editor.current?.snapshot();
    if (snapshot) snapshots.current.set(id, snapshot);
    paneSessions.current.set(id, { workspace: current.current.workspace, path: current.current.path,
      data: { text: editor.current?.text() ?? data.text, revision: revision.current, bookmarks: marksRef.current },
      snapshot, formats: activeFormats, paragraph: paragraphStyle, dirty: dirtyRef.current, mode: current.current.mode, cursor: [cursor[0], cursor[1]], preview: editor.current?.text() ?? preview });
  };
  const activatePane = (id: string): boolean => {
    if (id === activePaneRef.current) return true;
    if (operation.current || saveInFlight.current || voiceBusy.current) return false;
    const pane = paneLeaves(paneLayoutRef.current).find(p => p.id === id);
    const session = pane?.selected ? paneSessions.current.get(pane.selected) : undefined;
    if (!session) return false;
    if (current.current.workspace.cloudSpace && dirtyRef.current) {
      void save().then(saved => { if (saved) paneActions.current?.activate(id); });
      return false;
    }
    capturePane();
    // The old editor remains mounted; a failed draft write cannot discard its text.
    void preserveDraft();
    focusPane(id);
    const handle = paneEditors.current.get(pane!.selected!);
    editor.current = handle ?? null;
    current.current = { ...current.current, workspace: session.workspace, path: session.path, mode: session.mode, hasDocument: true };
    revision.current = session.data.revision;
    dirtyRef.current = session.dirty;
    applyMarks(session.data.bookmarks);
    setWorkspace(session.workspace); setPath(session.path); setData(session.data);
    setMode(session.mode); setDirty(session.dirty); setPreview(session.preview);
    setEditorSnapshot(session.snapshot); setCursor(session.cursor); setActiveMark(null);
    setActiveFormats(session.formats ?? []); setParagraphStyle(session.paragraph ?? "paragraph");
    return true;
  };
  paneActions.current = { capture: capturePane, activate: activatePane, drop: (id, target) => {
    if (compact || operation.current || saveInFlight.current || voiceBusy.current) return;
    capturePane();
    const next = movePaneTab(paneLayoutRef.current, id, target.pane, target.edge, target.before);
    if (next === paneLayoutRef.current) return;
    const tab = tabsRef.current.find(t => tabId(t) === id);
    if (!tab) return;
    pin(tab.root, tab.path);
    // Load unseen tabs through the usual recovery path before moving them.
    const folder = current.current.folders.find(f => f.root === tab.root);
    if (!folder) return;
    void openNote(tab.path, undefined, folder).then(opened => {
      if (!opened) return;
      requestAnimationFrame(() => {
        if (tabId({ root: current.current.workspace.root, path: current.current.path }) !== id) return;
        paneActions.current?.capture();
        setEditorSnapshot(paneSessions.current.get(id)?.snapshot);
        const moved = movePaneTab(paneLayoutRef.current, id, target.pane, target.edge, target.before);
        updatePaneLayout(moved);
        const owner = paneLeaves(moved).find(p => p.tabs.includes(id));
        if (owner) focusPane(owner.id);
      });
    });
  } };
  const preserveInactiveDrafts = useCallback(async (): Promise<boolean> => {
    const activeId = tabId({ root: current.current.workspace.root, path: current.current.path });
    try {
      await Promise.all(Array.from(paneSessions.current.entries()).filter(([id, session]) => id !== activeId && session.dirty)
        .map(([, session]) => storeDraft(session.workspace.root, session.path, session.data)));
      return true;
    } catch (error) { setNotice(`Unable to preserve a pane's draft: ${String(error)}`); return false; }
  }, []);
  const prepareUpdate = async () => {
    if (operation.current || saveInFlight.current || voiceBusy.current || !current.current.foldersReady) {
      throw new Error("Finish the current operation or voice typing before updating.");
    }
    operation.current = true;
    try {
      const c = current.current;
      await saveExplorer({
        folders: c.folders.map(folderPreference),
        recents: recentsRef.current,
        active: c.hasDocument ? { root: c.workspace.root, path: c.path } : null,
        tabs: tabsRef.current, panes: paneLayoutRef.current, mode: c.mode,
      });
      if (!await preserveInactiveDrafts() || !(await preserveDraft())) throw new Error("Save your note before restarting; its recovery draft could not be preserved.");
    } catch (error) { operation.current = false; throw error; }
  };
  const appUpdate = useAppUpdate(desktop, prepareUpdate, () => { operation.current = false; });
  const [editVersion, setEditVersion] = useState(0);
  const editGeneration = useRef(0);
  const changed = useCallback(() => {
    pin(current.current.workspace.root, current.current.path);
    refreshDirty();
    editGeneration.current++;
    setEditVersion(value => value + 1);
    // The editor immediately supplies the updated anchors via onBookmarks.
  }, [pin, refreshDirty]);
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
        const requestedFolder = (window as Window & { __NOVA_OPEN_FOLDER__?: string }).__NOVA_OPEN_FOLDER__
          ?? (!desktop ? new URLSearchParams(window.location.search).get("folder") : null);
        const prefs = requestedFolder ? folderWindowPreferences(savedPrefs, requestedFolder) : freshWindow
          ? { ...savedPrefs, mode: savedPrefs?.mode ?? "edit", folders: savedPrefs?.folders ?? [demoWorkspace], active: null, tabs: [], panes: undefined }
          : savedPrefs;
        const loaded = prefs ? await loadFolders(prefs.folders) : mobile ? [] : [demoWorkspace];
        const migrated = migrateLocalFolders(requestedFolder ? prefs : savedPrefs, loaded);
        const restored = mobile ? loaded.filter(folder => !!folder.cloudSpace) : migrated.folders;
        if (cancelled) return;
        setFolders(restored);
        updateRecents(mobile ? [] : migrated.recents);
        const mode = prefs?.mode ?? "edit";
        setMode(mode);
        const restoredTabs = (prefs?.tabs ?? []).filter(tab => restored.some(folder => folder.root === tab.root));
        updateTabs(restoredTabs);
        const restoredLayout = parsePaneLayout(prefs?.panes, restoredTabs.map(tabId));
        if (restoredLayout) {
          updatePaneLayout(restoredLayout);
          await Promise.all(paneLeaves(restoredLayout).map(async pane => {
            const tab = restoredTabs.find(t => tabId(t) === pane.selected);
            const folder = restored.find(f => f.root === tab?.root);
            if (!tab || !folder) return;
            try {
              const { note, recovered } = await readRecoverableNote(tab.root, tab.path);
              paneSessions.current.set(tabId(tab), { workspace: folder, path: tab.path, data: note, dirty: recovered, mode: readFileMode(tab.path, mode), cursor: [1, 1], preview: note.text });
            } catch (error) { setNotice(String(error)); }
          }));
          if (cancelled) return;
        }
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
            const initialId = tabId({ root: candidate.folder.root, path: candidate.path });
            const owner = paneLeaves(paneLayoutRef.current).find(p => p.tabs.includes(initialId));
            if (owner) { updatePaneLayout(selectPaneTab(paneLayoutRef.current, owner.id, initialId)); focusPane(owner.id); }
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
            restored.find(folder => folder.root === requestedFolder) ?? restored.find(folder => !folder.cloudSpace) ?? restored[0] ?? { name: "Your folders", root: "", files: [] },
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
      folders: folders.map(folderPreference),
      recents,
      active: data ? { root: workspace.root, path } : null,
      mode,
      tabs,
      panes: paneLayout,
    }).catch((error) => setNotice(String(error)));
  }, [foldersReady, folders, recents, workspace.root, path, mode, !!data, tabs, paneLayout]);
  const save = useCallback(async (): Promise<boolean> => {
    if (localResetInProgress()) return false;
    if (saveInFlight.current) return saveInFlight.current;
    const run = async () => {
      if (current.current.foldersReady) {
        try {
          const c = current.current;
          await saveExplorer({
            folders: c.folders.map(folderPreference),
            recents: recentsRef.current,
            active: c.hasDocument
              ? { root: c.workspace.root, path: c.path }
              : null,
            mode: c.mode,
            tabs: tabsRef.current,
            panes: paneLayoutRef.current,
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
        savedDocuments.current.set(tabId({ root: ws.root, path: file }), { text, bookmarks: marks, revision: revision.current });
        if (ws.cloudSpace) uploads.schedule(ws.root);
        if (!refreshDirty()) {
          await clearDraft(ws.root, file);
          if (!refreshDirty()) {
            dirtyRef.current = false;
            draftFailed.current = false;
            setDirty(false);
            const session = paneSessions.current.get(tabId({ root: ws.root, path: file }));
            if (session) { session.dirty = false; session.data = { text, bookmarks: marks, revision: revision.current }; }
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
  }, [preserveDraft, refreshDirty]);
  useEffect(() => {
    if (!workspace.cloudSpace || !dirty) return;
    const timer = setTimeout(() => { if (!operation.current && !voiceBusy.current) void save(); }, 700);
    const retry = setInterval(() => { if (dirtyRef.current && !operation.current && !voiceBusy.current) void save(); }, 4000);
    return () => { clearTimeout(timer); clearInterval(retry); };
  }, [workspace.root, workspace.cloudSpace, dirty, editVersion, save]);
  useEffect(() => {
    if (!mobile) return;
    const preserve = () => { if (document.hidden) { void preserveDraft(); if (current.current.workspace.cloudSpace) void save(); } };
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
      reportError = true,
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
      ) {
        const owner = paneLeaves(paneLayoutRef.current).find(p => p.tabs.includes(tabId({ root: requested.root, path: nextPath })));
        if (owner) { updatePaneLayout(selectPaneTab(paneLayoutRef.current, owner.id, tabId({ root: requested.root, path: nextPath }))); focusPane(owner.id); }
        return true;
      }
      if (voiceBusy.current) {
        setNotice("Finish or cancel voice typing before switching files.");
        return false;
      }
      if (operation.current || saveInFlight.current) return false;
      operation.current = true;
      try {
        if (current.current.workspace.cloudSpace && dirtyRef.current && !await save()) return false;
        if (!(await preserveDraft())) return false;
        setLoading(true);
        const ws = nextWorkspace ?? current.current.workspace;
        const { note, recovered } = await readRecoverableNote(ws.root, nextPath);
        paneActions.current?.capture();
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
          }, new Set(paneLeaves(paneLayoutRef.current).find(p => p.id === activePaneRef.current)?.tabs ?? [])),
        );
        const owner = paneLeaves(paneLayoutRef.current).find(p => p.tabs.includes(id));
        if (owner) { updatePaneLayout(selectPaneTab(paneLayoutRef.current, owner.id, id)); focusPane(owner.id); }
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
        setMode(sharedViewMode.current ? paneMode(sharedViewMode.current, nextPath) : readFileMode(nextPath));
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
        if (reportError) setNotice(String(e));
        return false;
      } finally {
        setLoading(false);
        operation.current = false;
      }
    },
    [applyMarks, jump, preserveDraft, pin, updateTabs, save],
  );
  const newTab = useCallback(async (requested?: Workspace) => {
    if (!current.current.foldersReady || operation.current || voiceBusy.current) return;
    operation.current = true;
    let nextPath: string | undefined;
    let folder: Workspace | undefined;
    try {
      if (current.current.workspace.cloudSpace && dirtyRef.current && !await save()) return;
      if (!(await preserveDraft())) return;
      folder = current.current.folders.find(f => f.root === (requested?.root ?? current.current.workspace.root) && !f.error)
        ?? current.current.folders.find(f => !f.error);
      if (!folder) throw new Error("Open a folder before creating a note.");
      nextPath = await createNote(folder.root, defaultExtension);
      const created = { root: folder.root, path: nextPath };
      createdNotes.current.set(tabId(created), created);
      folder = { ...folder, ...(await openWorkspace(folder.root, folder.expandedDirectories)), collapsed: false };
      setFolders(old => old.map(f => f.root === folder!.root ? folder! : f));
    } catch (error) { setNotice(String(error)); }
    finally { operation.current = false; }
    if (nextPath && folder) {
      await openNote(nextPath, undefined, folder, undefined, true);
    }
  }, [preserveDraft, openNote, defaultExtension, save]);
  const renamePaneTab = (oldId: string, nextTab: NoteTab) => {
    const nextId = tabId(nextTab);
    if (oldId === nextId) return;
    const saved = savedDocuments.current.get(oldId);
    if (saved) { savedDocuments.current.set(nextId, saved); savedDocuments.current.delete(oldId); }
    const session = paneSessions.current.get(oldId);
    if (session) paneSessions.current.set(nextId, { ...session, path: nextTab.path, snapshot: paneEditors.current.get(oldId)?.snapshot() ?? session.snapshot });
    let layout = paneLayoutRef.current;
    for (const pane of paneLeaves(layout)) if (pane.tabs.includes(oldId)) {
      layout = mapPane(layout, pane.id, node => node.kind === "pane" ? { ...node, tabs: node.tabs.map(id => id === oldId ? nextId : id), selected: node.selected === oldId ? nextId : node.selected } : node);
    }
    updatePaneLayout(layout);
  };
  const renameFile = async (folder: Workspace, oldPath: string, name: string, moving = false) => {
    if (operation.current || saveInFlight.current || voiceBusy.current) throw new Error("Finish the current operation before renaming.");
    operation.current = true;
    try {
      if (!(await preserveDraft())) throw new Error("Could not preserve your draft before renaming.");
      await starQueue.current;
      const nextPath = await (moving ? moveNote(folder.root, oldPath, name) : renameNote(folder.root, oldPath, name));
      await moveDraft(folder.root, oldPath, nextPath);
      if (folder.cloudSpace) uploads.schedule(folder.root);
      if (nextPath !== oldPath) createdNotes.current.delete(tabId({ root: folder.root, path: oldPath }));
      name = nextPath.split("/").at(-1)!;
      const updated = { ...folder, ...(await openWorkspace(folder.root, folder.expandedDirectories)) };
      setFolders(old => old.map(f => f.root === folder.root ? { ...f, files: updated.files, syncPolicy: updated.syncPolicy, starred: updated.starred } : f));
      const oldId = tabId({ root: folder.root, path: oldPath });
      paneActions.current?.capture();
      renamePaneTab(oldId, { root: folder.root, path: nextPath, pinned: true });
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
      const parked = paneSessions.current.get(tabId(tab));
      const draft = active ? null : parked?.dirty ? parked.data : await loadDraft(tab.root, tab.path);
      if ((active && dirtyRef.current) || draft) {
        const choice = current.current.folders.find(folder => folder.root === tab.root)?.cloudSpace ? "save" : await new Promise<CloseTabChoice>(resolve => setClosePrompt({ path: tab.path, resolve }));
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
            if (folder?.cloudSpace) uploads.schedule(tab.root);
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
        // Preserve first; choosing a replacement must never decide whether the
        // requested tab is allowed to close.
        if (!(await preserveDraft())) return;
        const ownGroup = paneLeaves(paneLayoutRef.current).find(p => p.tabs.includes(id));
        const opened = await openAfterTabClose(all, tab, ownGroup?.tabs ?? [], async neighbor => {
          const folder = current.current.folders.find(f => f.root === neighbor.root);
          return !!folder && await openNote(neighbor.path, undefined, folder, undefined, neighbor.pinned, false);
        });
        if (!opened) {
          current.current = { ...current.current, hasDocument: false, path: "" };
          dirtyRef.current = false;
          setDirty(false);
          setData(null);
          setPath("");
          applyMarks([]);
          setEditorSnapshot(undefined);
        }
      }
      updateTabs(next);
      closed = true;
      setNotice("");
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
    const selected = paneLeaves(paneLayoutRef.current).find(pane => pane.id === activePaneRef.current)?.selected;
    const tab = tabsRef.current.find(tab => c.hasDocument
      ? tab.root === c.workspace.root && tab.path === c.path
      : tabId(tab) === selected);
    if (tab) void closeTab(tab);
  }));
  const changeFolders = (next: Workspace[]) => {
    // Explorer can hide disconnected Cloud spaces; retain their state when revealing a tab.
    if (current.current.foldersReady) setFolders(old => old.map(folder => next.find(item => item.root === folder.root) ?? folder));
  };
  const switchLocalFolder = async (folder: Workspace | null) => {
    if (!current.current.foldersReady) return;
    if (folder?.error) { setNotice(`Could not open ${folder.name}: ${folder.error}`); return; }
    if (voiceBusy.current || operation.current || saveInFlight.current) {
      setNotice("Finish the current operation before switching folders."); return;
    }
    const c = current.current;
    const previous = c.folders.find(f => !f.cloudSpace);
    if (folder && previous?.root === folder.root) return;
    operation.current = true;
    setLoading(true);
    try {
      const recent = folder ? recentsRef.current.find(r => r.root === folder.root) : undefined;
      const restored = folder ? { ...folder, collapsed: false, closedDirectories: recent?.closedDirectories, expandedDirectories: recent?.expandedDirectories ?? [] } : null;
      const localTabs = recent?.tabs ?? [];
      const cloudTabs = tabsRef.current.filter(tab => c.folders.some(f => f.root === tab.root && f.cloudSpace));
      const nextTabs = [...cloudTabs, ...localTabs];
      const nextFolders = [...c.folders.filter(f => f.cloudSpace), ...(restored ? [restored] : [])];
      const candidates = restored
        ? [...new Set([recent?.active, ...localTabs.map(t => t.path)].filter((p): p is string => !!p))].map(path => ({ folder: restored, path }))
        : cloudTabs.map(tab => ({ folder: nextFolders.find(f => f.root === tab.root)!, path: tab.path }));
      // Read the incoming document before committing the switch. Missing files
      // remain in the saved tab list; other recoverable tabs can still reopen.
      let selected: { folder: Workspace; path: string; note: DocumentData; recovered: boolean } | undefined;
      const warnings: string[] = [];
      for (const candidate of candidates) {
        try { selected = { ...candidate, ...await readRecoverableNote(candidate.folder.root, candidate.path) }; break; }
        catch (error) { warnings.push(`${candidate.path}: ${String(error)}`); }
      }
      const preservedGeneration = editGeneration.current;
      paneActions.current?.capture();
      if (!await preserveInactiveDrafts() || !await preserveDraft()) return;
      if (preservedGeneration !== editGeneration.current) { setNotice("Your note changed while switching. Open the folder again when you finish typing."); return; }
      let nextRecents = recentsRef.current;
      if (previous) {
        const activity = localActivity.current.get(previous.root);
        nextRecents = rememberFolder(nextRecents, previous, tabsRef.current,
          activity ? { root: previous.root, path: activity.path } : null, activity?.mode ?? c.mode, paneLayoutRef.current);
      }
      if (restored && !recent) nextRecents = rememberFolder(nextRecents, restored, [], null, c.mode);
      if (recent) nextRecents = [recent, ...nextRecents.filter(r => r.root !== recent.root)];
      const nextWorkspace = selected?.folder ?? restored ?? nextFolders[0] ?? { root: "", name: "Your folders", files: [] };
      if (selected && !nextTabs.some(tab => tab.root === selected.folder.root && tab.path === selected.path)) nextTabs.push({ root: selected.folder.root, path: selected.path, pinned: false });
      const nextMode = selected ? readFileMode(selected.path, recent?.mode ?? c.mode) : recent?.mode ?? c.mode;
      const nextLayout = reconcilePanes(!cloudTabs.length && recent?.panes ? recent.panes : paneLayoutRef.current, nextTabs.map(tabId), activePaneRef.current);
      // Persist the concrete next session before dropping any current UI state.
      await saveExplorer({ folders: nextFolders.map(folderPreference), recents: nextRecents, tabs: nextTabs, panes: nextLayout,
        active: selected ? { root: selected.folder.root, path: selected.path } : null, mode: nextMode });
      if (preservedGeneration !== editGeneration.current) {
        await saveExplorer({ folders: c.folders.map(folderPreference), recents: recentsRef.current, tabs: tabsRef.current, panes: paneLayoutRef.current,
          active: c.hasDocument ? { root: c.workspace.root, path: c.path } : null, mode: c.mode });
        await preserveDraft();
        setNotice("Your note changed while switching. Open the folder again when you finish typing."); return;
      }
      directoryRequests.current.clear(); setLoadingDirectories({});
      updateRecents(nextRecents);
      setFolders(nextFolders);
      updateTabs(nextTabs); updatePaneLayout(nextLayout);
      const owner = paneLeaves(nextLayout).find(p => p.tabs.includes(selected ? tabId({ root: selected.folder.root, path: selected.path }) : "")) ?? paneLeaves(nextLayout)[0];
      focusPane(owner.id);
      if (selected) updatePaneLayout(selectPaneTab(nextLayout, owner.id, tabId({ root: selected.folder.root, path: selected.path })));
      setWorkspace(nextWorkspace); setPath(selected?.path ?? ""); setData(selected?.note ?? null);
      setPreview(selected?.note.text ?? ""); applyMarks(selected?.note.bookmarks ?? []);
      setEditorSnapshot(undefined); setMode(nextMode); setActiveMark(null); setCursor([1, 1]);
      revision.current = selected?.note.revision ?? "";
      dirtyRef.current = selected?.recovered ?? false; setDirty(dirtyRef.current);
      current.current = { ...c, folders: nextFolders, workspace: nextWorkspace, path: selected?.path ?? "", hasDocument: !!selected, mode: nextMode };
      setNotice(warnings.join(" · "));
    } catch (error) { setNotice(`Could not switch folders: ${String(error)}`); }
    finally { operation.current = false; setLoading(false); }
  };
  const launchFolder = async (root: string) => {
    await openFolderWindow(root);
    // Record the destination without replacing this window's folder or tabs.
    if (!recentsRef.current.some(recent => recent.root === root)) {
      updateRecents(rememberFolder(recentsRef.current, { root, name: root.split(/[\\/]/).at(-1) || root, files: [] }, [], null, current.current.mode));
    }
  };
  const openRecent = async (recent: RecentFolder) => {
    try { await launchFolder(recent.root); }
    catch (error) { setNotice(`Could not open ${recent.name}: ${String(error)}`); }
  };
  const acceptFolders = async (added: Workspace[]) => {
    if (added.length > 1) { setNotice("Open one local folder at a time."); return; }
    const folder = added[0];
    if (folder?.cloudSpace) {
      setFolders(old => [...old.filter(f => f.root !== folder.root), folder]);
      return;
    }
    if (folder) await switchLocalFolder(folder);
  };
  const cloud = useCloudSpaces(drive.status.connected, foldersReady, spaces => {
    setFolders(previous => [...previous.filter(folder => !folder.cloudSpace && !mobile), ...spaces.map(space => ({...space, collapsed: previous.find(f => f.root === space.root)?.collapsed ?? false}))]);
    const currentSpace = spaces.find(space => space.root === current.current.workspace.root);
    if (currentSpace) setWorkspace(currentSpace);
    else if ((!current.current.workspace.root || !!current.current.workspace.cloudSpace) && spaces.length) {
      setWorkspace(spaces[0]);
      if (spaces[0].files.length) void openNote(spaces[0].files[0].path, undefined, spaces[0]);
    }
  });
  async function moveToCloud(folder: Workspace, notePath: string) {
    try {
      const target = current.current.folders.find(f => !!f.cloudSpace);
      if (!target) { showSync(folder); return; }
      if (!await confirmCloudMove(notePath, target.name)) return;
      if (current.current.workspace.root === folder.root && current.current.path === notePath && !await save()) return;
      const nextPath = await invoke<string>("cloud_move_in", {source:folder.root,path:notePath,target:target.root});
      await refreshFolder(folder.root); await refreshFolder(target.root);
      updateTabs(tabsRef.current.filter(tab => !(tab.root === folder.root && tab.path === notePath)));
      const updated = await openWorkspace(target.root);
      await openNote(nextPath, undefined, updated, undefined, true);
      uploads.schedule(target.root);
    } catch(error) { setNotice(String(error)); }
  }
  const openFolder = async () => {
    const request = ++localSwitchRequest.current;
    try {
      const [folder] = await chooseWorkspaces();
      if (request !== localSwitchRequest.current || !folder) return;
      if (folder.error) { setNotice(`Could not open ${folder.name}: ${folder.error}`); return; }
      await launchFolder(folder.root);
    } catch (error) { setNotice(String(error)); }
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
      const original = current.current.folders.find(f => f.root === root);
      const refreshed = await openWorkspace(root, original?.expandedDirectories);
      setSyncFolder(old => old?.root === root ? {...old, ...refreshed} : old);
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
  uploads.configure({
    focusedFile: () => {
      const note = current.current;
      return note.hasDocument && note.workspace.cloudSpace && note.path
        ? { root: note.workspace.root, path: note.path } : null;
    },
    roots: foldersReady ? folders.filter(folder => !!folder.cloudSpace && folder.cloudSpace.account === drive.status.account && folder.root !== "demo" && !folder.error && !folder.syncError
      && (Object.values(folder.syncPolicy?.rules ?? {}).some(Boolean))).map(folder => folder.root) : [],
    protectedPaths: root => [...new Set([
      ...Array.from(paneSessions.current.values()).filter(s => s.workspace.root === root && s.dirty).map(s => s.path),
      ...(current.current.workspace.root === root && (dirtyRef.current || operation.current || !!saveInFlight.current || voiceBusy.current) ? [current.current.path] : []),
    ])],
    onComplete: async (root, changes) => {
      if (!changes.length) return;
      await refreshFolder(root);
      const before = current.current;
      updateTabs(tabsRef.current.map(tab => {
        const renamed = changes.find(change => change.previousPath === tab.path && change.path !== tab.path);
        if (tab.root !== root || !renamed || (before.workspace.root === root && before.path === tab.path && dirtyRef.current)) return tab;
        snapshots.current.delete(tabId(tab));
        renamePaneTab(tabId(tab), { ...tab, path: renamed.path });
        return {...tab, path: renamed.path};
      }));
      for (const change of changes) {
        const id = tabId({ root, path: change.path });
        const session = paneSessions.current.get(id);
        if (!session || session.dirty || (before.workspace.root === root && before.path === session.path)) continue;
        const note = await readNote(root, change.path);
        if (paneSessions.current.get(id) !== session || session.dirty || (current.current.workspace.root === root && current.current.path === session.path)) continue;
        savedDocuments.current.set(id, note);
        paneSessions.current.set(id, { ...session, data: note, preview: note.text, snapshot: undefined });
        updatePaneLayout({ ...paneLayoutRef.current });
      }
      const change = changes.find(change => change.previousPath === before.path);
      if (before.workspace.root !== root || !change || !before.hasDocument) return;
      if (dirtyRef.current || operation.current || saveInFlight.current || voiceBusy.current) {
        setNotice("Drive changes arrived while you were editing. Your draft is retained; review it before saving.");
        return;
      }
      const note = await readNote(root, change.path);
      if (current.current.workspace.root !== root || current.current.path !== before.path || dirtyRef.current || operation.current || saveInFlight.current) return;
      savedDocuments.current.set(tabId({ root, path: change.path }), note);
      setEditorSnapshot(undefined);
      revision.current = note.revision;
      setData(note); setPreview(note.text); applyMarks(note.bookmarks);
      if (change.path !== change.previousPath) {
        updateTabs(tabsRef.current.map(tab => tab.root === root && tab.path === change.previousPath ? {...tab, path: change.path} : tab));
        setPath(change.path);
        current.current = {...current.current, path: change.path};
      }
    },
  });
  const removeFolder = async (root: string) => {
    if (current.current.folders.some(folder => folder.root === root && !folder.cloudSpace)) await switchLocalFolder(null);
  };
  const loadDirectory = async (root: string, path: string, more = false) => {
    const folder = current.current.folders.find(folder => folder.root === root);
    if (!folder?.directories) return;
    const key = JSON.stringify([root, path]);
    if (directoryRequests.current.has(key)) return;
    const ticket = Symbol(); directoryRequests.current.set(key, ticket);
    setLoadingDirectories(old => ({ ...old, [root]: [...(old[root] ?? []), path] }));
    try {
      const listing = await listDirectory(root, path, more ? folder.directoryPages?.[path] ?? 0 : 0);
      if (directoryRequests.current.get(key) !== ticket) return;
      setFolders(old => old.map(f => f.root === root ? mergeDirectory(f, path, listing, more) : f));
    } catch (error) {
      if (directoryRequests.current.get(key) === ticket) setFolders(old => old.map(f => f.root === root ? { ...f, directoryErrors: { ...f.directoryErrors, [path]: String(error) } } : f));
    } finally {
      if (directoryRequests.current.get(key) === ticket) {
        directoryRequests.current.delete(key);
        setLoadingDirectories(old => ({ ...old, [root]: (old[root] ?? []).filter(p => p !== path) }));
      }
    }
  };
  const toggleDirectory = (root: string, path: string) => {
    const folder = current.current.folders.find(f => f.root === root);
    if (!folder) return;
    const expanded = folder.expandedDirectories ?? [];
    const opening = !expanded.includes(path);
    setFolders(old => old.map(f => f.root !== root ? f : { ...f, expandedDirectories: opening ? [...expanded, path] : expanded.filter(p => p !== path) }));
    if (opening) void loadDirectory(root, path);
  };
  const dropHandler = useRef<(paths: string[]) => void>(() => {});
  dropHandler.current = (paths) => {
    if (paths.length !== 1) { setNotice("Drop one folder to open it."); return; }
    const root = paths[0];
    void openRecent(recentsRef.current.find(recent => recent.root === root) ?? { root, name: root.split(/[\\/]/).at(-1) || root, tabs: [], active: null, mode: current.current.mode });
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
    refreshDirty();
    preserveDraft();
  };
  const transitionFocus = useFocusTransition(galaxyMode && !compact);
  const changeFocusMode = useCallback((focused: boolean) => transitionFocus(focused, () => {
    // Restore panels only when exiting the all-panels-collapsed state; explicit focus mode preserves their settings.
    if (!focused && !focusMode) {
      setNavigation(true);
      setRail(true);
      setTopBars(true);
      setStatusBar(true);
    }
    setFocusMode(focused);
  }), [transitionFocus, focusMode, setFocusMode, setNavigation, setRail, setTopBars, setStatusBar]);
  useEffect(() => {
    if (compact || syncFolder || settingsOpen || activeSettingId || palette || bookmarkDraft || renameTarget || fileAction) return;
    return installPanelShortcuts(window, mod === "⌘", panel => {
      if (focusMode) setFocusMode(false);
      if (panel === "left") setNavigation(focusMode || !navigation);
      else if (panel === "right") setRail(focusMode || !rail);
      else if (panel === "top") setTopBars(focusMode || !topBars);
      else changeTerminalOpen(focusMode || !(terminalOpen && statusBar));
    });
  }, [compact, syncFolder, settingsOpen, activeSettingId, palette, bookmarkDraft, renameTarget, fileAction, focusMode, navigation, rail, topBars, terminalOpen, statusBar, changeTerminalOpen, setFocusMode, setNavigation, setRail, setTopBars]);
  useEffect(() => {
    const toggleFocus = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "g" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && !syncFolder && !settingsOpen && !activeSettingId && !palette && !bookmarkDraft && !renameTarget && !fileAction) changeFocusMode(!focusModeActive);
    };
    window.addEventListener("keydown", toggleFocus, { capture: true });
    return () => window.removeEventListener("keydown", toggleFocus, { capture: true });
  }, [focusModeActive, changeFocusMode, syncFolder, settingsOpen, activeSettingId, palette, bookmarkDraft, renameTarget, fileAction]);
  useEffect(() => installFileSearchShortcut(window, mod === "⌘", () => {
    if (syncFolder || (mobile && !drive.status.connected) || settingsOpen || activeSettingId || bookmarkDraft || renameTarget || fileAction || document.querySelector("dialog[open]")) return;
    setSearchScope("everywhere");
    setPalette("Files");
  }), [syncFolder, drive.status.connected, settingsOpen, activeSettingId, bookmarkDraft, renameTarget, fileAction]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (syncFolder || settingsOpen || activeSettingId || palette || bookmarkDraft || renameTarget || fileAction || document.querySelector("dialog[open]") || (mobile && !drive.status.connected)) return;
      if (e.target instanceof Element && e.target.closest("#terminal-panel")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!mobile && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "o" && !e.isComposing) {
        e.preventDefault(); if (!e.repeat) void openFolder(); return;
      }
      if (!e.altKey && !e.shiftKey && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "t")) {
        e.preventDefault();
        if (e.repeat) return;
        if (mobile) { void newTab(); }
        else if (e.key.toLowerCase() === "n") {
          if (desktop) void invoke("new_window").catch(error => setNotice(String(error)));
          else {
            const url = new URL(window.location.href);
            url.searchParams.delete("folder");
            url.searchParams.set("new-window", "true");
            window.open(url.href, "_blank", "noopener");
          }
        } else if (!syncFolder && !settingsOpen && !activeSettingId && !palette && !bookmarkDraft && !renameTarget && !fileAction) void newTab();
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        if (!palette && !bookmarkDraft) { setActiveSettingId(null); setSettingsOpen(true); }
        return;
      }
      if (settingsOpen || activeSettingId || renameTarget || fileAction) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => p ? false : "All");
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
  }, [drive.status.connected, save, beginBookmark, syncFolder, settingsOpen, activeSettingId, palette, bookmarkDraft, renameTarget, fileAction, newTab]);
  useEffect(() => {
    const preserveSession = async () => {
      const c = current.current;
      if (!c.foldersReady) return;
      await saveExplorer({
        folders: c.folders.map(folderPreference),
        recents: recentsRef.current,
        active: c.hasDocument ? { root: c.workspace.root, path: c.path } : null,
        tabs: tabsRef.current, panes: paneLayoutRef.current, mode: c.mode,
      });
    };
    const preserve = async () => {
      try { await preserveSession(); return await preserveInactiveDrafts() && await preserveDraft(); }
      catch (error) { setNotice(`Unable to preserve your session: ${String(error)}`); return false; }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      // Native close/quit awaits the durable writes below. Browser recovery is synchronous.
      if (voiceBusy.current || draftFailed.current) { e.preventDefault(); e.returnValue = ""; }
      void preserveInactiveDrafts();
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
  useBackgroundBlur(galaxyMode, backgroundMode === "frosted", frostedPanes, {
    compact, mobileView, navigation, rail, focusMode, topBars, statusBar, terminalStarted,
    editorLayout: paneLeaves(paneLayout).map(pane => pane.id).join(","),
  }, setNotice);
  const switchMode = (next: EditorMode) => {
    capturePane();
    sharedViewMode.current = next;
    const visiblePanes = paneLeaves(paneLayoutRef.current).filter(pane => !compact || pane.id === activePaneRef.current);
    let storageFailed = false;
    for (const pane of visiblePanes) {
      const session = pane.selected ? paneSessions.current.get(pane.selected) : undefined;
      if (!session) continue;
      session.mode = paneMode(next, session.path);
      session.preview = paneEditors.current.get(pane.selected!)?.text() ?? session.data.text;
      try { saveFileMode(session.path, next); } catch { storageFailed = true; }
    }
    setPreview(editor.current?.text() ?? data?.text ?? "");
    setMode(paneMode(next, path));
    updatePaneLayout({ ...paneLayoutRef.current });
    if (storageFailed) setNotice("View mode changed, but could not be saved on this device.");
  };
  const visibleViews: PaneView[] = paneLeaves(paneLayout).filter(pane => !compact || pane.id === activePane).flatMap(pane => {
    if (pane.id === activePane) return data ? [{ path, mode, length: Math.max(data.text.length, editor.current?.text().length ?? 0) }] : [];
    const session = pane.selected ? paneSessions.current.get(pane.selected) : undefined;
    return session ? [{ path: session.path, mode: session.mode, length: session.data.text.length }] : [];
  });
  const toolbar = paneToolbar(visibleViews);
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(path);
  const toggleReadTask = (offset: number, checked: boolean) => {
    editor.current?.toggleTask(offset, checked);
    setPreview(editor.current?.text() ?? "");
  };
  useEffect(() => {
    if (!foldersReady) return;
    let cancelled = false;
    for (const pane of paneLeaves(paneLayout)) {
      const tab = tabs.find(t => tabId(t) === pane.selected);
      if (!tab || paneSessions.current.has(tabId(tab)) || (tab.root === workspace.root && tab.path === path)) continue;
      const folder = folders.find(f => f.root === tab.root);
      if (!folder) continue;
      void readRecoverableNote(tab.root, tab.path).then(({ note, recovered }) => {
        if (cancelled) return;
        paneSessions.current.set(tabId(tab), { workspace: folder, path: tab.path, data: note, dirty: recovered, mode: sharedViewMode.current ? paneMode(sharedViewMode.current, tab.path) : readFileMode(tab.path), cursor: [1, 1], preview: note.text });
        updatePaneLayout({ ...paneLayoutRef.current });
      }).catch(error => { if (!cancelled) setNotice(String(error)); });
    }
    return () => { cancelled = true; };
  }, [foldersReady, paneLayout, tabs, folders, workspace.root, path, updatePaneLayout]);
  if (mobile && (!drive.status.connected || (!cloud.loaded && !folders.some(folder => folder.cloudSpace?.account === drive.status.account && !!drive.status.account)))) {
    return <CloudSetup drive={drive} loading={cloud.loading} error={cloud.error} retry={()=>void cloud.refresh()}/>;
  }
  function renderPaneTabs(pane: Pane) { return (
          <div className="note-tabs" hidden={!compact && (!topBars || focusMode)} role="tablist" aria-label="Open notes" onPointerDownCapture={startEditorWindowDrag}>
            {(compact ? tabs.map(tabId) : pane.tabs).map(id => tabs.find(tab => tabId(tab) === id)).filter((tab): tab is NoteTab => !!tab).map((tab) => {
              const active =
                pane.selected === tabId(tab);
              const name = tab.path.split("/").at(-1);
              const tabFolder = folders.find(folder => folder.root === tab.root);
              const selectedForSync = !tabFolder?.syncError && syncIncluded(tabFolder?.syncPolicy, tab.path);
              const tabDirty = tabId(tab) === tabId({ root: workspace.root, path }) ? dirty : paneSessions.current.get(tabId(tab))?.dirty;
              const syncError = tabFolder?.syncError || cloud.error || uploads.errors[tab.root];
              const syncState = syncError ? "error"
                : !selectedForSync || (!tabDirty && uploads.items[`${tab.root}\n${tab.path}`]?.state === "local") ? "local"
                : uploads.transferringRoot === tab.root ? "syncing"
                : tabDirty || uploads.pending[tab.root] ? "pending"
                : uploads.completed[tab.root] ? "synced" : "pending";
              const syncStatus = { error: "Sync needs attention", local: "Local only", syncing: "Syncing…", pending: "Waiting to sync", synced: "Up to date" }[syncState];
              const lastSyncedAt = uploads.lastSyncedAt[tab.root];
              const syncDetails = [syncStatus, syncError, lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : "Not synced this session", `Connected as ${drive.status.email}`, "Click for sync settings and Google Drive"].filter(Boolean).join(" · ");
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
                  <TabButton
                    role="tab"
                    aria-selected={active}
                    tooltip={
                      (tabFolder?.cloudSpace ? `Cloud / ${tabFolder.name}` : tab.root) +
                      "/" +
                      tab.path +
                      (!tab.pinned
                        ? " · Preview — double-click to keep open"
                        : "")
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
                    {active && (tabId(tab) === tabId({ root: workspace.root, path }) ? dirty : paneSessions.current.get(tabId(tab))?.dirty) && <span className="dirty-dot" />}
                  </TabButton>
                  {drive.status.connected && tabFolder?.cloudSpace && <button className="tab-sync" data-selected={selectedForSync} data-state={syncState}
                    aria-label={`Sync settings for ${name}: ${syncStatus}`}
                    title={syncDetails}
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
            <button className="icon-button new-tab-button" onClick={() => { if (activatePane(pane.id)) void newTab(); }}
              aria-label="New tab" title="New tab (Ctrl T)" aria-keyshortcuts="Control+t"><Plus size={16} /></button>
          </div>
  ); }
  function renderPaneDocument(pane: Pane) {
    const isActive = pane.id === activePane;
    const session = pane.selected ? paneSessions.current.get(pane.selected) : undefined;
    const workspace = isActive ? current.current.workspace : session?.workspace ?? current.current.workspace;
    const path = isActive ? current.current.path : session?.path ?? "";
    const paneData = isActive ? data : session?.data ?? null;
    const paneMode = isActive ? mode : session?.mode ?? "source";
    const panePreview = isActive ? preview : session?.preview ?? "";
    const paneSnapshot = isActive ? editorSnapshot : session?.snapshot;
    const paneLoading = isActive && loading;
    return renderContent(paneData, paneMode, panePreview);
    function renderContent(data: DocumentData | null, mode: EditorMode, preview: string) {
      const loading = paneLoading;
      const editorSnapshot = paneSnapshot;
      const bookmarks = isActive ? marksRef.current : session?.data.bookmarks ?? [];
      const isMarkdown = /\.(md|markdown|mdx)$/i.test(path);
      const documentView = isMarkdown && !(mode === "read" && readingLayout === "pages") && supportsDocumentView(data?.text.length ?? 0, editorSnapshot?.state.doc.length ?? 0, preview.length);
      return (
        <div className="document-area">
          {loading && <div className="loading">Opening your note…</div>}
          {data && (
            <div className={"write-pane " + (mode === "read" && !documentView ? "hidden" : "")}>
              <Editor
                key={JSON.stringify([workspace.root, path, data.revision])}
                ref={handle => {
                  const id = tabId({ root: workspace.root, path });
                  if (handle) paneEditors.current.set(id, handle); else paneEditors.current.delete(id);
                  if (pane.id === activePaneRef.current) editor.current = handle;
                }}
                initial={data.text}
                snapshot={editorSnapshot}
                bookmarks={bookmarks}
                onChange={() => { if (activatePane(pane.id)) changed(); }}
                onBookmarks={(marks) => { if (activatePane(pane.id)) { applyMarks(marks); refreshDirty(); void preserveDraft(); } }}
                onParagraphStyle={style => { if (isActive) setParagraphStyle(style); }}
                onFormatting={formats => { if (isActive) setActiveFormats(formats); }}
                onCursor={(line, col) => { if (isActive) setCursor([line, col]); }}
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
            <div className="read-pane" ref={isActive ? attachPreview : undefined}>
              <div className="start-mark" aria-hidden="true"><GalaxyMark circled /></div>
              <article className="prose">
                <div className="document-eyebrow">
                  {isMarkdown ? "A NOTE IN YOUR SPACE" : "PLAIN & SIMPLE"}
                </div>
                <FileTitle key={path} path={path} onRename={name => renameFile(workspace, path, name)} />
                <Suspense fallback={<p>Rendering your note…</p>}>
                  {readingLayout === "pages" || preview.length > RICH_DOCUMENT_LIMIT ? (
                    <LargeRead bookmarks={bookmarks} layout={readingLayout} ref={isActive ? largeRead : undefined} text={preview} markdown={isMarkdown} controlsContainer={isActive ? readControls : null} onToggleTask={toggleReadTask} />
                  ) : isMarkdown ? (
                    <Markdown bookmarks={bookmarks} text={preview} onToggleTask={toggleReadTask} />
                  ) : (
                    <pre className="plain-preview">
                      {preview.split("\n").map((line, i) => (
                        <div data-line={i + 1} key={i} className={bookmarks.some(mark => !mark.unresolved && mark.to > mark.from && mark.line === i + 1) ? "document-bookmarked" : undefined}>
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
              <h2>{mobile ? "A little space to think." : workspace.root ? workspace.name : "A folder is all you need."}</h2>
              <p>{mobile ? "Create your first Cloud note. Edits save and sync automatically." : workspace.root ? "Choose a file in the explorer, or search this folder." : "Open a folder with Markdown or text files."}</p>
              <button className="primary" onClick={mobile ? () => void newTab() : openFolder}>
                {mobile ? "Create a note" : "Open folder"}
              </button>
            </div>
          )}
        </div>
      );
    }
  }
  const settingCommands = [
    { id: "open-settings", label: "Open settings", description: "All app preferences, including the default file extension", keywords: "preferences default file extension", run: () => setSettingsOpen(true) },
    toggleSetting("galaxy", "Galaxy mode", galaxyMode, setGalaxyMode, "appearance glow"),
    ...settingChoices("galaxy-performance", "Galaxy performance", galaxyPerformance, galaxyPerformanceModes, setGalaxyPerformance, galaxyPerformanceLabels, "appearance animation motion battery energy fps"),
    ...settingChoices("background", "Background", backgroundMode, availableBackgroundModes, setBackgroundMode, backgroundLabels, "appearance translucency transparency opaque galaxy"),
    ...(supportsFrosted ? [toggleSetting("frosted-panes", "Frosted panels", frostedPanes, setFrostedPanes, "appearance blur translucency")] : []),
    ...settingChoices("font", "Font", editorFont, editorFonts, setEditorFont, { "dm-sans": "DM Sans", lora: "Lora", mono: "Monospace" }, "typography typeface"),
    ...settingChoices("text-size", "Text size", fontSize, textSizes, setFontSize, undefined, "font size typography"),
    ...settingChoices("text-width", "Text width", textWidth, textWidths, setTextWidth, { full: "Full width" }, "editor width"),
    ...settingChoices("line-spacing", "Line spacing", lineSpacing, lineSpacings, setLineSpacing, undefined, "line height typography"),
    ...settingChoices("reading-layout", "Reading layout", readingLayout, ["continuous", "pages"] as const, setReadingLayout),
    toggleSetting("line-numbers", "Line numbers", showLineNumbers, setShowLineNumbers, "numbering gutter"),
    toggleSetting("line-highlight", "Line highlight", showLineHighlight, setShowLineHighlight, "current line"),
    toggleSetting("word-wrap", "Word wrap", wordWrap, setWordWrap, "long lines"),
    toggleSetting("spellcheck", "Spellcheck", spellcheck, setSpellcheck, "spelling"),
    toggleSetting("bookmarks-panel", "Bookmarks panel", rail, setRail, "sidebar"),
    ...(!compact ? [
      toggleSetting("navigation-panel", "Navigation panel", navigation, setNavigation, "sidebar files"),
      toggleSetting("top-bars", "Top bars", topBars, setTopBars, "toolbar tabs"),
      toggleSetting("status-bar", "Status bar", statusBar, setStatusBar),
      toggleSetting("focus-mode", "Focus mode", focusMode, setFocusMode),
    ] : []),
  ];
  const activeSetting = settingCommands.find(command => command.id === activeSettingId)?.configuration;
  return (
    <div className="app-shell" data-compact={compact} data-mobile={mobile} data-mobile-view={mobileView} data-top-bars={compact || topBars} data-focus-mode={!compact && focusMode} data-window-focused={windowFocused} data-galaxy={galaxyMode} data-background={supportsTranslucency ? backgroundMode : "off"} data-frosted-panes={supportsFrosted && frostedPanes} data-editor-size={fontSize} data-editor-font={editorFont} data-text-width={textWidth} data-line-spacing={lineSpacing}
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
      {!compact && focusModeActive && (
        <button className="sidebar-action focus-toggle focus-mode-exit" aria-label="Exit focus mode" aria-pressed={true}
          aria-describedby="exit-focus-tooltip" aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+G`} onClick={() => changeFocusMode(false)}>
          <BlackHoleIcon />
          <span className="focus-tooltip" id="exit-focus-tooltip" role="tooltip">
            <span>Exit focus mode</span><span className="focus-tooltip-keys"><kbd>{mod}</kbd><kbd>G</kbd></span>
          </span>
        </button>
      )}
      {galaxyMode && <PlasmaEffects performanceMode={galaxyPerformance} active={!compact && windowFocused} dirty={dirty} lineHighlight={showLineHighlight} />}
      {compact && <nav className="mobile-navigation" aria-label="Main navigation">
        <button aria-label="Your notes" aria-pressed={mobileView === "notes"} onClick={() => setMobileView("notes")}><FolderOpen size={20} /><span>Notes</span></button>
        <button aria-label="Write note" aria-pressed={mobileView === "editor"} onClick={() => setMobileView("editor")}><Pencil size={20} /><span>Write</span></button>
        <button aria-label="Your bookmarks" aria-pressed={mobileView === "bookmarks"} onClick={() => setMobileView("bookmarks")}><BookmarkIcon size={20} /><span>Bookmarks</span></button>
        <button aria-label="Search notes" onClick={() => setPalette("All")}><Search size={20} /><span>Search</span></button>
        <button aria-label="Mobile settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={20} /><span>Settings</span></button>
      </nav>}
      <aside id="global-navigation" className="sidebar" hidden={compact ? mobileView !== "notes" : !navigation}>
        <SidebarSection edge="top" label="navigation header" compact={compact}>
        {headerToggle => <>
        <div className="brand">
          {headerToggle}
          <span>
            nova<span className="brand-period">.</span>
          </span>
          <button className="galaxy-toggle" aria-label="Galaxy mode" aria-pressed={galaxyMode}
            title={galaxyMode ? "Galaxy mode on · Click to turn off" : "Galaxy mode off · Click to turn on"}
            onClick={toggleGalaxy}>
            <GalaxyMark className="galaxy-symbol" />
          </button>
        </div>
        <button className="search-trigger" onClick={() => setPalette("All")}>
          <Search size={16} />
          <span>Find anything</span>
          <kbd>{mod} K</kbd>
        </button>
        </>}
        </SidebarSection>
        <Explorer
          folders={folders.filter(folder => !folder.cloudSpace || (drive.status.connected && folder.cloudSpace.account === drive.status.account))}
          activeRoot={workspace.root}
          activePath={path}
          onOpen={(folder, path, pinned = false) => {
            void openNote(path, undefined, folder, undefined, pinned);
          }}
          onFileAction={(folder, path, action) => {
            if (action === "reveal") void revealNote(folder.root, path).catch(error => setNotice(String(error)));
            else if (action === "drive") void driveTransfer(() => invoke("drive_open_file", { root: folder.root, path })).catch(error => setNotice(String(error)));
            else setFileAction({ folder, path, action });
          }}
          onSync={drive.status.connected ? folder => showSync(folder) : undefined}
          onNew={folder => void newTab(folder)}
          onCloudMove={drive.status.connected ? (folder, path) => void moveToCloud(folder, path) : undefined}
          syncBusy={!!uploads.activeRoot}
          onRename={(folder, path) => setRenameTarget({ folder, path })}
          onChange={changeFolders}
          onRemove={(root) => void removeFolder(root)}
          onRefresh={(root) => void refreshFolder(root)}
          onAdd={() => void openFolder()}
          recents={recents} onRecent={recent => void openRecent(recent)} onForgetRecents={() => updateRecents([])}
          onLoadDirectory={(root, path, more) => void loadDirectory(root, path, more)} onToggleDirectory={toggleDirectory} loadingDirectories={loadingDirectories}
          externalDrag={externalDrag}
        />
        <SidebarSection edge="bottom" label="navigation controls" compact={compact}
          cornerControls={galaxyMode && <>
            {!mobile && <SidebarAppearance background={backgroundMode} backgrounds={availableBackgroundModes} labels={backgroundLabels}
              onBackground={setBackgroundMode} frosted={frostedPanes} onFrosted={setFrostedPanes} supportsFrosted={supportsFrosted} />}
            <SignalBell />
          </>}>
        <div className="sidebar-bottom">
          {galaxyMode && <div className="launch-indicator">
            <span aria-hidden="true" />
            {launchMessage}
          </div>}
          {mobile && <p>Cloud notes save and sync automatically.</p>}
          <div className="sidebar-actions">
            <button className="sidebar-action" hidden={mobile} aria-label="Open Folder" aria-describedby="add-folders-tip" onClick={openFolder}>
              <Plus size={17} aria-hidden="true" />
              <span className="focus-tooltip" id="add-folders-tip" role="tooltip">Open Folder in New Window…</span>
            </button>
            <button className="sidebar-action" aria-label="Settings" aria-describedby="settings-button-tip"
              aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={17} aria-hidden="true" />
              <span className="focus-tooltip" id="settings-button-tip" role="tooltip"><span>Settings</span><span className="focus-tooltip-keys"><kbd>{mod}</kbd><kbd>,</kbd></span></span>
            </button>
            <button className="sidebar-action" aria-label={drive.status.connected ? "Sync settings" : "Set up sync"}
              aria-describedby="cloud-button-tip"
              aria-haspopup="dialog" onClick={() => showSync(workspace)}>
              <Cloud size={17} aria-hidden="true" />
              <span className="focus-tooltip" id="cloud-button-tip" role="tooltip">{drive.status.connected ? "Cloud" : "Set up Cloud"}</span>
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
        </SidebarSection>
      </aside>
      <main ref={tabStripRef} className="main-panel" hidden={compact && mobileView !== "editor"}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const top = event.currentTarget.querySelector(".top-bars-container")!.getBoundingClientRect();
          setHoveredTop(topBars
            ? Math.abs(event.clientY - top.bottom) <= 12
            : event.clientY >= bounds.top && event.clientY <= bounds.top + 48);
          const bottomPanel = event.currentTarget.querySelector(".terminal-panel");
          const bottomEdge = bottomPanel?.getBoundingClientRect().top ?? bounds.bottom;
          setHoveredBottom(Math.abs(event.clientY - bottomEdge) <= 32);
        }}
        onPointerLeave={() => { setHoveredTop(false); setHoveredBottom(false); }}>
        <div className="top-bars-container">
        <div id="top-bars" className="top-bars" hidden={!compact && !topBars} onPointerDownCapture={startEditorWindowDrag}>
        <div className="document-toolbar">
          <div className="breadcrumbs">
            <span>{workspace.name}</span>
            <ChevronRight size={13} />
            <span className="breadcrumb-file">{path.split("/").at(-1)}</span>
            <button className="icon-button breadcrumb-star" aria-label={activeFileStarred ? "Unstar file" : "Star file"}
              title={activeFileStarred ? "Remove file from starred files" : "Star file for quick access in Bookmarks"}
              aria-pressed={activeFileStarred} disabled={!data || !path || !activeStarFolder}
              onClick={() => { if (activeStarFolder) starFile(activeStarFolder, path, !activeFileStarred); }}>
              <NovaStar size={16} />
            </button>
          </div>
          <ViewOptions>
            <label className="view-option-row"><span>Reading layout</span><select aria-label="Reading layout" value={readingLayout} onChange={event => setReadingLayout(event.target.value as "continuous" | "pages")}>
              <option value="continuous">Continuous</option><option value="pages">Pages</option>
            </select></label>
          <label className="view-option-row"><span>Font</span><FontControl value={editorFont} onChange={setEditorFont} /></label>
          <label className="view-option-row"><span>Text size</span><TextSizeControl value={fontSize} onChange={setFontSize} /></label>
          <label className="view-option-row"><span>Text width</span><TextWidthControl value={textWidth} onChange={setTextWidth} /></label>
          <label className="view-option-row"><span>Line spacing</span><LineSpacingControl value={lineSpacing} onChange={setLineSpacing} /></label>
          {!mobile && <button
            className="icon-button toolbar-icon"
            aria-label="Open in File Location"
            title={workspace.root === "demo" ? "Sample notes have no file location" : "Open in File Location"}
            disabled={!desktop || !workspace.root || workspace.root === "demo" || !path}
            onClick={() => void revealNote(workspace.root, path).catch(error => setNotice(String(error)))}
          >
            <FolderOpen size={17} aria-hidden="true" />
          </button>}
          {toolbar.hasLineNumbers && (
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
          </ViewOptions>
          {galaxyMode && <button
            className="icon-button toolbar-icon focus-toggle transparency-control"
            aria-label={`Background: ${backgroundLabels[backgroundMode]}. Switch to ${backgroundLabels[nextBackgroundMode]}`}
            aria-describedby="translucency-tooltip"
            onClick={() => setBackgroundMode(nextBackgroundMode)}
          >
            <Blend size={17} aria-hidden="true" />
            <span className="focus-tooltip" id="translucency-tooltip" role="tooltip">
              Background · {backgroundLabels[backgroundMode]}<br />
              Click for {backgroundLabels[nextBackgroundMode].toLowerCase()}
            </span>
          </button>}
          {galaxyMode && supportsFrosted && <button
            className="icon-button toolbar-icon focus-toggle transparency-control"
            aria-label="Frosted panels"
            aria-pressed={frostedPanes}
            aria-describedby="pane-background-tooltip"
            onClick={() => setFrostedPanes(!frostedPanes)}
          >
            <PanelsTopLeft size={17} aria-hidden="true" />
            <span className="focus-tooltip" id="pane-background-tooltip" role="tooltip">
              Panels · {frostedPanes ? "Frosted" : "Black"}<br />
              Click for {frostedPanes ? "black" : "frosted"}
            </span>
          </button>}
          {!compact && <button className="icon-button toolbar-icon" onClick={toggleTerminal}
            aria-label={terminalOpen && statusBar ? "Collapse terminal" : "Open terminal"} title={`Toggle terminal (${mod}↓)`} aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+ArrowDown`}
            aria-expanded={terminalOpen && statusBar} aria-controls="terminal-panel"><TerminalSquare size={17} /></button>}
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
            {toolbar.hasMarkdown && (
              <button
                onClick={() => switchMode("source")}
                className={toolbar.source ? "selected" : ""}
                aria-label="Source"
                aria-pressed={toolbar.source}
                title="Show source in all panes"
              >
                <Code2 size={14} />
              </button>
            )}
            <button
              onClick={() => switchMode("edit")}
              className={toolbar.edit ? "selected" : ""}
              aria-label="Edit"
              aria-pressed={toolbar.edit}
              title="Edit all panes · Formatted Markdown and plain text"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => switchMode("read")}
              className={toolbar.read ? "selected" : ""}
              aria-label="Read"
              aria-pressed={toolbar.read}
              title="Read all panes"
            >
              <BookOpen size={14} />
            </button>
          </div>
          <button
            hidden={!!workspace.cloudSpace}
            className="icon-button"
            data-unsaved={dirty}
            aria-label="Save note"
            title={`Save (${mod} S)`}
            onClick={() => void save()}
          >
            <Save size={15} />
          </button>
        </div>
        <div className="read-controls" ref={setReadControls} />
        {toolbar.hasFormatting && (
          <FormatToolbar formattingDisabled={!data || !isMarkdown || mode === "read"} disabled={!data || mode === "read"}
            active={isMarkdown ? activeFormats : []} style={isMarkdown ? paragraphStyle : "paragraph"} onFormat={(style) => editor.current?.format(style)}
            onUndo={() => editor.current?.undo()} onRedo={() => editor.current?.redo()} />
        )}
        </div>
        <div className="panel-toggle-zone panel-toggle-top" data-expanded={topBars} data-edge-hover={hoveredTop}>
          <button className="panel-toggle" aria-label={topBars ? "Collapse top bars" : "Expand top bars"}
            aria-describedby="top-bars-tooltip" aria-keyshortcuts={`${mod === "⌘" ? "Meta" : "Control"}+ArrowUp`} aria-expanded={topBars} aria-controls="top-bars"
            onClick={() => setTopBars(!topBars)}>
            {topBars ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="focus-tooltip" id="top-bars-tooltip" role="tooltip">
              <span>{topBars ? "Collapse" : "Expand"} top bars</span>
              <span className="focus-tooltip-keys"><kbd>{mod}</kbd><kbd>↑</kbd></span>
            </span>
          </button>
        </div>
        </div>
        {data && mode === "read" && <ReadFind
          key={JSON.stringify([workspace.root, path, data.revision])}
          text={preview}
          disabled={!!(syncFolder || settingsOpen || activeSettingId || palette || bookmarkDraft || renameTarget || fileAction)}
          onJump={jump}
        />}
        <EditorPanes layout={paneLayout} active={activePane} compact={compact}
          onActivate={activatePane} renderTabs={renderPaneTabs} renderDocument={renderPaneDocument}
          onResize={(id, ratio) => updatePaneLayout(mapPane(paneLayoutRef.current, id, node => node.kind === "split" ? { ...node, ratio } : node))} />
        {!mobile && <TerminalPanel hoveredEdge={hoveredBottom} started={terminalStarted} open={terminalOpen && statusBar} root={workspace.root} controlsContainer={terminalControls}
          bottomPanelOpen={statusBar} onBottomPanelOpenChange={setStatusBar}
          onOpenChange={changeTerminalOpen} onStorageError={() => setNotice("Terminal height changed, but could not be saved on this device.")} />}
        <div className="status-bar-container">
        <footer id="status-bar" className="status-bar" hidden={!statusBar}>
          <span>
            <span className="status-dot" />
            {saving
              ? "Saving…"
              : dirty
                ? workspace.cloudSpace ? "Saving on this device…" : draftStatus === "saving" ? "Saving draft…" : draftStatus === "error" ? "Draft not saved" : "Draft saved · Unsaved to file"
                : workspace.cloudSpace ? uploads.errors[workspace.root] ? "Saved on this device · Sync needs attention" : uploads.items[`${workspace.root}\n${path}`]?.state === "local" ? "Saved on this device · Edit or rename to sync" : uploads.transferringRoot === workspace.root ? "Syncing…" : uploads.completed[workspace.root] ? "Up to date" : "Saved on this device · Waiting to sync" : "All changes saved"}
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
            <div className="scope-toggle bookmark-view-toggle" role="group" aria-label="Bookmark view">
              <button aria-label="Starred files" title="Starred files" aria-pressed={bookmarkView === "files"} onClick={() => setBookmarkView("files")}>
                <NovaStar size={17} />
              </button>
              <button aria-label="Passages" title="Passages" aria-pressed={bookmarkView === "passages"} onClick={() => setBookmarkView("passages")}>
                <BookmarkIcon size={17} aria-hidden="true" />
              </button>
            </div>
            {bookmarkView === "passages" && <button
              className="icon-button"
              onClick={beginBookmark}
              title={`Add bookmark (${mod} Shift B)`}
              aria-label="Add bookmark"
            >
              <Plus size={17} />
            </button>}
          </header>
          {bookmarkView === "files" ? <StarredFiles folders={folders} activeRoot={workspace.root} activePath={path}
            onOpen={(folder, file, pinned) => void openNote(file, undefined, folder, undefined, pinned)} onStar={starFile} /> : <>
          <ScopeToggle label="Bookmark scope" scope={bookmarkScope} onChange={setBookmarkScope} currentLabel="Current tab" allLabel="All bookmarks" />
          <div className="rail-intro">{bookmarkScope === "current" ? "Your way back to the good parts." : "Across all added folders."}</div>
          {bookmarkScope === "everywhere" && bookmarksBusy && <div role="status" className="rail-intro">Loading bookmarks…</div>}
          {bookmarkScope === "everywhere" && bookmarksError && <div role="status" className="rail-intro">{bookmarksError}</div>}
          <div className="bookmark-list">
            <BookmarkSections view="passages" items={visibleBookmarks}
              isCloud={hit => !!folders.find(folder => folder.root === hit.root)?.cloudSpace}
              emptyMessage={bookmarksBusy ? "Loading bookmarks…" : bookmarkScope === "current" ? "No passages bookmarked here in the current tab." : "No passages bookmarked here yet."}
              renderItem={({ bookmark: b, root, path: bookmarkPath }, i) => {
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
                    <span className="waypoint-id"><i aria-hidden="true" />{String(i + 1).padStart(2, "0")}</span>
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
            ); }} />
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
          <footer className="rail-footer">
            <kbd>{mod}</kbd>
            <kbd>⇧</kbd>
            <kbd>B</kbd>
            <span>to bookmark</span>
          </footer>
          </>}
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
          key={palette}
          initialFilter={palette}
          folders={folders}
          commands={settingCommands.map(command => command.configuration
            ? { ...command, run: () => setActiveSettingId(command.id) }
            : command)}
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
      {syncFolder && <SyncSettings cloudLoading={cloud.loading} cloudError={cloud.error} onRefreshCloud={()=>void cloud.refresh()} onRestored={async root => { const restored = await openWorkspace(root); await acceptFolders([restored]); setSyncFolder(restored); setSyncPath(undefined); }} uploads={uploads} onUpload={async () => { if (await save()) await uploads.upload(syncFolder.root); }} drive={drive} key={syncFolder.root} folder={syncFolder} folders={folders} initialPath={syncPath} onFolderChange={folder => showSync(folder)} onClose={() => setSyncFolder(null)}
        onSaved={policy => { setFolders(old => old.map(folder => folder.root === syncFolder.root ? { ...folder, syncPolicy: policy, syncError: undefined } : folder)); setWorkspace(old => old.root === syncFolder.root ? { ...old, syncPolicy: policy } : old); uploads.schedule(syncFolder.root); }} />}
      {renameTarget && (
        <RenameDialog
          path={renameTarget.path}
          root={renameTarget.folder.root === "demo" ? renameTarget.folder.name : renameTarget.folder.root}
          onRename={name => renameFile(renameTarget.folder, renameTarget.path, name)}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {activeSetting && <SettingDialog configuration={activeSetting}
        onClose={() => setActiveSettingId(null)}
        onOpenSettings={() => { setActiveSettingId(null); setSettingsOpen(true); }}
        storageError={editorFontError || spacingError || widthError || galaxyError || galaxyPerformanceError || translucencyError || frostedPanesError || numbersError || highlightError || wrapError || spellingError || fontError || railError || navigationError || topBarsError || statusBarError || focusModeError} />}
      {settingsOpen && <Settings onResetLocal={mobile ? resetLocalState : undefined} resetDisabled={!drive.status.connected || drive.busy || !!uploads.activeRoot || cloud.loading || saving} updater={desktop ? appUpdate : undefined} syncConnected={drive.status.connected} onSyncSetup={() => { setSettingsOpen(false); showSync(workspace); }} onClose={() => setSettingsOpen(false)}
        onOpenDrive={() => void uploads.openFolder(workspace.root)} openDriveDisabled={!!uploads.activeRoot || workspace.root === "demo"}
        galaxy={galaxyMode} onGalaxy={setGalaxyMode}
        tooltips={showTooltips} onTooltips={setShowTooltips}
        galaxyPerformance={galaxyPerformance} onGalaxyPerformance={setGalaxyPerformance}
        lineHighlight={showLineHighlight} onLineHighlight={setShowLineHighlight}
        lineNumbers={showLineNumbers} onLineNumbers={setShowLineNumbers} wordWrap={wordWrap} onWordWrap={setWordWrap}
        spellcheck={spellcheck} onSpellcheck={setSpellcheck} bookmarks={rail} onBookmarks={setRail}
        defaultExtension={defaultExtension} onDefaultExtension={setDefaultExtension}
        fontSize={fontSize} onFontSize={setFontSize}
        editorFont={editorFont} onEditorFont={setEditorFont}
        textWidth={textWidth} onTextWidth={setTextWidth}
        lineSpacing={lineSpacing} onLineSpacing={setLineSpacing}
        storageError={tooltipsError || editorFontError || extensionError || spacingError || widthError || galaxyError || galaxyPerformanceError || translucencyError || frostedPanesError || numbersError || highlightError || wrapError || spellingError || fontError || railError || navigationError || topBarsError || statusBarError || focusModeError} />}
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
