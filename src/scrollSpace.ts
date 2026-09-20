// Match --scroll-before in style.css so notes open at their normal top inset.
export function initialScrollTop(pane: HTMLElement, mobile: boolean) {
  const space = mobile ? parseFloat(getComputedStyle(pane).getPropertyValue("--mobile-scroll-space")) : NaN;
  return Number.isFinite(space) ? space : Math.max(0, pane.clientHeight - 160);
}
