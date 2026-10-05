import type { Bookmark } from "../model";

export type Account = { id: string; email: string };
export type Space = { id: string; name: string; account: string };
export type RemoteCopy = { text: string; name: string; parent: string; etag: string };
export type WebNote = {
  key: string; account: string; space: string; id: string; remoteId?: string;
  name: string; parent: string; directory: string; text: string; bookmarks: Bookmark[];
  revision: number; base?: RemoteCopy; pendingUpload?: RemoteCopy; conflict?: RemoteCopy; missing?: boolean;
  recovery?: { text: string; name: string }[]; error?: string;
};
export const noteKey = (account: string, id: string) => JSON.stringify([account, id]);
export const pendingNote = (note: WebNote) => !note.base || note.text !== note.base.text || note.name !== note.base.name || note.parent !== note.base.parent;

// Keep all changes inside IDB transactions. No network awaits are allowed in a mutation.
export class WebStore {
  private database: Promise<IDBDatabase>;
  constructor(name = "nova-web-v1") {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("notes", { keyPath: "key" }).createIndex("account", "account");
        request.result.createObjectStore("spaces", { keyPath: "key" }).createIndex("account", "account");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close other Nova tabs before upgrading browser storage."));
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    });
  }
  async ready() { await this.database; }
  async close() { (await this.database).close(); }
  private async transaction<T>(store: string, mode: IDBTransactionMode, work: (table: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new Error("Browser storage could not save this change. Export your note before closing."));
      tx.onerror = () => { /* onabort reports the transaction's final outcome. */ };
      try { work(tx.objectStore(store), next => { value = next; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  notes(account: string): Promise<WebNote[]> {
    return this.transaction("notes", "readonly", (table, done) => {
      const req = table.index("account").getAll(account); req.onsuccess = () => done(req.result);
    });
  }
  spaces(account: string): Promise<Space[]> {
    return this.transaction("spaces", "readonly", (table, done) => {
      const req = table.index("account").getAll(account); req.onsuccess = () => done(req.result);
    });
  }
  saveSpaces(spaces: Space[]): Promise<void> {
    return this.transaction("spaces", "readwrite", table => {
      for (const space of spaces) table.put({ ...space, key: noteKey(space.account, space.id) });
    });
  }
  get(key: string): Promise<WebNote | undefined> {
    return this.transaction("notes", "readonly", (table, done) => {
      const req = table.get(key); req.onsuccess = () => done(req.result);
    });
  }
  mutate(key: string, change: (old: WebNote | undefined) => WebNote): Promise<WebNote> {
    let failure: unknown;
    return this.transaction<WebNote>("notes", "readwrite", (table, done) => {
      const req = table.get(key);
      req.onsuccess = () => {
        try {
          const next = change(req.result);
          if (next.key !== key || noteKey(next.account, next.id) !== key) throw new Error("Invalid note identity.");
          table.put(next); done(next);
        } catch (error) {
          // Throwing from an IDB event alone does not reliably reject our promise.
          req.transaction!.abort();
          failure = error;
        }
      };
    }).catch(error => { throw failure ?? error; });
  }
  save(snapshot: WebNote): Promise<WebNote> {
    return this.mutate(snapshot.key, old => {
      if (!old || old.revision !== snapshot.revision) throw new Error("This note changed while you were editing. Export your edits before reopening it.");
      return { ...old, text: snapshot.text, name: snapshot.name, bookmarks: snapshot.bookmarks, revision: old.revision + 1 };
    });
  }
}
