import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNote, demoWorkspace, renameNote, saveBookmarks, saveNote, searchNotes } from "./storage";

const originalFiles = [...demoWorkspace.files];

beforeEach(() => {
  demoWorkspace.files = [...originalFiles];
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
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

it("lists every bookmark without the search cap or text results", async () => {
  const marks = Array.from({ length: 85 }, (_, i) => ({
    id: `mark-${i}`, name: `Place ${i}`, from: 0, to: 7, quote: "An open",
  }));
  await saveBookmarks("demo", "Scratchpad.txt", marks);
  const result = await searchNotes([demoWorkspace], "");
  expect(result.bookmarks.filter((hit) => hit.path === "Scratchpad.txt")).toHaveLength(85);
  expect(result.bookmarks.some((hit) => hit.path === "Getting started.md")).toBe(true);
  expect(result.hits).toEqual([]);
  expect((await searchNotes([], "")).bookmarks).toEqual([]);
});

it("searches created and renamed notes without returning the old path", async () => {
  const path = await createNote("demo");
  await saveNote("demo", path, "unique new passage", "");
  await saveBookmarks("demo", path, [{ id: "created", name: "New marker", from: 0, to: 6, quote: "unique" }]);
  expect((await searchNotes([demoWorkspace], "unique new")).hits.map(hit => hit.path)).toEqual([path]);
  const renamed = await renameNote("demo", path, "Renamed.md");
  expect((await searchNotes([demoWorkspace], "unique new")).hits.map(hit => hit.path)).toEqual([renamed]);
  expect((await searchNotes([demoWorkspace], "new marker")).bookmarks.map(hit => hit.path)).toEqual([renamed]);
  await renameNote("demo", "Getting started.md", "Welcome.md");
  const all = await searchNotes([demoWorkspace], "");
  expect(all.bookmarks.some(hit => hit.path === "Getting started.md")).toBe(false);
  expect(all.bookmarks.some(hit => hit.path === "Welcome.md")).toBe(true);
});
