import type { Workspace } from "./model";
import type { RecentFile } from "./recentFileHistory";
import "./recentFiles.css";

export default function RecentFiles({ files, folders, active, error, onOpen, onRemove, onClear }: {
  files: RecentFile[]; folders: Workspace[]; active: RecentFile | null; error: string;
  onOpen: (file: RecentFile) => void; onRemove: (file: RecentFile) => void; onClear: () => void;
}) {
  return <section className="recent-files" aria-label="Recent files">
    <header><h2>Recent files</h2>{files.length > 0 && <button onClick={onClear}>Clear history</button>}</header>
    <p>Recently opened in this workspace.</p>
    {error && <p role="status">{error}</p>}
    {!files.length && <p>Open a note to find it here later.</p>}
    <ul>{files.map(file => {
      const folder = folders.find(folder => folder.root === file.root)!;
      const name = file.path.split("/").at(-1)!;
      const location = `${folder.cloudSpace ? "Cloud" : "Local"} · ${folder.name} · ${file.path}`;
      return <li key={JSON.stringify([file.root, file.path])}>
        <button className="recent-file-open" title={location} aria-current={active?.root === file.root && active.path === file.path ? "page" : undefined} onClick={() => onOpen(file)}>
          <strong>{name}</strong><small>{location}</small>
        </button>
        <button className="recent-file-remove" aria-label={`Remove ${file.path} from recent files`} title="Remove from recent files" onClick={() => onRemove(file)}>×</button>
      </li>;
    })}</ul>
  </section>;
}
