import { describe, expect, it } from "vitest";
import { setSyncChoice, syncIncluded, syncEntries } from "./syncPolicy";
describe("sync selection", () => {
  it("defaults to local and follows the nearest ancestor, including new notes", () => {
    expect(syncIncluded(undefined, "work/new.md")).toBe(false);
    let policy = setSyncChoice(undefined, "", "include");
    policy = setSyncChoice(policy, "work", "exclude");
    policy = setSyncChoice(policy, "work/shared", "include");
    expect(syncIncluded(policy, "work/new.md")).toBe(false);
    expect(syncIncluded(policy, "work/shared/new.md")).toBe(true);
    expect(syncIncluded(policy, "workshop/new.md")).toBe(true);
  });
  it("preserves explicit exceptions when parent defaults change", () => {
    let policy = setSyncChoice(undefined, "private.md", "exclude");
    policy = setSyncChoice(policy, "", "include");
    expect(syncIncluded(policy, "private.md")).toBe(false);
    policy = setSyncChoice(policy, "private.md", "inherit");
    expect(syncIncluded(policy, "private.md")).toBe(true);
  });
  it("lists intermediate folders before their children", () => {
    expect(syncEntries(["a/b/c.md", "a/z.md"])).toEqual([
      { path: "a", directory: true }, { path: "a/b", directory: true },
      { path: "a/b/c.md", directory: false }, { path: "a/z.md", directory: false },
    ]);
  });
});
