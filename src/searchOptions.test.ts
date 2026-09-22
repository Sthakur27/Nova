import { expect, it } from "vitest";
import { defaultSearchOptions as defaults, searchMatcher } from "./searchOptions";
import { searchCurrentNote } from "./currentSearch";

it("combines case, whole words, regex, and exact current-note offsets", () => {
  const options = { ...defaults, caseSensitive: true, wholeWord: true, regexp: true };
  const note = { root: "/notes", path: "draft.md", bookmarks: [], text: "Cat cat cats cot" };
  expect(searchCurrentNote(note, "c[ao]t", options).map(hit => [hit.from, hit.to])).toEqual([[4, 7], [13, 16]]);
  expect(searchCurrentNote(note, "[", defaults)).toEqual([]);
  expect(() => searchMatcher("[", options)).toThrow();
});
it("matches comma-separated globs at the root and in nested folders with exclusions winning", () => {
  const matcher = searchMatcher("", { ...defaults, include: "**/*.md, *.txt", exclude: "archive, **/draft?.md" });
  expect(["note.md", "notes/note.md", "note.txt", "notes/deep/note.txt"].every(matcher.acceptsPath)).toBe(true);
  expect(["note.ts", "archive/note.md", "notes/archive/note.md", "draft1.md", "notes/draft2.md"].some(matcher.acceptsPath)).toBe(false);
  expect(searchMatcher("", { ...defaults, include: "notes/**" }).acceptsPath("other/notes/a.md")).toBe(false);
});
it("filters current text before collecting matches and safely bounds zero-width matches", () => {
  const note = { root: "/notes", path: "archive/draft.md", bookmarks: [], text: "a".repeat(100) };
  expect(searchCurrentNote(note, "a", { ...defaults, exclude: "archive" })).toEqual([]);
  expect(searchCurrentNote(note, "a*", { ...defaults, regexp: true }).length).toBeLessThanOrEqual(80);
});
