import { expect, it } from "vitest";
import { parseSavedStates, savedStatesKey, savedStatesStorageKey, readSavedStates, savedStateShortcut, sameStateLayout, suggestedStateName, reorderSavedStates, type SavedState } from "./savedStates";
import { initialPane, movePaneTab, reconcilePanes } from "./paneLayout";
import { tabId } from "./tabs";

const tabs = [{ root: "cloud-a", path: "work.md", pinned: true }, { root: "cloud-b", path: "personal.md", pinned: true }];
const ids = tabs.map(tabId);
const layout = movePaneTab(reconcilePanes(initialPane(), ids, "main"), ids[1], "main", "right", null, "personal");
const state: SavedState = { name: "Work + personal", tabs, layout, activePane: "personal", views: {
  [ids[0]]: { scrollTop: 820 }, [ids[1]]: { scrollTop: 1430 },
} };
it("round-trips separate Cloud roots, splits, active pane, and independent positions", () => {
  const restored = parseSavedStates(JSON.stringify([state]));
  expect(restored).toHaveLength(9);
  expect(restored[0]).toEqual(state);
  expect(restored.slice(1)).toEqual(Array(8).fill(null));
});
it("keeps slot numbers stable through deletion and rejects damaged entries", () => {
  const restored = parseSavedStates(JSON.stringify([null, { ...state, tabs: [tabs[0], tabs[0]] }, state]));
  expect(restored[0]).toBeNull(); expect(restored[1]).toBeNull(); expect(restored[2]).toEqual(state);
  expect(parseSavedStates("not json")).toEqual(Array(9).fill(null));
});
it("validates positions, active pane and layout without trusting saved storage", () => {
  const restored = parseSavedStates(JSON.stringify([{ ...state, activePane: "gone", views: { [ids[0]]: { scrollTop: -100 } } }]))[0]!;
  expect(restored.activePane).toBe("main");
  expect(restored.views[ids[0]].scrollTop).toBe(0);
  expect(parseSavedStates(JSON.stringify([{ ...state, layout: { kind: "split" } }]))[0]).toBeNull();
});
it("recognizes physical Option digits and ignores repeated, composing, or unrelated shortcuts", () => {
  const key = { metaKey: true, altKey: true, code: "Digit2", key: "™" } as KeyboardEvent;
  expect(savedStateShortcut(key)).toBe(1);
  expect(savedStateShortcut({ ...key, code: "KeyS" } as KeyboardEvent)).toBe("manager");
  for (const extra of [{ repeat: true }, { isComposing: true }, { altKey: false }, { shiftKey: true }])
    expect(savedStateShortcut({ ...key, ...extra } as KeyboardEvent)).toBeNull();
});

it("keeps the flex return point while browsing saved layouts, but detects navigation", () => {
  expect(sameStateLayout(state, null)).toBe(false);
  expect(sameStateLayout({ ...state, views: { ...state.views, [ids[0]]: { scrollTop: 20 } } }, state)).toBe(true);
  expect(sameStateLayout({ ...state, activePane: "main" }, state)).toBe(false);
  expect(sameStateLayout({ ...state, tabs: [...tabs, { root: "cloud-a", path: "other.md", pinned: true }] }, state)).toBe(false);
  expect(savedStateShortcut({ metaKey: true, altKey: true, code: "Digit0" } as KeyboardEvent)).toBe("previous");
});

it("round-trips per-note view modes while ignoring appearance", () => {
  for (const mode of ["source", "edit", "read"] as const) {
    const withModes = { ...state, views: { [ids[0]]: { mode, scrollTop: 820 }, [ids[1]]: { mode: "read" as const, scrollTop: 1430 } } };
    const restored = parseSavedStates(JSON.stringify([{ ...withModes, appearance: { focusMode: true } }]))[0]!;
    expect(restored).toEqual(withModes);
    expect(restored).not.toHaveProperty("appearance");
  }
});
it("leaves old or invalid view modes unspecified for the current-mode fallback", () => {
  const restored = parseSavedStates(JSON.stringify([{ ...state, views: {
    [ids[0]]: { mode: "invalid", scrollTop: 820 }, [ids[1]]: { scrollTop: 1430 },
  } }]))[0]!;
  expect(restored).toEqual(state);
});
it("detects mode changes as a new flex layout while ignoring scroll changes", () => {
  const saved = { ...state, views: { [ids[0]]: { mode: "source" as const, scrollTop: 820 } } };
  expect(sameStateLayout({ ...saved, views: { [ids[0]]: { mode: "source", scrollTop: 10 } } }, saved)).toBe(true);
  expect(sameStateLayout({ ...saved, views: { [ids[0]]: { mode: "read", scrollTop: 820 } } }, saved)).toBe(false);
});

