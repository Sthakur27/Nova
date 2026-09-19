import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { searchMatches } from "./editorSearch";

describe("in-note match counts", () => {
  const state = EditorState.create({ doc: "Note note notebook\nbanana" });
  it("respects case and whole-word options", () => {
    expect(searchMatches(state, new SearchQuery({ search: "note" }))).toHaveLength(3);
    expect(searchMatches(state, new SearchQuery({ search: "note", caseSensitive: true }))).toHaveLength(2);
    expect(searchMatches(state, new SearchQuery({ search: "note", wholeWord: true }))).toHaveLength(2);
  });
  it("counts overlapping matches that next/previous can visit", () => {
    expect(searchMatches(state, new SearchQuery({ search: "ana" }))).toEqual([{ from: 20, to: 23 }, { from: 22, to: 25 }]);
  });
  it("handles regex, invalid patterns, empty queries and no results", () => {
    expect(searchMatches(state, new SearchQuery({ search: "n.te", regexp: true }))).toHaveLength(3);
    for (const search of ["", "[", "missing"])
      expect(searchMatches(state, new SearchQuery({ search, regexp: true }))).toEqual([]);
  });
});
