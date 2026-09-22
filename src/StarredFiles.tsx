import BookmarkSections from "./BookmarkSections";
import NovaStar from "./NovaStar";
import { FileText } from "lucide-react";
import type { Workspace } from "./model";

export default function StarredFiles({ folders, activeRoot, activePath, onOpen, onStar }: {
  folders: Workspace[];
  activeRoot: string;
  activePath: string;
  onOpen: (folder: Workspace, path: string, pinned?: boolean) => void;
  onStar: (folder: Workspace, path: string, starred: boolean) => void;
}) {
  return <div className="starred-files" aria-label="Starred files">
    <div className="rail-intro">Quick access across your folders.</div>
    <BookmarkSections view="files" items={folders.filter(folder => folder.starred?.length || folder.starsError)}
      isCloud={folder => !!folder.cloudSpace} emptyMessage="No starred files here. Star a file in the breadcrumb bar to find it here."
      renderItem={folder => <section key={folder.root} aria-label={folder.name}>
      {folder.starsError && <p role="status" className="rail-intro">{folder.name}: {folder.starsError}</p>}
      {!!folder.starred?.length && <>
        <h3 title={folder.root}>{folder.name}</h3>
        {[...folder.starred].sort((a, b) => a.localeCompare(b)).map(path => {
          const active = folder.root === activeRoot && path === activePath;
          return <div className={`starred-file-row${active ? " current" : ""}`} key={path}>
            <button className="starred-file-open" title={`${folder.name} / ${path}`}
              aria-current={active ? "page" : undefined}
              onClick={event => { if (event.detail <= 1) onOpen(folder, path); }}
              onDoubleClick={() => onOpen(folder, path, true)}>
              <FileText size={15} aria-hidden="true" />
              <span><strong>{path.split("/").at(-1)}</strong><small>{path}</small></span>
            </button>
            <button className="icon-button" aria-label={`Unstar ${path}`} title="Unstar file" onClick={() => onStar(folder, path, false)}>
              <NovaStar size={14} />
            </button>
          </div>;
        })}
      </>}
    </section>} />
  </div>;
}
