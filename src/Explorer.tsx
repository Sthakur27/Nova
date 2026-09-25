import { usePreference } from "./preferences";
import { mobile } from "./platform";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  Eye,
  EyeOff,
  Cloud,
  CloudOff,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Pencil,
  MoreHorizontal,
  RefreshCw,
  X,
} from "lucide-react";
import { syncIncluded, type SyncPolicy } from "./syncPolicy";
import type { Workspace } from "./model";
import RecentFolders from "./RecentFolders";
import type { RecentFolder } from "./localFolders";
import { revealFile, fileAncestors } from "./revealFile";
import { closedDirectories } from "./folders";
function FileTree({
  paths,
  directories = [], directoryPages = {}, directoryErrors = {}, loadingDirectories = [], onLoadDirectory,
  active,
  onOpen,
  onRename,
  onContextMenu,
  syncPolicy, syncDisabled, onToggleSync,
  prefix = "",
  closed,
  onToggle,
}: {
  paths: string[];
  directories?: string[];
  directoryPages?: Record<string, number>;
  directoryErrors?: Record<string, string>;
  loadingDirectories?: string[];
  onLoadDirectory?: (path: string, more?: boolean) => void;
  active: string;
  onOpen: (path: string, pinned?: boolean) => void;
  onRename: (path: string) => void;
  onContextMenu: (event: MouseEvent, path: string) => void;
  syncPolicy?: SyncPolicy;
  syncDisabled: boolean;
  onToggleSync?: (path: string) => void;
  prefix?: string;
  closed: Set<string>;
  onToggle: (path: string) => void;
}) {
  const groups = new Map<string, string[]>(),
    files: string[] = [];
  for (const path of paths) {
    const rest = path.slice(prefix.length),
      slash = rest.indexOf("/");
    if (slash < 0) files.push(path);
    else {
      const name = rest.slice(0, slash);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(path);
    }
  }
  for (const directory of directories) {
    if (!directory.startsWith(prefix)) continue;
    const rest = directory.slice(prefix.length);
    if (rest && !rest.includes("/") && !groups.has(rest)) groups.set(rest, []);
  }
  const directoryPath = prefix.replace(/\/$/, "");
  const loading = loadingDirectories.includes(directoryPath);
  return (
    <>
      {[...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, children]) => (
          <div key={name}>
            <button
              className="tree-row folder-row"
              aria-expanded={!closed.has(prefix + name)}
              onClick={() => onToggle(prefix + name)}
            >
              {closed.has(prefix + name) ? (
                <ChevronRight size={13} />
              ) : (
                <ChevronDown size={13} />
              )}
              <Folder size={14} />
              <span>{name}</span>
            </button>
            {!closed.has(prefix + name) && (
              <div className="tree-children">
                <FileTree
                  closed={closed}
                  onToggle={onToggle}
                  paths={children}
                  directories={directories} directoryPages={directoryPages} directoryErrors={directoryErrors} loadingDirectories={loadingDirectories} onLoadDirectory={onLoadDirectory}
                  active={active}
                  onOpen={onOpen}
                  onRename={onRename}
                  onContextMenu={onContextMenu}
                  syncPolicy={syncPolicy} syncDisabled={syncDisabled} onToggleSync={onToggleSync}
                  prefix={prefix + name + "/"}
                />
              </div>
            )}
          </div>
        ))}
      {files.sort().map((path) => (
        <div key={path} onContextMenu={event => { if (path === ".nova") event.preventDefault(); else onContextMenu(event, path); }} className={"tree-row file-row " + (path === active ? "active" : "")}>
          <button
            className="file-open"
            title={path}
            onClick={event => { if (event.detail <= 1) onOpen(path); }}
            onDoubleClick={() => onOpen(path, true)}
          >
            <FileText size={14} />
            <span>{path.slice(prefix.length)}</span>
            {path === active && <span className="active-dot" />}
          </button>
          {onToggleSync && path !== ".nova" && <button className="icon-button file-sync"
            aria-label={`${syncIncluded(syncPolicy, path) ? "Exclude from" : "Include in"} sync: ${path}`}
            aria-pressed={syncIncluded(syncPolicy, path)} disabled={syncDisabled}
            title={syncDisabled ? "Sync selection unavailable" : syncIncluded(syncPolicy, path) ? "Selected for sync · Click to keep local" : "Keep local · Click to include in sync"}
            onClick={() => onToggleSync(path)}>
            {syncIncluded(syncPolicy, path) ? <Cloud size={14} /> : <CloudOff size={14} />}
          </button>}
          {path !== ".nova" && <button
            className="icon-button file-edit"
            aria-label={mobile ? `Actions for ${path}` : `Rename ${path}`}
            title={mobile ? "Note actions" : "Rename file"}
            onClick={event => mobile ? onContextMenu(event, path) : onRename(path)}
          >
            {mobile ? <MoreHorizontal size={18} /> : <Pencil size={14} />}
          </button>}
        </div>
      ))}
      {loading && <p className="folder-empty" role="status">Loading…</p>}
      {directoryErrors[directoryPath] && <div className="folder-error"><span>{directoryErrors[directoryPath]}</span><button disabled={loading} onClick={() => onLoadDirectory?.(directoryPath)}>Retry</button></div>}
      {directoryPages[directoryPath] !== undefined && !directoryErrors[directoryPath] && <button className="tree-load-more" disabled={loading} onClick={() => onLoadDirectory?.(directoryPath, true)}>Load more</button>}
    </>
  );
}
type Props = {
  folders: Workspace[];
  showHidden?: boolean;
  onShowHidden?: (value: boolean) => void;
  recents?: RecentFolder[];
  onRecent?: (folder: RecentFolder) => void;
  onForgetRecents?: () => void;
  onLoadDirectory?: (root: string, path: string, more?: boolean) => void;
  onToggleDirectory?: (root: string, path: string) => void;
  loadingDirectories?: Record<string, string[]>;
  activeRoot: string;
  activePath: string;
  onOpen: (folder: Workspace, path: string, pinned?: boolean) => void;
  onRename: (folder: Workspace, path: string) => void;
  onFileAction: (folder: Workspace, path: string, action: "move" | "delete" | "reveal" | "drive") => void;
  onChange: (folders: Workspace[]) => void;
  onRemove: (root: string) => void;
  onRefresh: (root: string) => void;
  onNew?: (folder: Workspace) => void;
  onCloudMove?: (folder: Workspace, path: string) => void;
  onSync?: (folder: Workspace) => void;
  onToggleSync?: (folder: Workspace, path: string) => void;
  syncBusy?: boolean;
  onAdd: () => void;
  externalDrag: boolean;
};
export default function Explorer({
  folders,
  recents = [], onRecent, onForgetRecents, onLoadDirectory, onToggleDirectory, loadingDirectories = {},
  activeRoot,
  activePath,
  onOpen,
  onRename,
  showHidden = false, onShowHidden,
  onChange,
  onFileAction,
  onRemove,
  onRefresh,
  onAdd,
  onSync, onCloudMove, onNew,
  onToggleSync, syncBusy = false,
  externalDrag,
}: Props) {
  const treeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      tree.classList.add("is-scrolling");
      clearTimeout(timeout);
      timeout = setTimeout(() => tree.classList.remove("is-scrolling"), 1000);
    };
    tree.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timeout);
      tree.removeEventListener("scroll", onScroll);
      tree.classList.remove("is-scrolling");
    };
  }, []);
  const [menu, setMenu] = useState<{ folder: Workspace; path: string; x: number; y: number; trigger: HTMLElement } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => setMenu(null);
    const outside = (event: globalThis.PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) close(); };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("resize", close); window.removeEventListener("blur", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);
  const [cloudCollapsed, setCloudCollapsed] = usePreference<boolean>("explorer-cloud-collapsed", false);
  const [syncOnly, setSyncOnly] = useState(false);
  const revealed = useRef("");
  const pendingScroll = useRef(false);
  useEffect(() => {
    const identity = JSON.stringify([activeRoot, activePath]);
    if (!activePath) { revealed.current = ""; return; }
    if (revealed.current === identity) return;
    const folder = folders.find(folder => folder.root === activeRoot);
    if (!folder) return;
    revealed.current = identity;
    pendingScroll.current = true;
    setSyncOnly(false);
    if (folder.cloudSpace) setCloudCollapsed(false);
    onChange(folders.map(item => item.root === activeRoot ? revealFile(item, activePath) : item));
    if (folder.directories) {
      for (const directory of fileAncestors(activePath)) {
        if (!folder.expandedDirectories?.includes(directory)) onLoadDirectory?.(activeRoot, directory);
      }
    }
  }, [activeRoot, activePath, folders, onChange, onLoadDirectory, setCloudCollapsed]);
  useEffect(() => {
    if (!pendingScroll.current) return;
    const row = treeRef.current?.querySelector<HTMLElement>(".file-row.active");
    if (!row || row.closest("[hidden]")) return;
    row.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    pendingScroll.current = false;
  }, [activeRoot, activePath, folders, cloudCollapsed, syncOnly]);

  return (
    <>
      <div className="workspace-label">
        <span>
          EXPLORER <span className="explorer-count">{folders.length}</span>
        </span>
        <div className="explorer-actions">
        <button
          className="icon-button sync-toggle"
          hidden={!onToggleSync}
          onClick={() => setSyncOnly(value => !value)}
          title={syncOnly ? "Clear sync filter" : "Show files selected for sync only"}
          aria-label="Show files selected for sync only"
          aria-pressed={syncOnly}
        >
          <Cloud size={17} />
        </button>
        <button
          className="icon-button"
          hidden={mobile}
          onClick={onAdd}
          title="Open Folder in New Window…"
          aria-label="Open Folder"
        >
          <FolderOpen size={16} />
        </button>
        </div>
      </div>
      <nav
        ref={treeRef}
        className={
          "file-tree multi-explorer " + (externalDrag ? "external-drag" : "")
        }
        aria-label="Folders and files"
      >
        {(["Cloud", "Local"] as const).map(kind => {
          const isCloud = kind === "Cloud";
          const ordered = folders.filter(folder => !!folder.cloudSpace === isCloud);
          if ((isCloud && !ordered.length) || (!isCloud && mobile)) return null;
          const collapsed = isCloud && cloudCollapsed;
          const createTarget = ordered.find(folder => folder.root === activeRoot && !folder.error)
            ?? ordered.find(folder => !folder.error);
          return <section className="explorer-section" key={kind} aria-label={`${kind} notes`}>
            <div className="explorer-section-header">
              <h2>{isCloud ? <button className="explorer-section-label explorer-section-toggle" aria-expanded={!collapsed} aria-controls="explorer-cloud" onClick={() => setCloudCollapsed(!collapsed)}>
                Cloud
              </button> : <span className="explorer-section-label">Local</span>}</h2>
              {!isCloud && <div className="explorer-section-actions">
                {onShowHidden && <button className="icon-button hidden-files-toggle" aria-label={showHidden ? "Hide hidden files and folders" : "Show hidden files and folders"} title={showHidden ? "Hide hidden files and folders" : "Show hidden files and folders"} aria-pressed={showHidden} onClick={() => onShowHidden(!showHidden)}>{showHidden ? <Eye size={15}/> : <EyeOff size={15}/>}</button>}
                <RecentFolders folders={recents.filter(recent => !ordered.some(folder => folder.root === recent.root))} onOpen={onRecent} onClear={onForgetRecents}/>
                <button className="icon-button explorer-open-local" aria-label="Open local folder in new window" title="Open Folder in New Window…" onClick={onAdd}><FolderOpen size={15}/></button>
              </div>}
              {isCloud && onNew && <div className="explorer-section-actions"><button className="icon-button explorer-new-cloud" aria-label="New Cloud note" title={`New Cloud note${createTarget ? ` in ${createTarget.name}` : ""}`} disabled={!createTarget} onClick={() => { setCloudCollapsed(false); if (createTarget) onNew(createTarget); }}><Plus size={15}/></button></div>}
            </div>
            <div id={`explorer-${kind.toLowerCase()}`} hidden={collapsed}>
        {ordered.map((folder) => {
          const collapsed = folder.collapsed ?? true;
          const closed = closedDirectories(folder);
          // An open tab can point past a directory's loaded page.
          const available = folder.root === activeRoot && activePath && !folder.files.some(file => file.path === activePath)
            ? [...folder.files, { path: activePath, name: activePath.split("/").at(-1)! }]
            : folder.files;
          const visible = (path: string) => showHidden || !path.split("/").some(name => name.startsWith("."));
          const files = available.filter(file => visible(file.path) && (!syncOnly || (file.path !== ".nova" && !folder.syncError && syncIncluded(folder.syncPolicy, file.path))));
          const directories = folder.directories?.filter(visible);
          return (
          <section
            key={folder.root}
            data-folder-root={folder.root}
            className="explorer-root"
          >
            <div className="root-header">
              <button
                className="root-title"
                title={folder.cloudSpace ? `Cloud / ${folder.name}` : folder.root === "demo" ? "Sample notes" : folder.root}
                aria-label={`${folder.name} folder`}
                aria-expanded={!collapsed}
                onClick={() =>
                  onChange(
                    folders.map((f) =>
                      f.root === folder.root
                        ? { ...f, collapsed: !(f.collapsed ?? true) }
                        : f,
                    ),
                  )
                }
              >
                {collapsed ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
                <FolderOpen size={15} />
                <strong>{folder.name}</strong>
              </button>
              {!folder.cloudSpace && onNew && <button
                className="icon-button root-new-note"
                aria-label={`New note in ${folder.name}`}
                title={`New note in ${folder.name}`}
                disabled={!!folder.error}
                onClick={() => onNew(folder)}
              ><Plus size={15} aria-hidden="true" /></button>}
              <details className="root-menu">
                <summary
                  className="icon-button"
                  aria-label={`Options for ${folder.name}`}
                  title="Folder options"
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </summary>
                <div>
                  {onNew && <button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onNew(folder); }}><Plus size={13} />New note</button>}
                  {onSync && folder.cloudSpace && <button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onSync(folder); }}>Cloud settings…</button>}
                  <button onClick={() => onRefresh(folder.root)}>
                    <RefreshCw size={13} />
                    Refresh
                  </button>
                  <button hidden={mobile || !!folder.cloudSpace} onClick={() => onRemove(folder.root)}>
                    <X size={13} />
                    Close Folder
                  </button>
                </div>
              </details>
            </div>
            {!collapsed && (
              <div className="root-files">
                {folder.warnings?.map(warning => <p className="folder-error" key={warning}>{warning}</p>)}
                {folder.starsError && <p className="folder-error">{folder.starsError}</p>}
                {folder.error ? (
                  <div className="folder-error">
                    <span>{folder.error}</span>
                    <button onClick={() => onRefresh(folder.root)}>
                      Retry
                    </button>
                  </div>
                ) : files.length || directories?.length || Object.keys(folder.directoryPages ?? {}).length || Object.keys(folder.directoryErrors ?? {}).length ? (
                  <FileTree
                    closed={new Set(closed)}
                    directories={syncOnly ? [] : directories}
                    directoryPages={syncOnly ? {} : folder.directoryPages}
                    directoryErrors={folder.directoryErrors}
                    loadingDirectories={loadingDirectories[folder.root]}
                    onLoadDirectory={(path, more) => onLoadDirectory?.(folder.root, path, more)}
                    onToggle={path => folder.directories && onToggleDirectory ? onToggleDirectory(folder.root, path) : onChange(folders.map(f => f.root !== folder.root ? f : {
                      ...f, closedDirectories: closed.includes(path)
                        ? closed.filter(p => p !== path)
                        : [...closed, path],
                    }))}
                    paths={files.map((f) => f.path)}
                    active={folder.root === activeRoot ? activePath : ""}
                    onOpen={(path, pinned) => onOpen(folder, path, pinned)}
                    onRename={(path) => onRename(folder, path)}
                    onContextMenu={(event, path) => { event.preventDefault(); const trigger = event.currentTarget.closest(".file-row")!.querySelector<HTMLElement>(".file-open")!; const rect = trigger.getBoundingClientRect(); setMenu({ folder, path, trigger, x: Math.max(8, Math.min(event.clientX || rect.left, window.innerWidth - 228)), y: Math.max(8, Math.min(event.clientY || rect.bottom, window.innerHeight - 230)) }); }}
                    syncPolicy={folder.syncError ? undefined : folder.syncPolicy}
                    syncDisabled={syncBusy || !!folder.syncError}
                    onToggleSync={onToggleSync ? path => onToggleSync(folder, path) : undefined}
                    />
                ) : (
                  <p className="folder-empty">{syncOnly
                    ? folder.syncError ? "Sync selection unavailable." : "No files selected for sync in this folder."
                    : "No text or Markdown files."}</p>
                )}
              </div>
            )}
          </section>
        );})}
              {!ordered.length && <button className="explorer-add-local" onClick={onAdd}><FolderOpen size={14}/>Open Folder…</button>}
            </div>
          </section>;
        })}
        {!folders.length && (
          <div className="explorer-empty">
            <FolderOpen size={24} />
            <p>A place for every project.</p>
            <small>Open a folder to get started.</small>
          </div>
        )}
        {externalDrag && (
          <div className="folder-drop-message">Drop a folder to open it</div>
        )}
      </nav>
      {menu && createPortal(<div ref={menuRef} className="file-context-menu" role="menu" aria-label={`Actions for ${menu.path}`} style={{ left: menu.x, top: menu.y }} onKeyDown={event => {
        event.stopPropagation();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not([hidden])")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
        if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); menu.trigger.focus(); setMenu(null); }
      }}>
        {onCloudMove && !menu.folder.cloudSpace && menu.folder.root !== "demo" && <button role="menuitem" onClick={()=>{setMenu(null);onCloudMove(menu.folder,menu.path);}}>Move to Cloud…</button>}
        <button role="menuitem" onClick={() => { menu.trigger.focus(); setMenu(null); onRename(menu.folder, menu.path); }}>Rename…</button>
        <button role="menuitem" onClick={() => { menu.trigger.focus(); setMenu(null); onFileAction(menu.folder, menu.path, "move"); }}>Move…</button>
        <button hidden={mobile} role="menuitem" disabled={menu.folder.root === "demo"} title={menu.folder.root === "demo" ? "Sample notes have no file location" : undefined} onClick={() => { menu.trigger.focus(); setMenu(null); onFileAction(menu.folder, menu.path, "reveal"); }}>Open in File Location</button>
        {menu.folder.cloudSpace && <button role="menuitem" onClick={() => { menu.trigger.focus(); setMenu(null); onFileAction(menu.folder, menu.path, "drive"); }}>Open in Google Drive</button>}
        <button role="menuitem" className="danger" onClick={() => { menu.trigger.focus(); setMenu(null); onFileAction(menu.folder, menu.path, "delete"); }}>Delete…</button>
      </div>, document.body)}
    </>
  );
}
