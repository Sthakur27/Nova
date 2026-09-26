// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FocusStateNav from "./FocusStateNav";
import type { SavedState } from "./savedStates";
const id = JSON.stringify(["cloud", "work.md"]);
const state: SavedState = { name: "Work", tabs: [{ root: "cloud", path: "work.md", pinned: true }], activePane: "main",
  layout: { kind: "pane", id: "main", tabs: [id], selected: id }, views: {} };
it("reveals state navigation on keyboard focus, restores and saves inline, and dismisses with Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onRestore = vi.fn(async () => {}), onQuickSave = vi.fn(() => true);
  try {
    await act(async () => root.render(<FocusStateNav slots={[state, ...Array(8).fill(null)]} previousState={state}
      suggestedName="Work + personal" error="" onRestore={onRestore} onQuickSave={onQuickSave} />));
    const trigger = host.querySelector('[aria-label="Show saved states"]') as HTMLButtonElement;
    const popover = host.querySelector('#focus-state-popover') as HTMLDivElement;
    expect(popover.hidden).toBe(true);
    await act(async () => trigger.focus());
    expect(popover.hidden).toBe(false);
    await act(async () => (host.querySelector('[aria-label="Restore Previous state"]') as HTMLButtonElement).click());
    expect(onRestore).toHaveBeenCalledWith("previous");
    await act(async () => (host.querySelector('[aria-label="Restore Work"]') as HTMLButtonElement).click());
    expect(onRestore).toHaveBeenCalledWith(0);
    const save = host.querySelector('.focus-state-save') as HTMLButtonElement;
    await act(async () => { save.focus(); save.click(); });
    expect(onQuickSave).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Saved “Work + personal”');
    await act(async () => save.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(popover.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    expect(popover.hidden).toBe(false);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
it("disables quick save when all slots are occupied and exposes errors inline", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onQuickSave = vi.fn(() => true);
  try {
    await act(async () => root.render(<FocusStateNav slots={Array(9).fill(state)} previousState={null}
      suggestedName="Work" error="Unable to preserve a draft." onRestore={async () => {}} onQuickSave={onQuickSave} />));
    await act(async () => (host.querySelector('.focus-state-trigger') as HTMLButtonElement).focus());
    const save = host.querySelector('.focus-state-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await act(async () => save.click());
    expect(onQuickSave).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Unable to preserve a draft.");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
