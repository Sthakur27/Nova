import { mobile } from "./platform";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import {
  Cloud,
  CloudOff,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  Plus,
  Pencil,
  MoreHorizontal,
  RefreshCw,
  X,
} from "lucide-react";
import { syncIncluded, type SyncPolicy } from "./syncPolicy";
import type { Workspace } from "./model";
import { closedDirectories, reorderFolders } from "./folders";
function NovaStar({ size }: { size: number }) {
  return (
    <svg className="nova-star" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 14.7 9.3 22 12 14.7 14.7 12 22 9.3 14.7 2 12 9.3 9.3Z" />
    </svg>
  );
}
function FileTree({
  paths,
  active,
  onOpen,
  onRename,
  onContextMenu,
  starred,
  onStar,
  syncPolicy, syncDisabled, onToggleSync,
  prefix = "",
  closed,
  onToggle,
}: {
  paths: string[];
  active: string;
  onOpen: (path: string, pinned?: boolean) => void;
  onRename: (path: string) => void;
  onContextMenu: (event: MouseEvent, path: string) => void;
  starred: Set<string>;
  onStar: (path: string, starred: boolean) => void;
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
                  active={active}
                  onOpen={onOpen}
                  onRename={onRename}
                  onContextMenu={onContextMenu}
                  starred={starred}
                  onStar={onStar}
                  syncPolicy={syncPolicy} syncDisabled={syncDisabled} onToggleSync={onToggleSync}
                  prefix={prefix + name + "/"}
                />
              </div>
            )}
          </div>
        ))}
      {files.sort().map((path) => (
        <div key={path} onContextMenu={event => onContextMenu(event, path)} className={"tree-row file-row " + (path === active ? "active" : "")}>
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
          {onToggleSync && <button className="icon-button file-sync"
            aria-label={`${syncIncluded(syncPolicy, path) ? "Exclude from" : "Include in"} sync: ${path}`}
            aria-pressed={syncIncluded(syncPolicy, path)} disabled={syncDisabled}
            title={syncDisabled ? "Sync selection unavailable" : syncIncluded(syncPolicy, path) ? "Selected for sync · Click to keep local" : "Keep local · Click to include in sync"}
            onClick={() => onToggleSync(path)}>
            {syncIncluded(syncPolicy, path) ? <Cloud size={14} /> : <CloudOff size={14} />}
          </button>}
          <button
            className="icon-button file-star"
            aria-label={`${starred.has(path) ? "Unstar" : "Star"} ${path}`}
            title={starred.has(path) ? "Unstar file" : "Star file"}
            aria-pressed={starred.has(path)}
            onClick={() => onStar(path, !starred.has(path))}
          >
            <NovaStar size={15} />
          </button>
          <button
            className="icon-button file-edit"
            aria-label={mobile ? `Actions for ${path}` : `Rename ${path}`}
            title={mobile ? "Note actions" : "Rename file"}
            onClick={event => mobile ? onContextMenu(event, path) : onRename(path)}
          >
            {mobile ? <MoreHorizontal size={18} /> : <Pencil size={14} />}
          </button>
        </div>
      ))}
    </>
  );
}
type Props = {
  folders: Workspace[];
  activeRoot: string;
  activePath: string;
  onOpen: (folder: Workspace, path: string, pinned?: boolean) => void;
  onRename: (folder: Workspace, path: string) => void;
  onStar: (folder: Workspace, path: string, starred: boolean) => void;
  onFileAction: (folder: Workspace, path: string, action: "move" | "delete" | "reveal") => void;
  onChange: (folders: Workspace[]) => void;
  onRemove: (root: string) => void;
  onRefresh: (root: string) => void;
  onSync?: (folder: Workspace) => void;
  onToggleSync?: (folder: Workspace, path: string) => void;
  syncBusy?: boolean;
  onAdd: () => void;
  externalDrag: boolean;
};
export default function Explorer({
  folders,
  activeRoot,
  activePath,
  onOpen,
  onRename,
  onStar,
  onChange,
  onFileAction,
  onRemove,
  onRefresh,
  onAdd,
  onSync,
  onToggleSync, syncBusy = false,
  externalDrag,
}: Props) {
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
  const [starredOnly, setStarredOnly] = useState(false);
  const [syncOnly, setSyncOnly] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null),
    [target, setTarget] = useState<string | null>(null),
    [announcement, setAnnouncement] = useState("");
  const drag = useRef<{ root: string; startY: number; target: string } | null>(
    null,
  );
  const move = (source: string, destination: string) => {
    onChange(reorderFolders(folders, source, destination));
    setAnnouncement("Folder order updated.");
  };
  function pointerDown(event: PointerEvent<HTMLButtonElement>, root: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { root, startY: event.clientY, target: root };
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || Math.abs(event.clientY - d.startY) < 4) return;
    setDragging(d.root);
    const element = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-folder-root]");
    if (element?.dataset.folderRoot) {
      d.target = element.dataset.folderRoot;
      setTarget(d.target);
    }
  }
  function pointerUp() {
    const d = drag.current;
    if (d && d.target !== d.root) move(d.root, d.target);
    drag.current = null;
    setDragging(null);
    setTarget(null);
  }
  return (
    <>
      <div className="workspace-label">
        <span>
          EXPLORER <span className="explorer-count">{folders.length}</span>
        </span>
        <div className="explorer-actions">
        <button
          className="icon-button stars-toggle"
          onClick={() => setStarredOnly(value => !value)}
          title={starredOnly ? "Clear starred filter" : "Show starred files only"}
          aria-label="Show starred files only"
          aria-pressed={starredOnly}
        >
          <NovaStar size={17} />
        </button>
        <button
          className="icon-button sync-toggle"
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
          title="Add folders"
          aria-label="Add folders"
        >
          <Plus size={16} />
        </button>
        </div>
      </div>
      <nav
        className={
          "file-tree multi-explorer " + (externalDrag ? "external-drag" : "")
        }
        aria-label="Folders and files"
      >
        {folders.map((folder, index) => {
          const starred = new Set(folder.starred ?? []);
          const collapsed = folder.collapsed ?? true;
          const closed = closedDirectories(folder);
          const files = folder.files.filter(file =>
            (!starredOnly || starred.has(file.path)) &&
            (!syncOnly || (!folder.syncError && syncIncluded(folder.syncPolicy, file.path))));
          return (
          <section
            key={folder.root}
            data-folder-root={folder.root}
            className={
              "explorer-root " +
              (dragging === folder.root ? "is-dragging " : "") +
              (target === folder.root && target !== dragging
                ? "drop-target"
                : "")
            }
          >
            <div className="root-header">
              <button
                className="root-grip"
                aria-label={`Reorder ${folder.name}`}
                title="Drag to reorder · Arrow keys to move"
                onPointerDown={(e) => pointerDown(e, folder.root)}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragging(null);
                  setTarget(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    const next =
                      folders[index + (e.key === "ArrowUp" ? -1 : 1)];
                    if (next) move(folder.root, next.root);
                  }
                }}
              >
                <GripVertical size={12} />
              </button>
              <button
                className="root-title"
                title={folder.root === "demo" ? "Sample notes" : folder.root}
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
              <details className="root-menu">
                <summary
                  aria-label={`Options for ${folder.name}`}
                  title="Folder options"
                >
                  ···
                </summary>
                <div>
                  {onSync && <button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onSync(folder); }}>Sync selection…</button>}
                  <button onClick={() => onRefresh(folder.root)}>
                    <RefreshCw size={13} />
                    Refresh
                  </button>
                  <button
                    disabled={index === 0}
                    onClick={() => move(folder.root, folders[index - 1].root)}
                  >
                    <ArrowUp size={13} />
                    Move up
                  </button>
                  <button
                    disabled={index === folders.length - 1}
                    onClick={() => move(folder.root, folders[index + 1].root)}
                  >
                    <ArrowDown size={13} />
                    Move down
                  </button>
                  <button hidden={mobile} onClick={() => onRemove(folder.root)}>
                    <X size={13} />
                    Remove from explorer
                  </button>
                </div>
              </details>
            </div>
            {!collapsed && (
              <div className="root-files">
                {folder.starsError && <p className="folder-error">{folder.starsError}</p>}
                {folder.error ? (
                  <div className="folder-error">
                    <span>Folder unavailable</span>
                    <button onClick={() => onRefresh(folder.root)}>
                      Retry
                    </button>
                  </div>
                ) : files.length ? (
                  <FileTree
                    closed={new Set(closed)}
                    onToggle={path => onChange(folders.map(f => f.root !== folder.root ? f : {
                      ...f, closedDirectories: closed.includes(path)
                        ? closed.filter(p => p !== path)
                        : [...closed, path],
                    }))}
                    paths={files.map((f) => f.path)}
                    active={folder.root === activeRoot ? activePath : ""}
                    onOpen={(path, pinned) => onOpen(folder, path, pinned)}
                    onRename={(path) => onRename(folder, path)}
                    onContextMenu={(event, path) => { event.preventDefault(); const trigger = event.currentTarget.closest(".file-row")!.querySelector<HTMLElement>(".file-open")!; const rect = trigger.getBoundingClientRect(); setMenu({ folder, path, trigger, x: Math.max(8, Math.min(event.clientX || rect.left, window.innerWidth - 228)), y: Math.max(8, Math.min(event.clientY || rect.bottom, window.innerHeight - 170)) }); }}
                    syncPolicy={folder.syncError ? undefined : folder.syncPolicy}
                    syncDisabled={syncBusy || !!folder.syncError}
                    onToggleSync={onToggleSync ? path => onToggleSync(folder, path) : undefined}
                    starred={starred}
                    onStar={(path, value) => onStar(folder, path, value)}
                  />
                ) : (
                  <p className="folder-empty">{syncOnly
                    ? folder.syncError ? "Sync selection unavailable." : starredOnly ? "No starred files selected for sync in this folder." : "No files selected for sync in this folder."
                    : starredOnly ? "No starred files in this folder." : "No text or Markdown files."}</p>
                )}
              </div>
            )}
          </section>
        );})}
        {!folders.length && (
          <div className="explorer-empty">
            <FolderOpen size={24} />
            <p>A place for every project.</p>
            <small>Add a folder to get started.</small>
          </div>
        )}
        {externalDrag && (
          <div className="folder-drop-message">Drop folders to add them</div>
        )}
      </nav>
      {menu && createPortal(<div ref={menuRef} className="file-context-menu" role="menu" aria-label={`Actions for ${menu.path}`} style={{ left: menu.x, top: menu.y }} onKeyDown={event => {
        event.stopPropagation();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
        if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); menu.trigger.focus(); setMenu(null); }
      }}>
        <button role="menuitem" onClick={() => { menu.trigger.focus(); setMenu(null); onRename(menu.folder, menu.path); }}>Rename…</button>
        <button role="menuitem" onClick={() => { menu.trigger.focus(); setMenu(null); onFileAction(menu.folder, menu.path, "move"); }}>Move…</button>
        <button hidden={mobile} role="menuitem" disabled={menu.folder.root === "demo"} title={menu.folder.root === "demo" ? "Sample notes have no file location" : undefined} onClick={() => { menu.trigger.focus(); setMenu(null); onFileAction(menu.folder, menu.path, "reveal"); }}>Open in File Location</button>
        <button role="menuitem" className="danger" onClick={() => { menu.trigger.focus(); setMenu(null); onFileAction(menu.folder, menu.path, "delete"); }}>Delete…</button>
      </div>, document.body)}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
