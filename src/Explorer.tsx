import { useRef, useState, type PointerEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import type { Workspace } from "./model";
import { reorderFolders } from "./folders";
function FileTree({
  paths,
  active,
  onOpen,
  prefix = "",
}: {
  paths: string[];
  active: string;
  onOpen: (path: string, pinned?: boolean) => void;
  prefix?: string;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
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
              aria-expanded={!closed.has(name)}
              onClick={() =>
                setClosed((old) => {
                  const next = new Set(old);
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
              <Folder size={14} />
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
          title={path}
          className={"tree-row file-row " + (path === active ? "active" : "")}
          onClick={() => onOpen(path)}
          onDoubleClick={() => onOpen(path, true)}
        >
          <FileText size={14} />
          <span>{path.slice(prefix.length)}</span>
          {path === active && <span className="active-dot" />}
        </button>
      ))}
    </>
  );
}
type Props = {
  folders: Workspace[];
  activeRoot: string;
  activePath: string;
  onOpen: (folder: Workspace, path: string, pinned?: boolean) => void;
  onChange: (folders: Workspace[]) => void;
  onRemove: (root: string) => void;
  onRefresh: (root: string) => void;
  onAdd: () => void;
  externalDrag: boolean;
};
export default function Explorer({
  folders,
  activeRoot,
  activePath,
  onOpen,
  onChange,
  onRemove,
  onRefresh,
  onAdd,
  externalDrag,
}: Props) {
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
        <button
          className="icon-button"
          onClick={onAdd}
          title="Add folders"
          aria-label="Add folders"
        >
          <Plus size={16} />
        </button>
      </div>
      <nav
        className={
          "file-tree multi-explorer " + (externalDrag ? "external-drag" : "")
        }
        aria-label="Folders and files"
      >
        {folders.map((folder, index) => (
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
                aria-expanded={!folder.collapsed}
                onClick={() =>
                  onChange(
                    folders.map((f) =>
                      f.root === folder.root
                        ? { ...f, collapsed: !f.collapsed }
                        : f,
                    ),
                  )
                }
              >
                {folder.collapsed ? (
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
                  <button onClick={() => onRemove(folder.root)}>
                    <X size={13} />
                    Remove from explorer
                  </button>
                </div>
              </details>
            </div>
            {!folder.collapsed && (
              <div className="root-files">
                {folder.error ? (
                  <div className="folder-error">
                    <span>Folder unavailable</span>
                    <button onClick={() => onRefresh(folder.root)}>
                      Retry
                    </button>
                  </div>
                ) : folder.files.length ? (
                  <FileTree
                    paths={folder.files.map((f) => f.path)}
                    active={folder.root === activeRoot ? activePath : ""}
                    onOpen={(path, pinned) => onOpen(folder, path, pinned)}
                  />
                ) : (
                  <p className="folder-empty">No text or Markdown files.</p>
                )}
              </div>
            )}
          </section>
        ))}
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
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
