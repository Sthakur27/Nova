import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { paneLeaves, type Pane, type PaneNode, type PaneSplit } from "./paneLayout";

// Stable portal hosts keep editors mounted when the split tree is rearranged.
export default function EditorPanes({ layout, active, compact, renderTabs, renderDocument, onActivate, onResize }: {
  layout: PaneNode; active: string; compact: boolean;
  renderTabs: (pane: Pane) => ReactNode; renderDocument: (pane: Pane) => ReactNode;
  onActivate: (id: string) => boolean; onResize: (id: string, ratio: number) => void;
}) {
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const leaves = paneLeaves(layout);
  for (const id of hosts.current.keys()) if (!leaves.some(p => p.id === id)) hosts.current.delete(id);
  for (const pane of leaves) if (!hosts.current.has(pane.id)) {
    const host = document.createElement("div"); host.className = "pane-host"; hosts.current.set(pane.id, host);
  }
  const render = (node: PaneNode): ReactNode => node.kind === "pane"
    ? <section key={node.id} className="editor-group" data-editor-pane={node.id} data-active={active === node.id}
        aria-label="Editor group" onPointerDownCapture={event => {
          if (active !== node.id && !onActivate(node.id)) { event.preventDefault(); event.stopPropagation(); }
        }} onFocusCapture={() => { if (active !== node.id) onActivate(node.id); }}>
        <div className="pane-slot" ref={element => { const host = hosts.current.get(node.id)!; if (element && host.parentNode !== element) element.append(host); }} />
      </section>
    : <Split key={node.id} node={node} onResize={onResize}>{[render(node.first), render(node.second)]}</Split>;
  return <div className="editor-panes">
    {compact ? render(leaves.find(p => p.id === active) ?? leaves[0]) : render(layout)}
    {leaves.map(pane => createPortal(<div className="pane-content" onPointerDownCapture={event => {
      if (active !== pane.id && !onActivate(pane.id)) { event.preventDefault(); event.stopPropagation(); }
    }} onFocusCapture={event => { if (active !== pane.id && !onActivate(pane.id)) (event.target as HTMLElement).blur(); }}
    onKeyDownCapture={event => { if (active !== pane.id && !onActivate(pane.id)) { event.preventDefault(); event.stopPropagation(); } }}>
      {renderTabs(pane)}
      {renderDocument(pane)}
    </div>, hosts.current.get(pane.id)!, pane.id))}
  </div>;
}
function Split({ node, onResize, children }: { node: PaneSplit; onResize: (id: string, ratio: number) => void; children: ReactNode[] }) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; ratio: number } | null>(null);
  const horizontal = node.axis === "horizontal";
  const clamp = (ratio: number) => Math.max(.15, Math.min(.85, ratio));
  return <div ref={container} className="editor-split" data-axis={node.axis}>
    <div className="split-child" style={{ flex: `${node.ratio} 1 0` }}>{children[0]}</div>
    <div className="editor-divider" style={horizontal ? { left: `${node.ratio * 100}%` } : { top: `${node.ratio * 100}%` }} role="separator" tabIndex={0} aria-label="Resize editor panes"
      aria-orientation={horizontal ? "vertical" : "horizontal"} aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(node.ratio * 100)}
      onDoubleClick={() => onResize(node.id, .5)}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { pointer: event.pointerId, ratio: node.ratio }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (drag.current?.pointer !== event.pointerId) return; const rect = container.current!.getBoundingClientRect(); onResize(node.id, clamp(horizontal ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height)); }}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
      onPointerCancel={() => { if (drag.current) onResize(node.id, drag.current.ratio); drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        if (event.key === "Escape" && drag.current) { onResize(node.id, drag.current.ratio); drag.current = null; return; }
        const delta = event.key === (horizontal ? "ArrowLeft" : "ArrowUp") ? -.05 : event.key === (horizontal ? "ArrowRight" : "ArrowDown") ? .05 : 0;
        if (delta) { event.preventDefault(); onResize(node.id, clamp(node.ratio + delta)); }
      }} />
    <div className="split-child" style={{ flex: `${1 - node.ratio} 1 0` }}>{children[1]}</div>
  </div>;
}
