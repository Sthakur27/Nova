import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { defaultPanelWidths, editorMinimum, fitPanelWidths, panelMaximum, panelMinimums, type PanelSide, type PanelWidths } from "./panelWidths";

const storageKey = "nova:panel-widths:v1";
function readWidths(): Partial<PanelWidths> {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    const result: Partial<PanelWidths> = {};
    for (const side of ["left", "right"] as const) {
      if (typeof stored?.[side] === "number" && Number.isFinite(stored[side]))
        result[side] = Math.max(panelMinimums[side], Math.min(panelMaximum, stored[side]));
    }
    return result;
  } catch { return {}; }
}

export default function SidePanelControls({ navigation, bookmarks, hoveredEdge, onNavigation, onBookmarks, onStorageError }: {
  navigation: boolean; bookmarks: boolean; hoveredEdge: PanelSide | null;
  onNavigation: () => void; onBookmarks: () => void; onStorageError: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(() => Math.max(760, window.innerWidth));
  const [saved, setSaved] = useState(readWidths);
  const [draft, setDraft] = useState<PanelWidths | null>(null);
  const drag = useRef<{ side: PanelSide; x: number; start: PanelWidths; latest: PanelWidths } | null>(null);
  const defaults = defaultPanelWidths(available);
  const widths = fitPanelWidths(draft ?? { ...defaults, ...saved }, available, navigation, bookmarks);

  useLayoutEffect(() => {
    const shell = anchor.current?.closest<HTMLElement>(".app-shell");
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const shell = anchor.current?.closest<HTMLElement>(".app-shell");
    shell?.style.setProperty("--navigation-width", `${widths.left}px`);
    shell?.style.setProperty("--bookmarks-width", `${widths.right}px`);
    shell?.toggleAttribute("data-panel-resizing", draft !== null);
  }, [widths.left, widths.right, draft]);

  function persist(side: PanelSide, width: number) {
    const next = { ...widths, [side]: width };
    setSaved(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { onStorageError(); }
  }
  function maximum(side: PanelSide) {
    const other = side === "left" ? (bookmarks ? widths.right : 0) : (navigation ? widths.left : 0);
    return Math.max(panelMinimums[side], Math.min(panelMaximum, available - editorMinimum - other));
  }
  function clamp(side: PanelSide, value: number) {
    return Math.max(panelMinimums[side], Math.min(maximum(side), value));
  }
  function finish(commit: boolean) {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (commit) persist(active.side, active.latest[active.side]);
    setDraft(null);
  }

  return <div ref={anchor} className="side-panel-controls">
    {(["left", "right"] as const).map((side) => {
      const expanded = side === "left" ? navigation : bookmarks;
      const label = side === "left" ? "navigation" : "bookmarks";
      const controls = side === "left" ? "global-navigation" : "bookmarks-panel";
      return <div key={side} className={`panel-toggle-zone panel-toggle-${side}`} data-expanded={expanded} data-edge-hover={hoveredEdge === side}>
        {expanded && <div className="panel-resizer" role="separator" tabIndex={0}
          aria-label={`Resize ${label}`} aria-orientation="vertical" aria-controls={controls}
          aria-valuemin={panelMinimums[side]} aria-valuemax={Math.round(maximum(side))}
          aria-valuenow={Math.round(widths[side])} aria-valuetext={`${Math.round(widths[side])} pixels`}
          title="Drag to resize. Double-click to reset."
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { side, x: event.clientX, start: widths, latest: widths };
            setDraft(widths);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.side !== side) return;
            const delta = (event.clientX - active.x) * (side === "left" ? 1 : -1);
            active.latest = { ...active.start, [side]: clamp(side, active.start[side] + delta) };
            setDraft(active.latest);
          }}
          onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)}
          onLostPointerCapture={() => finish(false)}
          onDoubleClick={() => persist(side, clamp(side, defaults[side]))}
          onKeyDown={(event) => {
            if (event.key === "Escape" && drag.current) { event.preventDefault(); finish(false); return; }
            if (drag.current) return;
            let next: number;
            if (event.key === "Home") next = panelMinimums[side];
            else if (event.key === "End") next = maximum(side);
            else if (event.key === "Enter") next = defaults[side];
            else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
              next = widths[side] + (event.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1) * (event.shiftKey ? 40 : 10);
            else return;
            event.preventDefault();
            persist(side, clamp(side, next));
          }} />}
        <button className="panel-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          title={`${expanded ? "Collapse" : "Expand"} ${label}`} aria-expanded={expanded} aria-controls={controls}
          onClick={side === "left" ? onNavigation : onBookmarks}>
          {(side === "left" ? expanded : !expanded) ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>;
    })}
  </div>;
}
