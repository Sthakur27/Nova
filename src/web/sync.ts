import { reanchor } from "../model";
import { BrowserDrive, DriveError, validName } from "./drive";
import { WebStore, noteKey, pendingNote, type RemoteCopy, type WebNote } from "./store";

type Drive = Pick<BrowserDrive, "session" | "spaces" | "tree" | "read" | "write" | "reserve"> & Partial<Pick<BrowserDrive, "deleted">>;
const same = (a: Pick<RemoteCopy, "text" | "name" | "parent">, b: Pick<RemoteCopy, "text" | "name" | "parent">) => a.text === b.text && a.name === b.name && a.parent === b.parent;
export function reconcile(note: WebNote, remote: RemoteCopy, directory: string): WebNote {
  if (note.deleted) return { ...note, ...remote, base: remote, directory, deleted: false, missing: false, error: undefined,
    pendingUpload: undefined, conflict: undefined, revision: note.revision + 1, bookmarks: reanchor(note.bookmarks, remote.text), lastSyncedAt: Date.now() };
  // A lost acknowledgement is not a competing edit. Recognize our exact upload,
  // even if more local edits were saved before reconnecting.
  if (note.pendingUpload && same(note.pendingUpload, remote)) {
    note = { ...note, base: remote, pendingUpload: undefined };
  }
  if (same(note, remote)) return { ...note, base: remote, directory, deleted: false, lastSyncedAt: Date.now(), conflict: undefined, missing: false, error: undefined };
  if (note.base && same(note, note.base)) return { ...note, ...remote, base: remote, directory, revision: note.revision + 1, deleted: false, lastSyncedAt: Date.now(),
    bookmarks: reanchor(note.bookmarks, remote.text), conflict: undefined, missing: false, error: undefined };
  if (note.base && same(note.base, remote)) return { ...note, base: remote, directory, deleted: false, lastSyncedAt: Date.now(), conflict: undefined, missing: false, error: undefined };
  return { ...note, conflict: remote, missing: false, error: "Both this device and Drive changed. Review both copies before syncing." };
}

