import { useEffect, useRef } from "react";

export type DragPanel = "left" | "right" | "top";
export const panelSnapDistance = 48;
const activeControls = 'button, input, textarea, select, a, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="tab"], [role="treeitem"], [role="slider"], [role="menuitem"], [draggable="true"], [data-panel-no-drag]';

/** A small movement threshold preserves ordinary clicks on panel backgrounds. */
export function usePanelDrag({ shell, onStart, onMove, onFinish }: {
  shell: () => HTMLElement | null | undefined;
  onStart: (panel: DragPanel) => number;
  onMove: (panel: DragPanel, size: number) => void;
  onFinish: (panel: DragPanel, commit: boolean) => void;
}) {
  const drag = useRef<{ panel: DragPanel; id: number; x: number; y: number; size: number; moving: boolean } | null>(null);
  useEffect(() => {
    const element = shell();
    if (!element) return;
    function down(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || drag.current || element!.dataset.focusMode === "true") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const handle = target.closest<HTMLElement>("[data-panel-drag]");
      if (!handle && target.closest(activeControls)) return;
      const panel = handle?.dataset.panelDrag as DragPanel | undefined
        ?? (target.closest(".sidebar") ? "left" : target.closest(".bookmark-rail") ? "right" : target.closest(".top-bars") ? "top" : undefined);
      if (!panel) return;
      drag.current = { panel, id: event.pointerId, x: event.clientX, y: event.clientY, size: onStart(panel), moving: false };
    }
    function move(event: PointerEvent) {
      const active = drag.current;
      if (!active || event.pointerId !== active.id) return;
      const delta = active.panel === "top" ? event.clientY - active.y : (event.clientX - active.x) * (active.panel === "left" ? 1 : -1);
      if (!active.moving && Math.abs(delta) < 5) return;
      active.moving = true;
      event.preventDefault();
      element!.dataset.panelDragging = active.panel;
      const bounds = element!.getBoundingClientRect();
      const distance = active.panel === "left" ? event.clientX - bounds.left
        : active.panel === "right" ? bounds.right - event.clientX : event.clientY - bounds.top;
      onMove(active.panel, distance <= panelSnapDistance ? 0 : Math.max(0, active.size + delta));
    }
    function finish(commit: boolean) {
      const active = drag.current;
      if (!active) return;
      drag.current = null;
      delete element!.dataset.panelDragging;
      onFinish(active.panel, commit && active.moving);
    }
    function up(event: PointerEvent) { if (event.pointerId === drag.current?.id) finish(true); }
    function cancel(event: PointerEvent) { if (event.pointerId === drag.current?.id) finish(false); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") finish(false); }
    function blur() { finish(false); }
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, [shell, onStart, onMove, onFinish]);
}
