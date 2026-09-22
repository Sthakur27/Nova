import { describe, it, expect } from "vitest";
import { addFolders, parsePreferences } from "./folders";
const a = { root: "/a", name: "Notes", files: [] },
  b = { root: "/b", name: "Notes", files: [] };
describe("multiple folders", () => {
  it("keeps existing folders and deduplicates by root, not label", () => {
    expect(addFolders([a], [a, b, b])).toEqual([a, b]);
  });
  it("retains empty explorer, collapse state, active root and editing mode", () => {
    expect(parsePreferences({ folders: [], mode: "source" })).toEqual({
      folders: [],
      active: null,
      mode: "source",
    });
    expect(
      parsePreferences({
        folders: [{ ...a, collapsed: true }, b],
        active: { root: b.root, path: "same.md" },
        mode: "edit",
      })?.active?.root,
    ).toBe(b.root);
    expect(
      parsePreferences({ folders: [{ ...a, collapsed: true }] })?.folders[0]
        .collapsed,
    ).toBe(true);
  });
  it("rejects invalid preferences and deduplicates persisted roots", () => {
    expect(parsePreferences(null)).toBeNull();
    expect(parsePreferences({ folders: "oops" })).toBeNull();
    expect(
      parsePreferences({ folders: [a, a, null], mode: "invalid" })?.folders,
    ).toHaveLength(1);
  });
});
