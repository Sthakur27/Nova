import { it, expect } from "vitest";
import { openTab, pinTab, tabId, type NoteTab } from "./tabs";
const a: NoteTab = { root: "/one", path: "a.md", pinned: false },
  b: NoteTab = { root: "/one", path: "b.md", pinned: false };
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