export async function syncAccount(store: WebStore, drive: Drive, changed: () => void = () => {}, preferredKey?: string): Promise<void> {
  const account = drive.session.account.id;
  const active = () => { if (drive.session.signal.aborted) throw new Error("Google connection changed."); };
  active();
  const spaces = await drive.spaces(); active();
  await store.saveSpaces(spaces);
  const remoteIds = new Set<string>();
  // Complete all listings before drawing conclusions about missing remote files.
  const remote = (await Promise.all(spaces.map(space => drive.tree(space.id)))).flat();
  active();
  for (const item of remote) {
    if (remoteIds.has(item.id)) throw new Error("A Drive note appeared in more than one location. Sync stopped safely.");
    remoteIds.add(item.id);
  }
  const cached = await store.notes(account);
  const deleted = new Set(drive.deleted ? (await Promise.all(spaces.map(space => drive.deleted!(space.id)))).flat() : []);
  for (const note of cached) {
    if (note.remoteId && deleted.has(note.remoteId)) {
      await store.mutate(note.key, old => ({ ...old!, deleted: !pendingNote(old!), missing: true,
        error: pendingNote(old!) ? "Deleted in Cloud. Your unsynced edits remain here; save a new note or export them." : undefined }));
      changed();
    }
  }
  const identities = new Map(cached.filter(note => note.remoteId).map(note => [note.remoteId!, note]));
  remote.sort((a, b) => Number(identities.get(b.id)?.key === preferredKey) - Number(identities.get(a.id)?.key === preferredKey));
  for (const item of remote) {
    active();
    const key = identities.get(item.id)?.key ?? noteKey(account, item.id);
    try {
      const copy = await drive.read(item.id, identities.get(item.id)?.base); active();
      // A move after listing must be rediscovered before a write is permitted.
      if (copy.parent !== item.parent || copy.name !== item.name) throw new DriveError(412);
      const note = await store.mutate(key, old => old ? { ...reconcile(old, copy, item.directory), space: item.space } : {
        key, id: item.id, remoteId: item.id, account, space: item.space,
        ...copy, directory: item.directory, base: copy, bookmarks: [], revision: 1,
      });
      changed();
      if (note.conflict || !pendingNote(note)) continue;
      if (remote.some(other => other.id !== item.id && other.parent === note.parent && other.name.toLocaleLowerCase() === note.name.toLocaleLowerCase())) throw new Error("Another Drive note already uses this filename. Rename your local note before syncing.");
      const uploaded = { text: note.text, name: note.name, parent: note.parent, etag: copy.etag };
      await store.mutate(key, old => ({ ...old!, pendingUpload: uploaded }));
      active(); await drive.write(item.id, uploaded, false); active();
      // Advance the baseline, never replace edits saved during this request.
      await store.mutate(key, old => ({ ...old!, base: { ...uploaded, etag: "" }, pendingUpload: undefined, error: undefined, lastSyncedAt: Date.now() }));
      changed();
    } catch (error) {
      active();
      if (error instanceof DriveError && error.status === 401) throw error;
      if (await store.get(key)) await store.mutate(key, old => ({ ...old!, error: String(error) }));
      else throw error;
      changed();
    }
  }
  for (const initial of await store.notes(account)) {
    active();
    if (initial.remoteId && (remoteIds.has(initial.remoteId) || deleted.has(initial.remoteId))) continue;
    if (initial.base) {
      await store.mutate(initial.key, old => ({ ...old!, missing: true, error: "This note is missing from its Cloud space. Your local copy is safe. Export it or save a separate new copy." }));
      changed(); continue;
    }
    try {
      // Resolve any previous ambiguous create with exactly the same reserved ID.
      let note = initial;
      if (!note.remoteId) {
        const reserved = await drive.reserve(); active();
        note = await store.mutate(note.key, old => ({ ...old!, remoteId: reserved }));
      }
      let found: RemoteCopy | undefined;
      try { found = await drive.read(note.remoteId!); }
      catch (error) { if (!(error instanceof DriveError && error.status === 404)) throw error; }
      active();
      if (found) {
        await store.mutate(note.key, old => reconcile(old!, found!, old!.directory));
      } else {
        // Parent must still belong to a discovered space; never recreate deleted spaces.
        if (!spaces.some(space => space.id === note.space) || note.parent !== note.space) throw new Error("The destination Cloud space is unavailable. Your new note stays on this device.");
        if (remote.some(other => other.parent === note.parent && other.name.toLocaleLowerCase() === note.name.toLocaleLowerCase())) throw new Error("Another Drive note already uses this filename. Rename your local note before syncing.");
        const uploaded = { text: note.text, name: note.name, parent: note.parent, etag: "" };
        await store.mutate(note.key, old => ({ ...old!, pendingUpload: uploaded }));
        active(); await drive.write(note.remoteId!, uploaded, true); active();
        await store.mutate(note.key, old => ({ ...old!, base: { ...uploaded, etag: "" }, pendingUpload: undefined, error: undefined, lastSyncedAt: Date.now() }));
      }
    } catch (error) {
      active();
      if (error instanceof DriveError && error.status === 401) throw error;
      await store.mutate(initial.key, old => ({ ...old!, error: String(error) }));
    }
    changed();
  }
}

