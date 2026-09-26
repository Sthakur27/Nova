import { parsePaneLayout, paneLeaves, type PaneNode } from "./paneLayout";
import { tabId, type NoteTab } from "./tabs";

export const savedStatesKey = "nova:saved-states:v1";
export type SavedState = {
  name: string; tabs: NoteTab[]; layout: PaneNode; activePane: string;
  views: Record<string, { scrollTop: number }>;
};
export function parseSavedStates(raw: string | null): (SavedState | null)[] {
  const slots: (SavedState | null)[] = Array(9).fill(null);
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return slots;
    values.slice(0, 9).forEach((value, i) => {
      if (!value || typeof value !== "object") return;
      const s = value as SavedState;
      if (typeof s.name !== "string" || !s.name.trim() || !Array.isArray(s.tabs) || !s.tabs.length || s.tabs.length > 500) return;
      if (!s.tabs.every(t => t && typeof t.root === "string" && typeof t.path === "string")) return;
      const tabs = s.tabs.map(t => ({ root: t.root, path: t.path, pinned: true }));
      if (new Set(tabs.map(tabId)).size !== tabs.length) return;
      const layout = parsePaneLayout(s.layout, tabs.map(tabId));
      if (!layout) return;
      const views: SavedState["views"] = {};
      for (const t of tabs) {
        const id = tabId(t), view = s.views?.[id];
        if (view && typeof view === "object") views[id] = {
          scrollTop: Number.isFinite(view.scrollTop) ? Math.max(0, view.scrollTop) : 0,
        };
      }
      slots[i] = { name: s.name.slice(0, 100), tabs, layout, views,
        activePane: paneLeaves(layout).some(p => p.id === s.activePane) ? s.activePane : paneLeaves(layout)[0].id };
    });
  } catch { /* Invalid preferences must not prevent opening notes. */ }
  return slots;
}
export function savedStateShortcut(event: KeyboardEvent): number | "manager" | "previous" | null {
  if (event.repeat || event.isComposing || !(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) return null;
  // Physical codes also work when Option changes the typed character on macOS.
  if (event.code === "Digit0") return "previous";
  if (event.code === "KeyS") return "manager";
  return /^Digit[1-9]$/.test(event.code) ? Number(event.code.slice(-1)) - 1 : null;
}

/** Scrolling/typing within a saved layout does not replace the unsaved return point.
 * Navigation and pane changes create a new flex layout. */
export function sameStateLayout(current: SavedState, saved: SavedState | null): boolean {
  if (!saved) return false;
  return JSON.stringify(current.layout) === JSON.stringify(saved.layout)
    && current.activePane === saved.activePane
    && JSON.stringify(current.tabs.map(tabId)) === JSON.stringify(saved.tabs.map(tabId));
}

export function suggestedStateName(tabs: NoteTab[], layout: PaneNode): string {
  const selected = new Set(paneLeaves(layout).map(pane => pane.selected));
  const names = tabs.filter(tab => selected.has(tabId(tab))).map(tab => {
    const filename = tab.path.split("/").at(-1) ?? "";
    return filename.replace(/\.[^.]+$/, "") || filename;
  }).filter(Boolean);
  return (names.join(" + ") || "My layout").slice(0, 100);
}
