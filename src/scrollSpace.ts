import type { WheelEvent } from "react";

// Grow the empty space only when the user scrolls toward its edge. Keep the
// visible content stationary when inserting space above it.
export function extendScrollSpace(event: WheelEvent<HTMLElement>) {
  if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const target = event.target as Element;
  const pane = target.closest<HTMLElement>(".document-pane, .read-pane, .cm-scroller");
  if (!pane) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? pane.clientHeight : 1);
  const room = Math.max(pane.clientHeight, Math.abs(delta) * 2);
  if (delta < 0 && pane.scrollTop < Math.abs(delta) + 80) {
    const top = pane.scrollTop;
    const extra = parseFloat(pane.style.getPropertyValue("--extra-scroll-before")) || 0;
    pane.style.setProperty("--extra-scroll-before", `${extra + room}px`);
    pane.scrollTo({ top: top + room, behavior: "instant" });
  } else if (delta > 0 && pane.scrollHeight - pane.clientHeight - pane.scrollTop < delta + 80) {
    const extra = parseFloat(pane.style.getPropertyValue("--extra-scroll-after")) || 0;
    pane.style.setProperty("--extra-scroll-after", `${extra + room}px`);
  }
}

export function scrollSpaceStyle(pane: HTMLElement | null | undefined) {
  return {
    before: pane?.style.getPropertyValue("--extra-scroll-before") || "0px",
    after: pane?.style.getPropertyValue("--extra-scroll-after") || "0px",
  };
}
