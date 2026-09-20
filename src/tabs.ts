export type NoteTab = { root: string; path: string; pinned: boolean };
export const tabId = (tab: Pick<NoteTab, "root" | "path">) =>
  JSON.stringify([tab.root, tab.path]);
export function openTab(tabs: NoteTab[], note: NoteTab, previewIds?: ReadonlySet<string>): NoteTab[] {
  const id = tabId(note),
    existing = tabs.findIndex((t) => tabId(t) === id);
  if (existing >= 0)
    return tabs.map((t, i) =>
      i === existing ? { ...t, pinned: t.pinned || note.pinned } : t,
    );
  const preview = tabs.findIndex((t) => !t.pinned && (!previewIds || previewIds.has(tabId(t))));
  if (!note.pinned && preview >= 0)
    return tabs.map((t, i) => (i === preview ? note : t));
  return [...tabs, note];
}
export function pinTab(tabs: NoteTab[], id: string) {
  return tabs.map((t) => (tabId(t) === id ? { ...t, pinned: true } : t));
}

/** Move a tab before another tab, or to the end when beforeId is null. */
export function reorderTab(tabs: NoteTab[], id: string, beforeId: string | null) {
  const tab = tabs.find((t) => tabId(t) === id);
  if (!tab || id === beforeId || (beforeId !== null && !tabs.some((t) => tabId(t) === beforeId))) return tabs;
  const next = tabs.filter((t) => tabId(t) !== id);
  next.splice(beforeId === null ? next.length : next.findIndex((t) => tabId(t) === beforeId), 0, tab);
  return next.every((t, i) => t === tabs[i]) ? tabs : next;
}
