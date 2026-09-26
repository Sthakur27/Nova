// Match --scroll-before in style.css so notes open at their normal top inset.
export function initialScrollTop(pane: HTMLElement, mobile: boolean) {
  const space = mobile ? parseFloat(getComputedStyle(pane).getPropertyValue("--mobile-scroll-space")) : NaN;
  return Number.isFinite(space) ? space : Math.max(0, pane.clientHeight - 160);
}

/** Keep the document at the same offset inside its viewport when chrome changes
 * its height. The viewport-sized space above the note must not cancel that move. */
export function trackScrollSpace(pane: HTMLElement, mobile: boolean): () => void {
  if (mobile || typeof ResizeObserver === "undefined") return () => {};
  const container = pane.closest<HTMLElement>(".document-area") ?? pane;
  let height = pane.clientHeight ? container.clientHeight : 0;
  let top = pane.scrollTop;
  const space = (height: number) => Math.max(0, height - 160);
  const onScroll = () => {
    // Resize can clamp scrollTop and emit a scroll event before the observer.
    if (pane.clientHeight && container.clientHeight === height) top = pane.scrollTop;
  };
  const observer = new ResizeObserver(() => {
    const next = pane.clientHeight ? container.clientHeight : 0;
    if (!next) { height = 0; return; }
    if (height && next !== height) {
      pane.scrollTo({ top: Math.max(0, top + space(next) - space(height)), behavior: "instant" });
    }
    height = next;
    top = pane.scrollTop;
  });
  observer.observe(container);
  if (container !== pane) observer.observe(pane);
  pane.addEventListener("scroll", onScroll, { passive: true });
  return () => { observer.disconnect(); pane.removeEventListener("scroll", onScroll); };
}
