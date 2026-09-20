import { useEffect, useRef } from "react";

/** Pointer dragging also works in desktop webviews that intercept native file drops. */
export function useTabReorder(onReorder: (id: string, beforeId: string | null) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    let drag: { id: string; pointer: number; button: HTMLElement; startX: number; x: number; y: number; moving: boolean } | null = null;
    let beforeId: string | null = null;
    let valid = false;
    let suppressClick = false;
    let frame = 0;
    const tabs = () => Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]"));
    function clearMarkers() {
      for (const tab of tabs()) delete tab.dataset.dropSide;
    }
    function locate() {
      if (!drag) return;
      clearMarkers();
      const bounds = strip!.getBoundingClientRect();
      valid = drag.y >= bounds.top && drag.y <= bounds.bottom && drag.x >= bounds.left - 24 && drag.x <= bounds.right + 24;
      if (!valid) return;
      const others = tabs().filter((tab) => tab.dataset.tabId !== drag!.id);
      const before = others.find((tab) => {
        const rect = tab.getBoundingClientRect();
        return drag!.x < rect.left + rect.width / 2;
      });
      beforeId = before?.dataset.tabId ?? null;
      const marker = before ?? others.at(-1);
      if (marker) marker.dataset.dropSide = before ? "before" : "after";
    }
    function scroll() {
      if (!drag?.moving) return;
      const bounds = strip!.getBoundingClientRect();
      if (drag.y >= bounds.top && drag.y <= bounds.bottom) {
        const delta = drag.x < bounds.left + 28 ? -10 : drag.x > bounds.right - 28 ? 10 : 0;
        if (delta) { strip!.scrollLeft += delta; locate(); }
      }
      frame = requestAnimationFrame(scroll);
    }
    function down(event: PointerEvent) {
      suppressClick = false;
      if (drag || event.button !== 0 || !event.isPrimary || event.pointerType === "touch") return;
      const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
      const id = button?.closest<HTMLElement>("[data-tab-id]")?.dataset.tabId;
      if (!button || !id || !strip!.contains(button)) return;
      drag = { id, pointer: event.pointerId, button, startX: event.clientX, x: event.clientX, y: event.clientY, moving: false };
    }
    function move(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.pointer) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.moving && Math.abs(drag.x - drag.startX) < 5) return;
      event.preventDefault();
      if (!drag.moving) {
        drag.moving = true;
        suppressClick = true;
        drag.button.setPointerCapture?.(drag.pointer);
        strip!.dataset.reordering = "true";
        drag.button.closest<HTMLElement>("[data-tab-id]")!.dataset.dragging = "true";
        frame = requestAnimationFrame(scroll);
      }
      locate();
    }
    function finish(commit: boolean) {
      const active = drag;
      if (!active) return;
      drag = null;
      cancelAnimationFrame(frame);
      clearMarkers();
      delete strip!.dataset.reordering;
      for (const tab of tabs()) delete tab.dataset.dragging;
      if (active.button.hasPointerCapture?.(active.pointer)) active.button.releasePointerCapture(active.pointer);
      if (commit && active.moving && valid) onReorder(active.id, beforeId);
    }
    function up(event: PointerEvent) {
      if (event.pointerId !== drag?.pointer) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (drag.moving) locate();
      finish(true);
    }
    function cancel(event: PointerEvent) { if (event.pointerId === drag?.pointer) finish(false); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") finish(false); }
    function blur() { finish(false); }
    function click(event: MouseEvent) {
      if (suppressClick && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
    }
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    strip.addEventListener("click", click, true);
    strip.addEventListener("dblclick", click, true);
    return () => {
      finish(false);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      strip.removeEventListener("click", click, true);
      strip.removeEventListener("dblclick", click, true);
    };
  }, [onReorder]);
  return ref;
}