export async function createNote(store: WebStore, account: string, space: string, name: string, text = ""): Promise<WebNote> {
  if (!validName(name)) return Promise.reject(new Error("Choose a note name without slashes or reserved characters."));
  if ((await store.notes(account)).some(note => note.parent === space && note.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("A note with that name already exists. Choose another filename.");
  const id = crypto.randomUUID(); const key = noteKey(account, id);
  return store.mutate(key, () => ({ key, id, account, space, parent: space, name, directory: "", text, bookmarks: [], revision: 1 }));
}
export function acceptDriveCopy(store: WebStore, key: string): Promise<WebNote> {
  return store.mutate(key, old => {
    if (!old?.conflict) throw new Error("Refresh sync before resolving this note.");
    const remote = old.conflict;
    return { ...old, ...remote, base: remote, conflict: undefined, pendingUpload: undefined, error: undefined,
      recovery: [...(old.recovery ?? []), { text: old.text, name: old.name }], bookmarks: reanchor(old.bookmarks, remote.text), revision: old.revision + 1 };
  });
}

/** Approve only the reviewed Drive version; the normal sync still rechecks it and uses If-Match. */
export function acceptLocalCopy(store: WebStore, key: string, reviewed: RemoteCopy): Promise<WebNote> {
  return store.mutate(key, old => {
    if (!old?.conflict || !same(old.conflict, reviewed) || old.conflict.etag !== reviewed.etag) {
      throw new Error("The conflict changed. Review the latest Drive copy before replacing it.");
    }
    return { ...old, parent: reviewed.parent, base: reviewed, conflict: undefined, pendingUpload: undefined, missing: false, error: undefined,
      recovery: [...(old.recovery ?? []), { text: reviewed.text, name: reviewed.name }] };
  });
}

/** A targeted retry bypasses workspace listings for an already linked note. */
export async function syncFile(store: WebStore, drive: Drive, key: string): Promise<void> {
  const initial = await store.get(key);
  if (!initial || initial.account !== drive.session.account.id || !initial.remoteId || !initial.base) {
    throw new Error("Run Refresh Cloud first to discover this note in Drive.");
  }
  const remote = await drive.read(initial.remoteId, initial.base);
  if (remote.parent !== initial.base.parent || remote.name !== initial.base.name) throw new Error("This file moved or was renamed in Drive. Refresh Cloud first.");
  const note = await store.mutate(key, old => reconcile(old!, remote, old!.directory));
  if (note.conflict) throw new Error(note.error);
  if (!pendingNote(note)) return;
  // A local rename needs the full pass's filename-collision check.
  if (note.name !== remote.name) throw new Error("Refresh Cloud to sync this filename change.");
  const uploaded = { text: note.text, name: note.name, parent: note.parent, etag: remote.etag };
  await store.mutate(key, old => ({ ...old!, pendingUpload: uploaded }));
  await drive.write(initial.remoteId, uploaded, false);
  await store.mutate(key, old => ({ ...old!, base: { ...uploaded, etag: "" }, pendingUpload: undefined, error: undefined, lastSyncedAt: Date.now() }));
}

export async function reviewFile(store: WebStore, drive: Drive, key: string) {
  const note = await store.get(key);
  if (!note?.remoteId || !note.base || note.account !== drive.session.account.id) throw new Error("Sync this note with Drive first.");
  const remote = await drive.read(note.remoteId);
  if (remote.parent !== note.base.parent || remote.name !== note.base.name) throw new Error("This file moved or was renamed in Drive. Refresh Cloud first.");
  return { localText: note.text, localRevision: String(note.revision), remoteText: remote.text, remoteRevision: remote.etag,
    name: note.name, remoteName: remote.name, driveId: note.remoteId, account: note.account, parent: remote.parent };
}
export async function replaceFile(store: WebStore, drive: Drive, key: string, reviewed: Awaited<ReturnType<typeof reviewFile>>, direction: "pull" | "push") {
  const latest = await reviewFile(store, drive, key);
  if (JSON.stringify(latest) !== JSON.stringify(reviewed)) throw new Error("This file changed. Review both copies again.");
  const remote = { text: reviewed.remoteText, name: reviewed.remoteName, parent: reviewed.parent, etag: reviewed.remoteRevision };
  const uploaded = { ...remote, text: reviewed.localText };
  await store.mutate(key, old => {
    if (String(old!.revision) !== reviewed.localRevision) throw new Error("Local edits changed. Review this file again.");
    return { ...old!,
      ...(direction === "pull" ? { base: remote, conflict: undefined, pendingUpload: undefined, error: undefined,
        text: remote.text, revision: old!.revision + 1, bookmarks: reanchor(old!.bookmarks, remote.text) }
        : { pendingUpload: uploaded }),
      recovery: [...(old!.recovery ?? []), { text: direction === "pull" ? old!.text : remote.text, name: old!.name }] };
  });
  if (direction === "push") {
    // Use precisely the approved revision, never a fresh guard from a later read.
    await drive.write(reviewed.driveId, uploaded, false);
    await store.mutate(key, old => ({ ...old!, base: { ...uploaded, etag: "" }, pendingUpload: undefined,
      conflict: undefined, error: undefined, lastSyncedAt: Date.now() }));
  }
}
