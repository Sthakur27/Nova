import { useLayoutEffect, useRef, useState } from "react";
import { panelSnapDistance, usePanelDrag } from "./usePanelDrag";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { defaultPanelWidths, editorMinimum, fitPanelWidths, panelMaximum, panelMinimums, type PanelSide, type PanelWidths } from "./panelWidths";

const modifier = navigator.platform.toLowerCase().includes("mac") ? "Meta" : "Control";
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
  const initiallyExpanded = useRef(true);
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
    if (shell) {
      if (draft?.left === 0) shell.dataset.snapPanel = "left";
      else if (draft?.right === 0) shell.dataset.snapPanel = "right";
      else delete shell.dataset.snapPanel;
    }
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
  usePanelDrag({
    shell: () => anchor.current?.closest<HTMLElement>(".app-shell"),
    onStart: (panel) => {
      if (panel === "bottom") return 0;
      initiallyExpanded.current = panel === "left" ? navigation : bookmarks;
      drag.current = { side: panel, x: 0, start: widths, latest: widths };
      return (panel === "left" ? navigation : bookmarks) ? widths[panel] : 0;
    },
    onMove: (panel, size) => {
      if (panel === "bottom") return;
      const active = drag.current;
      if (!active) return;
      active.latest = { ...active.start, [panel]: size <= panelSnapDistance ? 0 : clamp(panel, size) };
      if (!(panel === "left" ? navigation : bookmarks) && size > panelSnapDistance)
        (panel === "left" ? onNavigation : onBookmarks)();
      setDraft(active.latest);
    },
    onFinish: (panel, commit) => {
      if (panel === "bottom") return;
      const expanded = panel === "left" ? navigation : bookmarks;
      if (!commit && initiallyExpanded.current !== expanded)
        (panel === "left" ? onNavigation : onBookmarks)();
      const active = drag.current;
      drag.current = null;
      if (commit && active) {
        if (active.latest[panel] === 0) {
          if (panel === "left" ? navigation : bookmarks) (panel === "left" ? onNavigation : onBookmarks)();
        } else persist(panel, active.latest[panel]);
      }
      setDraft(null);
    },
  });

  return <div ref={anchor} className="side-panel-controls">
    {(["left", "right"] as const).map((side) => {
      const expanded = side === "left" ? navigation : bookmarks;
      const label = side === "left" ? "navigation" : "bookmarks";
      const controls = side === "left" ? "global-navigation" : "bookmarks-panel";
      return <div key={side} className={`panel-toggle-zone panel-toggle-${side}`} data-expanded={expanded} data-edge-hover={hoveredEdge === side}>
        <div data-panel-drag={side} className="panel-resizer" role="separator" tabIndex={0}
          aria-label={`Resize ${label}`} aria-orientation="vertical" aria-controls={controls}
          aria-valuemin={0} aria-valuemax={Math.round(maximum(side))}
          aria-valuenow={expanded ? Math.round(widths[side]) : 0} aria-valuetext={`${Math.round(widths[side])} pixels`}
          title="Drag to resize. Double-click to reset."
          onDoubleClick={() => persist(side, clamp(side, defaults[side]))}
          onKeyDown={(event) => {
            if (drag.current) return;
            let next: number;
            if (event.key === "Home") { event.preventDefault(); if (expanded) (side === "left" ? onNavigation : onBookmarks)(); return; }
            else if (event.key === "End") next = maximum(side);
            else if (event.key === "Enter") next = defaults[side];
            else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
              next = widths[side] + (event.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1) * (event.shiftKey ? 40 : 10);
            else return;
            event.preventDefault();
            if (!expanded) (side === "left" ? onNavigation : onBookmarks)();
            persist(side, clamp(side, next));
          }} />
        <button className="panel-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          aria-describedby={`${side}-panel-tooltip`}
          aria-keyshortcuts={`${modifier}+${side === "left" ? "ArrowLeft" : "ArrowRight"}`} aria-expanded={expanded} aria-controls={controls}
          onClick={side === "left" ? onNavigation : onBookmarks}>
          {(side === "left" ? expanded : !expanded) ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          <span className="focus-tooltip" id={`${side}-panel-tooltip`} role="tooltip">
            <span>{expanded ? "Collapse" : "Expand"} {label}</span>
            <span className="focus-tooltip-keys"><kbd>{modifier === "Meta" ? "⌘" : "Ctrl"}</kbd><kbd>{side === "left" ? "←" : "→"}</kbd></span>
          </span>
        </button>
      </div>;
    })}
  </div>;
}
