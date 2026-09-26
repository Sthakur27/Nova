import { expect, it } from "vitest";
import { parseSavedStates, savedStateShortcut, sameStateLayout, suggestedStateName, type SavedState } from "./savedStates";
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

it("ignores appearance and view-mode settings from older saved states", () => {
  const legacy = { ...state, appearance: { focusMode: true, rail: false, backgroundMode: "off" },
    views: { [ids[0]]: { mode: "read", scrollTop: 820 }, [ids[1]]: { mode: "source", scrollTop: 1430 } } };
  const restored = parseSavedStates(JSON.stringify([legacy]))[0]!;
  expect(restored).toEqual(state);
  expect(restored).not.toHaveProperty("appearance");
  expect(restored.views[ids[0]]).not.toHaveProperty("mode");
});

it("suggests a name from visible notes rather than hidden tabs", () => {
  expect(suggestedStateName([...tabs, { root: "cloud-a", path: "hidden.md", pinned: true }], layout)).toBe("work + personal");
  expect(suggestedStateName([], initialPane())).toBe("My layout");
});
