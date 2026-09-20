// Match --scroll-before in style.css so notes open at their normal top inset.
export function initialScrollTop(pane: HTMLElement, mobile: boolean) {
  return mobile ? 0 : Math.max(0, pane.clientHeight - 160);
}
