import { invoke as nativeInvoke, type InvokeArgs } from "@tauri-apps/api/core";

let resetting = false;
const pending = new Set<Promise<unknown>>();
export const localResetInProgress = () => resetting;

// Stop late autosaves, recovery drafts, discovery, and uploads from repopulating
// the cache while reset is replacing it. Already dispatched work finishes first.
export function invoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  if (resetting) return Promise.reject(new Error("Local state is being reset from Google Drive."));
  const task = nativeInvoke<T>(command, args);
  pending.add(task);
  void task.then(() => pending.delete(task), () => pending.delete(task));
  return task;
}
export async function resetLocalState(): Promise<void> {
  if (resetting) throw new Error("A reset is already in progress.");
  resetting = true;
  try {
    await Promise.allSettled([...pending]);
    await nativeInvoke("cloud_reset_local");
  } catch (error) {
    resetting = false;
    throw error;
  }
  // Native drafts are now gone; legacy web drafts must not resurrect them.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("nova-draft-v1:") || key === "nova-explorer-v1") localStorage.removeItem(key);
    }
  } finally { window.location.reload(); }
}
