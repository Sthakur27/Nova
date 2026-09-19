export type PanelSide = "left" | "right";
export type PanelWidths = Record<PanelSide, number>;
export const panelMinimums: PanelWidths = { left: 180, right: 200 };
export const panelMaximum = 480;
export const editorMinimum = 360;

export function defaultPanelWidths(width: number): PanelWidths {
  return width <= 900 ? { left: 185, right: 200 }
    : width <= 1100 ? { left: 215, right: 225 } : { left: 244, right: 260 };
}

export function fitPanelWidths(preferred: PanelWidths, width: number, left: boolean, right: boolean): PanelWidths {
  const result = {
    left: Math.max(panelMinimums.left, Math.min(panelMaximum, preferred.left)),
    right: Math.max(panelMinimums.right, Math.min(panelMaximum, preferred.right)),
  };
  const spareLeft = left ? result.left - panelMinimums.left : 0;
  const spareRight = right ? result.right - panelMinimums.right : 0;
  const excess = Math.max(0, (left ? result.left : 0) + (right ? result.right : 0) + editorMinimum - width);
  const spare = spareLeft + spareRight;
  if (spare > 0 && excess > 0) {
    const fraction = Math.min(1, excess / spare);
    result.left -= spareLeft * fraction;
    result.right -= spareRight * fraction;
  }
  return result;
}
