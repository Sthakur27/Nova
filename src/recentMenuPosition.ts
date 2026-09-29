export function recentMenuPosition(anchor: Pick<DOMRect, "right" | "top" | "bottom">, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const left = Math.max(8, Math.min(anchor.right - width, viewportWidth - width - 8));
  const below = anchor.bottom + 6;
  const preferred = below + height <= viewportHeight - 8 ? below : anchor.top - height - 6;
  return { left, top: Math.max(8, Math.min(preferred, viewportHeight - height - 8)) };
}
