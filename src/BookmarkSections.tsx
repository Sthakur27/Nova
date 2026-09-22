import { useId, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Cloud, FolderOpen } from "lucide-react";
import { usePreference } from "./preferences";

function Section({ cloud, view, children }: { cloud: boolean; view: string; children: ReactNode }) {
  const id = useId();
  const label = cloud ? "Cloud" : "Local";
  const [collapsed, setCollapsed] = usePreference<boolean>(`bookmarks-${view}-${label.toLowerCase()}-collapsed`, false);
  return <section className="bookmark-section" aria-label={`${label} ${view}`}>
    <button className="bookmark-section-toggle" aria-expanded={!collapsed} aria-controls={id} onClick={() => setCollapsed(!collapsed)}>
      {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      {cloud ? <Cloud size={15} /> : <FolderOpen size={15} />}
      <span>{label}</span>
    </button>
    <div id={id} hidden={collapsed} className="bookmark-section-content">{children}</div>
  </section>;
}

export default function BookmarkSections<T>({ items, isCloud, renderItem, view, emptyMessage }: {
  items: T[];
  isCloud: (item: T) => boolean;
  renderItem: (item: T, index: number) => ReactNode;
  view: "files" | "passages";
  emptyMessage: string;
}) {
  return <>{[true, false].map(cloud => {
    const group = items.filter(item => isCloud(item) === cloud);
    return <Section key={String(cloud)} cloud={cloud} view={view}>
      {group.length ? group.map(renderItem) : <div className="empty-bookmarks section-empty"><small>{emptyMessage}</small></div>}
    </Section>;
  })}</>;
}
