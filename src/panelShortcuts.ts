export type PanelDirection = "left" | "right" | "top" | "bottom";
const directions: Record<string, PanelDirection | undefined> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "bottom",
};

/** Capture before the editor or terminal consumes the panel shortcut. */
export function installPanelShortcuts(target: Window, mac: boolean, toggle: (panel: PanelDirection) => void) {
  const key = (event: KeyboardEvent) => {
    const panel = directions[event.key];
    const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!panel || !modifier || event.altKey || event.shiftKey || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) toggle(panel);
  };
  target.addEventListener("keydown", key, { capture: true });
  return () => target.removeEventListener("keydown", key, { capture: true });
}
