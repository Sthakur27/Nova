import { it, expect } from "vitest";
import { searchCurrentNote, type CurrentNote } from "./currentSearch";
const note = (text: string): CurrentNote => ({
  root: "/a",
  path: "note.md",
  text,
  bookmarks: [],
});
it("searches the supplied live text with exact offsets and repeated matches", () => {
  const n = note("saved\nUNSAVED unsaved");
  expect(
    searchCurrentNote(n, "unsaved").map((h) => [h.line, h.from, h.to]),
  ).toEqual([
    [2, 6, 13],
    [2, 14, 21],
  ]);
});
it("treats regex punctuation literally", () => {
  expect(searchCurrentNote(note("a.b aXb [x]"), "a.b")).toHaveLength(1);
  expect(searchCurrentNote(note("[x]"), "[x]")[0].from).toBe(0);
});
it("keeps UTF-16 offsets correct after emoji and Unicode case matches", () => {
  const n = note("😀 abc\nİ ABC");
  for (const hit of searchCurrentNote(n, "abc"))
    expect(n.text.slice(hit.from, hit.to).toLowerCase()).toBe("abc");
  expect(searchCurrentNote(n, "abc")[1].from).toBe(9);
});
it("ignores empty queries, bounds results and previews long lines around a match", () => {
  expect(searchCurrentNote(note("abc"), " ")).toEqual([]);
  expect(searchCurrentNote(note("x ".repeat(200)), "x")).toHaveLength(80);
  expect(
    searchCurrentNote(note("a".repeat(1000) + "needle"), "needle")[0].snippet,
  ).toContain("needle");
});
