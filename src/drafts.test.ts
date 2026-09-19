import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, moveDraft, storeDraft } from "./drafts";
import { readNote, saveNote, loadExplorer, saveExplorer } from "./storage";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("retains unsaved text and bookmark anchors without changing the file", async () => {
  const original = await readNote("demo", "Scratchpad.txt");
  const draft = { ...original, text: "Uncommitted changes", bookmarks: [{ id: "b", name: "Place", from: 0, to: 11, quote: "Uncommitted" }] };
  await storeDraft("demo", "Scratchpad.txt", draft);
  expect(await readNote("demo", "Scratchpad.txt")).toEqual(original);
  expect(await loadDraft("demo", "Scratchpad.txt")).toEqual(draft);
  await saveNote("demo", "Scratchpad.txt", draft.text, draft.revision);
  await clearDraft("demo", "Scratchpad.txt");
  expect(await loadDraft("demo", "Scratchpad.txt")).toBeNull();
  expect((await readNote("demo", "Scratchpad.txt")).text).toBe(draft.text);
});
it("keeps original revision when disk changes, so recovery cannot silently overwrite it", async () => {
  const original = await readNote("demo", "Scratchpad.txt");
  await storeDraft("demo", "Scratchpad.txt", { ...original, text: "My draft" });
  await saveNote("demo", "Scratchpad.txt", "External edit", original.revision);
  const draft = (await loadDraft("demo", "Scratchpad.txt"))!;
  await expect(saveNote("demo", "Scratchpad.txt", draft.text, draft.revision)).rejects.toThrow("changed");
  expect((await loadDraft("demo", "Scratchpad.txt"))?.text).toBe("My draft");
});
it("isolates same-name files by root and migrates drafts on rename", async () => {
  const draft = { text: "pending", revision: "original", bookmarks: [] };
  await storeDraft("/a", "note.md", draft);
  await storeDraft("/b", "note.md", { ...draft, text: "other" });
  await moveDraft("/a", "note.md", "renamed.md");
  expect(await loadDraft("/a", "note.md")).toBeNull();
  expect(await loadDraft("/a", "renamed.md")).toEqual(draft);
  expect((await loadDraft("/b", "note.md"))?.text).toBe("other");
});
it("surfaces failed recovery writes instead of pretending edits are protected", async () => {
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
  await expect(storeDraft("/a", "note.md", { text: "pending", revision: "", bookmarks: [] })).rejects.toThrow("quota");
});
it("restores folder order, nested collapse state, ordered tabs, active tab and mode", async () => {
  const preferences = {
    folders: [{ root: "/b", name: "B", collapsed: false, closedDirectories: ["nested/deep"] }, { root: "/a", name: "A", collapsed: true }],
    tabs: [{ root: "/a", path: "one.md", pinned: true }, { root: "/b", path: "two.md", pinned: false }],
    active: { root: "/b", path: "two.md" }, mode: "source" as const,
  };
  const pending = saveExplorer(preferences);
  expect(await loadExplorer()).toEqual(preferences);
  await pending;
  await saveExplorer({ ...preferences, tabs: [], active: null });
  expect((await loadExplorer())?.tabs).toEqual([]);
  expect((await loadExplorer())?.active).toBeNull();
});
