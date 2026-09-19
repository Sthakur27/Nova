import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoWorkspace, saveBookmarks, searchNotes } from "./storage";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("finds user bookmark names and excerpts, then reflects rename and removal", async () => {
  const path = "Scratchpad.txt";
  const mark = { id: "mine", name: "Unique destination", from: 0, to: 5, quote: "An open" };
  await saveBookmarks("demo", path, [mark]);
  const search = (query: string) => searchNotes([demoWorkspace], query);
  expect((await search("UNIQUE DESTINATION")).bookmarks).toEqual([
    expect.objectContaining({ root: "demo", path, bookmark: expect.objectContaining({ id: "mine" }) }),
  ]);
  expect((await search("an open")).bookmarks.some((h) => h.bookmark.id === "mine")).toBe(true);
  await saveBookmarks("demo", path, [{ ...mark, name: "New destination" }]);
  expect((await search("unique destination")).bookmarks).toEqual([]);
  expect((await search("new destination")).bookmarks).toHaveLength(1);
  await saveBookmarks("demo", path, []);
  expect((await search("new destination")).bookmarks).toEqual([]);
});
