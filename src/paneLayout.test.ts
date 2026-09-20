import { describe, expect, it } from "vitest";
import { initialPane, mapPane, movePaneTab, paneLeaves, parsePaneLayout, reconcilePanes, selectPaneTab } from "./paneLayout";
const setup = () => reconcilePanes(initialPane(), ["a", "b", "c"], "main");
describe("editor groups", () => {
  it.each(["left", "right", "top", "bottom"] as const)("splits %s and retains the source selection", edge => {
    const layout = movePaneTab(selectPaneTab(setup(), "main", "b"), "b", "main", edge, null, "other");
    expect(layout.kind).toBe("split");
    if (layout.kind !== "split") return;
    expect(layout.axis).toBe(edge === "left" || edge === "right" ? "horizontal" : "vertical");
    expect(paneLeaves(layout).find(p => p.id === "main")).toMatchObject({ tabs: ["a", "c"], selected: "c" });
    expect(paneLeaves(layout).find(p => p.id === "other")).toMatchObject({ tabs: ["b"], selected: "b" });
  });
  it("moves between groups, reorders, and collapses an emptied source", () => {
    let layout = movePaneTab(setup(), "b", "main", "right", null, "other");
    layout = movePaneTab(layout, "c", "other", undefined, "b");
    expect(paneLeaves(layout).find(p => p.id === "other")?.tabs).toEqual(["c", "b"]);
    layout = movePaneTab(layout, "a", "other");
    expect(layout).toMatchObject({ kind: "pane", id: "other", tabs: ["c", "b", "a"] });
    layout = movePaneTab(layout, "a", "other", undefined, "c");
    expect(paneLeaves(layout)[0].tabs).toEqual(["a", "c", "b"]);
  });
  it("does not split a lone tab into an empty group", () => {
    const layout = reconcilePanes(initialPane(), ["a"], "main");
    expect(movePaneTab(layout, "a", "main", "bottom")).toBe(layout);
    expect(movePaneTab(layout, "missing", "main", "bottom")).toBe(layout);
  });
  it("creates nested splits and closes the last tab without orphaning groups", () => {
    const layout = movePaneTab(movePaneTab(setup(), "c", "main", "right", null, "other"), "b", "main", "bottom", null, "third");
    const next = reconcilePanes(layout, ["a", "c"], "main");
    expect(paneLeaves(next).map(p => p.id)).toEqual(["main", "other"]);
    expect(reconcilePanes(next, [], "main")).toEqual(initialPane());
  });
  it("puts new files in the focused group and preserves ratios on restore", () => {
    let layout = movePaneTab(setup(), "c", "main", "right", null, "other");
    layout = mapPane(layout, layout.id, n => n.kind === "split" ? { ...n, ratio: .3 } : n);
    layout = reconcilePanes(layout, ["a", "b", "c", "d"], "other");
    expect(paneLeaves(layout)[1].tabs).toEqual(["c", "d"]);
    expect(parsePaneLayout(JSON.parse(JSON.stringify(layout)), ["a", "b", "c", "d"])).toEqual(layout);
  });
  it("rejects malformed session trees and removes stale or duplicate tabs", () => {
    expect(parsePaneLayout({ kind: "split" }, [])).toBeUndefined();
    expect(parsePaneLayout({ kind: "pane", id: "p", tabs: ["a", "a", "missing"], selected: "missing" }, ["a"])).toEqual({ kind: "pane", id: "p", tabs: ["a"], selected: "a" });
  });
});
