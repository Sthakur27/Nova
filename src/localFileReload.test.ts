import { expect, it, vi } from "vitest";
import { prepareLocalReload } from "./localFileReload";
const note = {text: "changed outside", revision: "new", bookmarks: []};
const options = () => ({read: async () => note, exists: () => true, revision: () => "old", busy: () => false, dirty: () => false, recovered: async () => false});
it("reloads clean notes but protects edits typed while reading and inactive recovery drafts", async () => {
  expect(await prepareLocalReload(options())).toEqual(note);
  let dirty = false;
  expect(await prepareLocalReload({...options(), read: async () => {dirty = true; return note;}, dirty: () => dirty})).toBe("protected");
  expect(await prepareLocalReload({...options(), recovered: async () => true})).toBe("protected");
  dirty = false;
  expect(await prepareLocalReload({...options(), recovered: async () => {dirty = true; return false;}, dirty: () => dirty})).toBe("protected");
});
it("does not replace closed notes, unchanged revisions, or a save that starts during a read", async () => {
  expect(await prepareLocalReload({...options(), exists: () => false})).toBe("closed");
  const recovered = vi.fn(async () => false);
  expect(await prepareLocalReload({...options(), revision: () => "new", recovered})).toBe("unchanged");
  expect(recovered).not.toHaveBeenCalled();
  let busy = false;
  await expect(prepareLocalReload({...options(), read: async () => {busy = true; return note;}, busy: () => busy})).rejects.toThrow("retry");
});
