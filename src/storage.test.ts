import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { discardEmptyUntitled, moveNote, deleteNote, readNote, createNote, demoWorkspace, openWorkspace, setFileStar, renameNote, saveBookmarks, saveNote, searchNotes } from "./storage";

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

it("persists stars across reopening, follows renames, and removes stars", async () => {
  await setFileStar("demo", "Scratchpad.txt", true);
  expect((await openWorkspace("demo")).starred).toEqual(["Scratchpad.txt"]);
  await setFileStar("demo", "Scratchpad.txt", true);
  const renamed = await renameNote("demo", "Scratchpad.txt", "Renamed.txt");
  expect((await openWorkspace("demo")).starred).toEqual([renamed]);
  await setFileStar("demo", renamed, false);
  expect((await openWorkspace("demo")).starred).toEqual([]);
});

it("moves notes with their bookmarks and stars, rejects collisions, and deletes cleanly", async () => {
  demoWorkspace.files.push({ path: "Destination/existing.md", name: "existing.md" });
  const path = await createNote("demo");
  await saveNote("demo", path, "hello", "");
  await saveBookmarks("demo", path, [{ id: "move", name: "Greeting", from: 0, to: 5, quote: "hello" }]);
  await setFileStar("demo", path, true);
  await expect(moveNote("demo", path, "../outside")).rejects.toThrow();
  const next = await moveNote("demo", path, "Destination");
  expect((await readNote("demo", next)).text).toBe("hello");
  expect((await readNote("demo", next)).bookmarks[0].id).toBe("move");
  expect((await openWorkspace("demo")).starred).toContain(next);
  const another = await createNote("demo");
  await expect(moveNote("demo", another, "Destination")).rejects.toThrow("already exists");
  await deleteNote("demo", next);
  expect((await openWorkspace("demo")).files.some(f => f.path === next)).toBe(false);
  expect((await openWorkspace("demo")).starred).not.toContain(next);
  expect((await searchNotes([demoWorkspace], "Greeting")).bookmarks).toEqual([]);
});

it("discards empty generated notes and removes them from the explorer", async () => {
  const first = await createNote("demo");
  const second = await createNote("demo");
  await setFileStar("demo", first, true);
  expect(await discardEmptyUntitled("demo", first)).toBe(true);
  expect(await discardEmptyUntitled("demo", second)).toBe(true);
  const workspace = await openWorkspace("demo");
  expect(workspace.files.some(file => file.path === first || file.path === second)).toBe(false);
  expect(workspace.starred).not.toContain(first);
  expect(await createNote("demo")).toBe(first);
});

it("preserves content, whitespace, and deliberately named empty notes", async () => {
  for (const text of ["Keep this", " ", "\n"]) {
    const path = await createNote("demo");
    await saveNote("demo", path, text, "");
    expect(await discardEmptyUntitled("demo", path)).toBe(false);
    expect((await readNote("demo", path)).text).toBe(text);
  }
  const path = await createNote("demo");
  const renamed = await renameNote("demo", path, "My note.md");
  expect(await discardEmptyUntitled("demo", renamed)).toBe(false);
  expect((await openWorkspace("demo")).files.some(file => file.path === renamed)).toBe(true);
});

it("defaults to txt and creates, reopens, renames, and cleans up custom extensions", async () => {
  expect(await createNote("demo")).toBe("Untitled.txt");
  for (const extension of [".md", "json", ".custom", ".d.ts"]) {
    const suffix = extension.startsWith(".") ? extension : `.${extension}`;
    const path = await createNote("demo", extension);
    expect(path).toBe(`Untitled${suffix}`);
    expect(await createNote("demo", extension)).toBe(`Untitled 2${suffix}`);
    expect((await openWorkspace("demo")).files.some(file => file.path === path)).toBe(true);
    expect(await discardEmptyUntitled("demo", path)).toBe(true);
    const second = `Untitled 2${suffix}`;
    await saveNote("demo", second, "Keep custom content", "");
    expect(await discardEmptyUntitled("demo", second)).toBe(false);
    const renamed = await renameNote("demo", second, `Saved${suffix}`);
    expect((await readNote("demo", renamed)).text).toBe("Keep custom content");
  }
});

it("rejects invalid extensions before creating a file", async () => {
  const before = [...demoWorkspace.files];
  for (const extension of ["", ".", "../bad", "a/b", "a\\b", "a:b", "two words", "foo..bar"])
    await expect(createNote("demo", extension)).rejects.toThrow("Enter an extension");
  expect(demoWorkspace.files).toEqual(before);
});