it("suggests a name from visible notes rather than hidden tabs", () => {
  expect(suggestedStateName([...tabs, { root: "cloud-a", path: "hidden.md", pinned: true }], layout)).toBe("work + personal");
  expect(suggestedStateName([], initialPane())).toBe("My layout");
});

it("reorders occupied slots while preserving holes and state data", () => {
  const second = { ...state, name: "Second" }, third = { ...state, name: "Third" };
  const slots = [state, null, second, third, ...Array(5).fill(null)];
  const moved = reorderSavedStates(slots, 3, 0);
  expect(moved.slice(0, 4)).toEqual([third, null, state, second]);
  expect(moved[0]).toBe(third);
  expect(slots[0]).toBe(state);
  expect(reorderSavedStates(moved, 0, null)).toEqual(slots);
  expect(reorderSavedStates(slots, 1, 0)).toBe(slots);
  expect(reorderSavedStates(slots, 0, 1)).toBe(slots);
});

const cloudFolders = [{ root: "cloud-a", cloudSpace: {} }, { root: "cloud-b", cloudSpace: {} }];
const folderA = [...cloudFolders, { root: "/notes/a" }];
const folderB = [...cloudFolders, { root: "/notes/b" }];
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}
function localState(root: string): SavedState {
  const tabs = [{ root, path: "note.md", pinned: true }];
  return { name: root, tabs, layout: reconcilePanes(initialPane(), tabs.map(tabId), "main"), activePane: "main", views: {} };
}
it("keeps independent slots across folder switches, Cloud-only windows, and reloads", () => {
  const storage = memoryStorage();
  const a = localState("/notes/a"), b = localState("/notes/b");
  for (const [folders, value] of [[folderA, a], [folderB, b], [cloudFolders, state]] as const)
    storage.setItem(savedStatesStorageKey([...folders]), JSON.stringify([value]));
  expect(readSavedStates(storage, folderA)[0]).toEqual(a);
  expect(readSavedStates(storage, folderB)[0]).toEqual(b);
  expect(readSavedStates(storage, cloudFolders)[0]).toEqual(state);
  storage.setItem(savedStatesStorageKey(folderB), JSON.stringify([]));
  expect(readSavedStates(storage, folderB).every(slot => slot === null)).toBe(true);
  expect(readSavedStates(storage, folderA)[0]).toEqual(a);
  expect(readSavedStates(storage, cloudFolders)[0]).toEqual(state);
});
it("keeps the folder scope stable across Cloud refreshes and folder ordering", () => {
  expect(savedStatesStorageKey(folderA)).toBe(savedStatesStorageKey([{ root: "/notes/a" }]));
  expect(savedStatesStorageKey(folderA)).toBe(savedStatesStorageKey([...folderA].reverse()));
  expect(savedStatesStorageKey(cloudFolders)).toBe(savedStatesStorageKey([]));
  expect(savedStatesStorageKey(folderA)).not.toBe(savedStatesStorageKey(folderB));
});
it("recovers compatible legacy slots without exposing other folders or resurrecting deleted states", () => {
  const storage = memoryStorage();
  const a = localState("/notes/a"), b = localState("/notes/b");
  storage.setItem(savedStatesKey, JSON.stringify([a, state, b]));
  expect(readSavedStates(storage, folderA).slice(0, 3)).toEqual([a, null, null]);
  expect(readSavedStates(storage, folderB).slice(0, 3)).toEqual([null, null, b]);
  expect(readSavedStates(storage, cloudFolders).slice(0, 3)).toEqual([null, state, null]);
  storage.setItem(savedStatesStorageKey(folderA), JSON.stringify([]));
  expect(readSavedStates(storage, folderA).every(slot => slot === null)).toBe(true);
  expect(readSavedStates(storage, folderB)[2]).toEqual(b);
  expect(JSON.parse(storage.getItem(savedStatesKey)!)).toEqual([a, state, b]);
});
it("keeps Cloud-only layouts saved in a Local context with that folder", () => {
  const storage = memoryStorage();
  storage.setItem(savedStatesStorageKey(folderA), JSON.stringify([state]));
  expect(readSavedStates(storage, folderA)[0]).toEqual(state);
  expect(readSavedStates(storage, folderB)[0]).toBeNull();
  expect(readSavedStates(storage, cloudFolders)[0]).toBeNull();
});
