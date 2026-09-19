import { beforeEach, afterEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ files: new Map<string, unknown>(), fail: false }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: vi.fn(async (command: string, args: { root: string; path: string; draft?: unknown }) => {
    const key = JSON.stringify([args.root, args.path]);
    if (command === "load_draft") return native.files.get(key) ?? null;
    if (command === "save_draft") {
      if (native.fail) throw new Error("Disk full");
      native.files.set(key, args.draft);
      return;
    }
    throw new Error(command);
  }),
}));
beforeEach(() => {
  vi.resetModules();
  native.files.clear(); native.fail = false;
  vi.stubGlobal("localStorage", { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error("Web storage unavailable"); } });
});
afterEach(() => vi.unstubAllGlobals());
const draft = { text: "Unsaved desktop edits", revision: "disk revision", bookmarks: [] };
it("recovers after a fresh frontend startup with empty web storage (including a changed dev port)", async () => {
  const before = await import("./drafts");
  await before.storeDraft("/notes", "note.md", draft);
  vi.resetModules();
  const after = await import("./drafts");
  expect(await after.loadDraft("/notes", "note.md")).toEqual(draft);
});
it("serializes rapid edits and explicit save cleanup so an old write cannot resurrect a draft", async () => {
  const { storeDraft, clearDraft, loadDraft } = await import("./drafts");
  const first = storeDraft("/notes", "note.md", draft);
  const second = storeDraft("/notes", "note.md", { ...draft, text: "latest" });
  const cleared = clearDraft("/notes", "note.md");
  await Promise.all([first, second, cleared]);
  expect(await loadDraft("/notes", "note.md")).toBeNull();
});
it("reports disk errors, retains previous recovery, and can retry", async () => {
  const { storeDraft, loadDraft } = await import("./drafts");
  await storeDraft("/notes", "note.md", draft);
  native.fail = true;
  await expect(storeDraft("/notes", "note.md", { ...draft, text: "latest" })).rejects.toThrow("Disk full");
  expect(await loadDraft("/notes", "note.md")).toEqual(draft);
  native.fail = false;
  await storeDraft("/notes", "note.md", { ...draft, text: "retry" });
  expect((await loadDraft("/notes", "note.md"))?.text).toBe("retry");
});
it("migrates existing web drafts only after native write succeeds", async () => {
  const remove = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(draft), removeItem: remove });
  const { loadDraft } = await import("./drafts");
  native.fail = true;
  await expect(loadDraft("/notes", "note.md")).rejects.toThrow("Disk full");
  expect(remove).not.toHaveBeenCalled();
  native.fail = false;
  expect(await loadDraft("/notes", "note.md")).toEqual(draft);
  expect(remove).toHaveBeenCalledOnce();
});
