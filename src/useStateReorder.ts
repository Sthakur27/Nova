import { useEffect, useRef } from "react";

/** Match tab dragging: pointer events work when a desktop webview intercepts file drops. */
export function useStateReorder(onReorder?: (from: number, before: number | null) => void, disabled = false) {
  const ref = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const list = ref.current;
    if (!list || !onReorder || disabled) return;
    let drag: { slot: number; pointer: number; handle: HTMLElement; x: number; y: number; startY: number; moving: boolean } | null = null;
    let before: number | null = null, valid = false, frame = 0;
    const cards = () => Array.from(list.querySelectorAll<HTMLElement>("[data-state-slot]"));
    const clear = () => cards().forEach(card => { delete card.dataset.drop; delete card.dataset.dragging; });
    function locate() {
      if (!drag) return;
      clear();
      const bounds = list!.getBoundingClientRect();
      valid = drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom;
      if (!valid) return;
      const others = cards().filter(card => Number(card.dataset.stateSlot) !== drag!.slot);
      const target = others.find(card => { const rect = card.getBoundingClientRect(); return drag!.y < rect.top + rect.height / 2; });
      before = target ? Number(target.dataset.stateSlot) : null;
      const marker = target ?? others.at(-1);
      if (marker) marker.dataset.drop = target ? "before" : "after";
      const source = cards().find(card => Number(card.dataset.stateSlot) === drag!.slot);
      if (source) source.dataset.dragging = "true";
    }
    function scroll() {
      if (!drag?.moving) return;
      const bounds = list!.getBoundingClientRect();
      if (drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom) {
        const delta = drag.y < bounds.top + 24 ? -8 : drag.y > bounds.bottom - 24 ? 8 : 0;
        if (delta) { list!.scrollTop += delta; locate(); }
      }
      frame = requestAnimationFrame(scroll);
    }
    function finish(commit: boolean) {
      const active = drag;
      if (!active) return;
      drag = null; cancelAnimationFrame(frame); clear();
      if (active.handle.hasPointerCapture?.(active.pointer)) active.handle.releasePointerCapture(active.pointer);
      if (commit && active.moving && valid) onReorder!(active.slot, before);
    }
    function down(event: PointerEvent) {
      suppressClick.current = false;
      if (event.button !== 0 || !event.isPrimary || event.pointerType === "touch") return;
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>("[data-state-slot]");
      if (!card || target?.closest(".saved-state-confirm")) return;
      const button = target?.closest("button");
      if (button && !button.matches(".saved-state-drag, .saved-state-restore")) return;
      const handle = card;
      drag = { slot: Number(card.dataset.stateSlot), pointer: event.pointerId, handle, x: event.clientX, y: event.clientY, startY: event.clientY, moving: false };
    }
    function move(event: PointerEvent) {
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.moving && Math.abs(drag.y - drag.startY) < 5) return;
      event.preventDefault();
      if (!drag.moving) { drag.moving = true; suppressClick.current = true; drag.handle.setPointerCapture?.(drag.pointer); frame = requestAnimationFrame(scroll); }
      locate();
    }
    function up(event: PointerEvent) {
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (drag.moving) locate();
      finish(true);
    }
    const cancel = () => finish(false);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    const click = (event: MouseEvent) => { if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); } };
    list.addEventListener("pointerdown", down);
    list.addEventListener("click", click, true);
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", key);
    return () => {
      cancel(); list.removeEventListener("pointerdown", down); list.removeEventListener("click", click, true);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", key);
    };
  }, [onReorder, disabled]);
  return ref;
}
