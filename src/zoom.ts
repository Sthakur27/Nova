// Capture shortcuts before the editor or a dialog can consume them.
export function installZoomShortcuts(
  target: Window,
  setZoom: (factor: number) => Promise<void>,
  onError: (error: unknown) => void,
) {
  let percent = 100;
  let pending = Promise.resolve();
  const key = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return;
    const direction = event.key === "+" || event.key === "=" ? 1
      : event.key === "-" ? -1 : event.key === "0" ? 0 : null;
    if (direction === null) return;
    event.preventDefault();
    event.stopPropagation();
    // Serialize native calls so rapid key repeats cannot apply out of order.
    pending = pending.then(async () => {
      const next = direction === 0 ? 100 : Math.max(50, Math.min(200, percent + direction * 10));
      if (next === percent) return;
      await setZoom(next / 100);
      percent = next;
    }).catch(onError);
  };
  target.addEventListener("keydown", key, { capture: true });
  return () => target.removeEventListener("keydown", key, { capture: true });
}
