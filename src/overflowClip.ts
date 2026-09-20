/** Visible viewport for an overlay drawn outside an element's DOM ancestors. */
export function overflowClip(element: Element, width: number, height: number) {
  let left = 0;
  let top = 0;
  let right = width;
  let bottom = height;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const rect = parent.getBoundingClientRect();
    // The client box excludes borders and scrollbars; scrolling is already
    // reflected in the target's bounding rect.
    const x = rect.left + parent.clientLeft;
    const y = rect.top + parent.clientTop;
    if (clipsX) {
      left = Math.max(left, x);
      right = Math.min(right, x + parent.clientWidth);
    }
    if (clipsY) {
      top = Math.max(top, y);
      bottom = Math.min(bottom, y + parent.clientHeight);
    }
  }
  return { left, top, right, bottom };
}
