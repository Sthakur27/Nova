import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebStore, noteKey, pendingNote, type RemoteCopy, type WebNote } from "./store";
import { acceptDriveCopy, createNote, syncAccount } from "./sync";
import { DriveError } from "./drive";

const stores: WebStore[] = [];
const database = () => { const store = new WebStore(crypto.randomUUID()); stores.push(store); return store; };
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); });
const copy = (text = "baseline"): RemoteCopy => ({ text, name: "Note.md", parent: "space", etag: '"v1"' });
const fixture = (overrides: Partial<WebNote> = {}): WebNote => ({
  key: noteKey("alice", "remote"), id: "remote", account: "alice", remoteId: "remote", space: "space", directory: "",
  text: "baseline", name: "Note.md", parent: "space", base: copy(), revision: 1, bookmarks: [], ...overrides,
});
const client = (remote = copy(), account = "alice") => ({
  session: { account: { id: account, email: `${account}@example.test` }, token: "test", expires: Date.now() + 100000, signal: new AbortController().signal },
  spaces: vi.fn(async () => [{ id: "space", name: "Notes", account }]),
  tree: vi.fn(async () => [{ id: "remote", name: remote.name, parent: remote.parent, space: "space", directory: "" }]),
  read: vi.fn(async () => remote), write: vi.fn(async () => {}), reserve: vi.fn(async () => "reserved"),
});

