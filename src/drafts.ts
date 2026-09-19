import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DocumentData } from "./model";
import { tabId } from "./tabs";

const key = (root: string, path: string) => "nova-draft-v1:" + tabId({ root, path });
let writes: Promise<void> = Promise.resolve();
function enqueue(write: () => Promise<void>) {
  const pending = writes.catch(() => {}).then(write);
  writes = pending;
  return pending;
}
function parseDraft(value: unknown): DocumentData | null {
  if (value === null) return null;
  const draft = value as DocumentData;
  if (!draft || typeof draft.text !== "string" || typeof draft.revision !== "string" || !Array.isArray(draft.bookmarks))
    throw new Error("The saved draft could not be read. Its recovery copy has been retained.");
  return draft;
}
export async function loadDraft(root: string, path: string): Promise<DocumentData | null> {
  await writes.catch(() => {});
  if (isTauri()) {
    const native = parseDraft(await invoke("load_draft", { root, path }));
    if (native) return native;
  }
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(key(root, path)); }
  catch (error) { if (!isTauri()) throw error; }
  const draft = parseDraft(JSON.parse(legacy ?? "null"));
  if (draft && isTauri()) await storeDraft(root, path, draft);
  return draft;
}
export function storeDraft(root: string, path: string, draft: DocumentData): Promise<void> {
  // Capture now: later bookmark/editor changes must not mutate a queued write.
  const payload = JSON.stringify(draft);
  if (!isTauri()) {
    try { localStorage.setItem(key(root, path), payload); return Promise.resolve(); }
    catch (error) { return Promise.reject(error); }
  }
  return enqueue(async () => {
    await invoke("save_draft", { root, path, draft: JSON.parse(payload) });
    // Remove migrated web storage only after durable native storage succeeds.
    try { localStorage.removeItem(key(root, path)); } catch { /* Native copy is safe. */ }
  });
}
export function clearDraft(root: string, path: string): Promise<void> {
  if (!isTauri()) {
    try { localStorage.removeItem(key(root, path)); return Promise.resolve(); }
    catch (error) { return Promise.reject(error); }
  }
  return enqueue(async () => {
    await invoke("save_draft", { root, path, draft: null });
    try { localStorage.removeItem(key(root, path)); } catch { /* Native cleanup succeeded. */ }
  });
}
export async function moveDraft(root: string, path: string, next: string) {
  if (path === next) return;
  const draft = await loadDraft(root, path);
  if (draft) {
    await storeDraft(root, next, draft);
    await clearDraft(root, path);
  }
}
