import { tabId, type NoteTab } from "./tabs";

/** Prefer adjacent tabs in the same pane, then other panes. Stale tabs remain
 * available for recovery, but must not prevent a different tab from closing. */
export async function openAfterTabClose(
  tabs: NoteTab[], closing: NoteTab, group: readonly string[],
  open: (tab: NoteTab) => Promise<boolean>,
): Promise<boolean> {
  const index = tabs.findIndex(tab => tabId(tab) === tabId(closing));
  const nearby = [...tabs.slice(index + 1), ...tabs.slice(0, index).reverse()];
  const own = new Set(group);
  const candidates = [...nearby.filter(tab => own.has(tabId(tab))), ...nearby.filter(tab => !own.has(tabId(tab)))];
  for (const candidate of candidates) {
    if (await open(candidate)) return true;
  }
  return false;
}