describe("browser storage", () => {
  it("persists pending text and bookmarks across database reopen, isolated by account", async () => {
    const name = crypto.randomUUID(); const first = new WebStore(name); stores.push(first);
    const note = fixture(); await first.mutate(note.key, () => note);
    await first.save({ ...note, text: "offline edit", bookmarks: [{ id: "mark", name: "Important", from: 0, to: 7, quote: "offline" }] });
    const reopened = new WebStore(name); stores.push(reopened);
    expect((await reopened.notes("alice"))[0]).toMatchObject({ text: "offline edit", revision: 2, bookmarks: [{ id: "mark" }] });
    expect(await reopened.notes("bob")).toEqual([]);
    expect(pendingNote((await reopened.notes("alice"))[0])).toBe(true);
  });
  it("rejects a competing stale save and retains the first committed value", async () => {
    const store = database(); const note = fixture(); await store.mutate(note.key, () => note);
    const results = await Promise.allSettled([store.save({ ...note, text: "first" }), store.save({ ...note, text: "second" })]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((await store.get(note.key))?.text).toBe("first");
  });
  it("does not report success when an IndexedDB transaction aborts", async () => {
    const store = database(); const note = fixture(); await store.mutate(note.key, () => note);
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await expect(store.save({ ...note, text: "cannot commit" })).rejects.toThrow("Full"); put.mockRestore();
    expect((await store.get(note.key))?.text).toBe("baseline");
  });
});

describe("Drive reconciliation", () => {
  it("downloads existing notes and refreshes clean local copies", async () => {
    const store = database(); const drive = client(); await syncAccount(store, drive);
    drive.read.mockResolvedValue(copy("updated on desktop")); await syncAccount(store, drive);
    const [note] = await store.notes("alice"); expect(note.text).toBe("updated on desktop"); expect(pendingNote(note)).toBe(false);
    expect(drive.write).not.toHaveBeenCalled();
  });
  it("preserves both sides of a conflict and retains local recovery when accepting Drive", async () => {
    const store = database(); const note = fixture({ text: "phone edit" }); await store.mutate(note.key, () => note);
    const drive = client(copy("desktop edit")); await syncAccount(store, drive);
    expect(await store.get(note.key)).toMatchObject({ text: "phone edit", conflict: { text: "desktop edit" } });
    expect(drive.write).not.toHaveBeenCalled();
    await acceptDriveCopy(store, note.key);
    expect(await store.get(note.key)).toMatchObject({ text: "desktop edit", recovery: [{ text: "phone edit" }] });
  });
  it("conditionally uploads local edits and keeps a newer edit made during upload pending", async () => {
    const store = database(); const note = fixture({ text: "first edit" }); await store.mutate(note.key, () => note);
    const drive = client();
    drive.write.mockImplementationOnce(async () => { const current = (await store.get(note.key))!; await store.save({ ...current, text: "newer edit" }); });
    await syncAccount(store, drive);
    expect(drive.write).toHaveBeenCalledWith("remote", { ...copy("first edit"), etag: '"v1"' }, false);
    const latest = (await store.get(note.key))!;
    expect(latest.text).toBe("newer edit"); expect(latest.base?.text).toBe("first edit"); expect(pendingNote(latest)).toBe(true);
  });
  it("does not advance the baseline when a conditional upload fails", async () => {
    const store = database(); const note = fixture({ text: "local" }); await store.mutate(note.key, () => note);
    const drive = client(); drive.write.mockRejectedValueOnce(new DriveError(412)); await syncAccount(store, drive);
    expect(await store.get(note.key)).toMatchObject({ text: "local", base: { text: "baseline" }, error: expect.stringContaining("changed during sync") });
  });
  it("keeps deleted remote files locally without recreating them", async () => {
    const store = database(); const note = fixture(); await store.mutate(note.key, () => note);
    const drive = client(); drive.tree.mockResolvedValue([]); await syncAccount(store, drive);
    expect(await store.get(note.key)).toMatchObject({ text: "baseline", missing: true }); expect(drive.write).not.toHaveBeenCalled();
  });
  it("never sends Alice's pending notes using Bob's connection", async () => {
    const store = database(); const note = fixture({ text: "alice private" }); await store.mutate(note.key, () => note);
    const drive = client(copy("bob's note"), "bob"); await syncAccount(store, drive);
    expect((await store.get(note.key))?.text).toBe("alice private"); expect(drive.write).not.toHaveBeenCalled();
    expect((await store.notes("bob"))[0].text).toBe("bob's note");
  });
  it("reserves upload identity before creation and reuses it after an ambiguous network error", async () => {
    const store = database(); const note = await createNote(store, "alice", "space", "New.md", "new text");
    const drive = client(); drive.tree.mockResolvedValue([]); drive.read.mockRejectedValue(new DriveError(404));
    drive.write.mockImplementationOnce(async () => {
      expect((await store.get(note.key))?.remoteId).toBe("reserved"); throw new Error("Network lost after creation");
    });
    await syncAccount(store, drive);
    drive.read.mockResolvedValue({ ...copy("new text"), name: "New.md" }); await syncAccount(store, drive);
    expect(drive.reserve).toHaveBeenCalledTimes(1); expect(drive.write).toHaveBeenCalledTimes(1);
    expect(pendingNote((await store.get(note.key))!)).toBe(false);
  });
  it("does not mark files missing when discovery fails partway through", async () => {
    const store = database(); const note = fixture(); await store.mutate(note.key, () => note);
    const drive = client(); drive.tree.mockRejectedValue(new Error("offline"));
    await expect(syncAccount(store, drive)).rejects.toThrow("offline"); expect((await store.get(note.key))?.missing).toBeUndefined();
  });
  it("stops after authorization expires without attempting any writes", async () => {
    const store = database(); const note = fixture({ text: "local" }); await store.mutate(note.key, () => note);
    const drive = client(); drive.read.mockRejectedValue(new DriveError(401));
    await expect(syncAccount(store, drive)).rejects.toMatchObject({ status: 401 }); expect(drive.write).not.toHaveBeenCalled();
  });
  it("ignores work from a cancelled account session", async () => {
    const store = database(); const drive = client(); const controller = new AbortController(); drive.session.signal = controller.signal;
    drive.read.mockImplementation(async () => { controller.abort(); return copy(); });
    await expect(syncAccount(store, drive)).rejects.toThrow("connection changed"); expect(await store.notes("alice")).toEqual([]);
  });
});
it("rejects duplicate local note names before creating another record", async () => {
  const store = database(); await createNote(store, "alice", "space", "Note.md", "first");
  await expect(createNote(store, "alice", "space", "note.md", "second")).rejects.toThrow("already exists");
  expect(await store.notes("alice")).toHaveLength(1);
});
