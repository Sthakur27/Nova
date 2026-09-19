import { describe, expect, it } from "vitest";
import { fitPanelWidths } from "./panelWidths";

describe("panel width constraints", () => {
  it("protects editor space when both saved panels are wide", () => {
    const result = fitPanelWidths({ left: 480, right: 480 }, 760, true, true);
    expect(result.left).toBeGreaterThanOrEqual(180);
    expect(result.right).toBeGreaterThanOrEqual(200);
    expect(result.left + result.right).toBeCloseTo(400);
  });
  it("only budgets for visible panels", () => {
    expect(fitPanelWidths({ left: 480, right: 480 }, 760, true, false)).toEqual({ left: 400, right: 480 });
    expect(fitPanelWidths({ left: 480, right: 480 }, 760, false, true)).toEqual({ left: 480, right: 400 });
  });
  it("preserves preferred widths for a larger window without mutating them", () => {
    const preferred = { left: 350, right: 400 };
    fitPanelWidths(preferred, 760, true, true);
    expect(fitPanelWidths(preferred, 1400, true, true)).toEqual(preferred);
  });
  it("bounds out-of-range preferences", () => {
    expect(fitPanelWidths({ left: -20, right: 9999 }, 1400, true, true)).toEqual({ left: 180, right: 480 });
  });
});
