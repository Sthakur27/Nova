import { it, expect } from "vitest";
import { openTab, pinTab, reorderTab, tabId, type NoteTab } from "./tabs";
const a: NoteTab = { root: "/one", path: "a.md", pinned: false },
  b: NoteTab = { root: "/one", path: "b.md", pinned: false };
it("reorders in both directions without changing tab identity or preview state", () => {
  const c = { ...a, root: "/two", pinned: true };
  const tabs = [a, b, c];
  expect(reorderTab(tabs, tabId(a), null)).toEqual([b, c, a]);
  expect(reorderTab(tabs, tabId(c), tabId(a))).toEqual([c, a, b]);
  expect(reorderTab(tabs, tabId(c), tabId(b))).toEqual([a, c, b]);
  expect(reorderTab(tabs, tabId(a), tabId(b))).toBe(tabs);
  expect(reorderTab(tabs, tabId(a), "closed")).toBe(tabs);
  expect(reorderTab(tabs, "closed", null)).toBe(tabs);
  expect(tabs).toEqual([a, b, c]);
});
it("replaces only the flexible tab when browsing", () => {
  expect(openTab([a], b)).toEqual([b]);
  expect(openTab([{ ...a, pinned: true }, b], { ...a, path: "c.md" })).toEqual([
    { ...a, pinned: true },
    { ...a, path: "c.md" },
  ]);
});
it("pinning leaves room for a new preview without duplicating existing tabs", () => {
  const pinned = pinTab([a], tabId(a));
  expect(openTab(pinned, b)).toEqual([{ ...a, pinned: true }, b]);
  expect(openTab([...pinned, b], a)).toEqual([...pinned, b]);
});
it("double-click upgrades an existing preview and distinguishes folders", () => {
  expect(openTab([a], { ...a, pinned: true })).toEqual([
    { ...a, pinned: true },
  ]);
  expect(
    openTab([{ ...a, pinned: true }], { ...a, root: "/two" }),
  ).toHaveLength(2);
});

it("only replaces the preview within the focused editor group", () => {
  const a = { root: "r", path: "a", pinned: false }, b = { root: "r", path: "b", pinned: false }, c = { root: "r", path: "c", pinned: false };
  expect(openTab([a, b], c, new Set([tabId(b)]))).toEqual([a, c]);
});
