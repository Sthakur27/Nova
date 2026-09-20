/** Capture before editors and terminals handle the keystroke. */
export function installTabCloseShortcut(target: Window, mac: boolean, close: () => void) {
  const key = (event: KeyboardEvent) => {
    const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (event.key.toLowerCase() !== "w" || !modifier || event.shiftKey || event.altKey || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) close();
  };
  target.addEventListener("keydown", key, { capture: true });
  return () => target.removeEventListener("keydown", key, { capture: true });
}
