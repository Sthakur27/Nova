/** Capture before editor bindings so workspace search works from every pane. */
export function installWorkspaceSearchShortcut(target: Window, mac: boolean, open: () => void) {
  const key = (event: KeyboardEvent) => {
    const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!modifier || event.key.toLowerCase() !== "f" || !event.shiftKey || event.altKey || event.isComposing || event.defaultPrevented) return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) open();
  };
  target.addEventListener("keydown", key, {capture: true});
  return () => target.removeEventListener("keydown", key, {capture: true});
}
