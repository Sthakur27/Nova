export type NoteTab = { root: string; path: string; pinned: boolean };
export const tabId = (tab: Pick<NoteTab, "root" | "path">) =>
  JSON.stringify([tab.root, tab.path]);
export function openTab(tabs: NoteTab[], note: NoteTab): NoteTab[] {
  const id = tabId(note),
    existing = tabs.findIndex((t) => tabId(t) === id);
  if (existing >= 0)
    return tabs.map((t, i) =>
      i === existing ? { ...t, pinned: t.pinned || note.pinned } : t,
    );
  const preview = tabs.findIndex((t) => !t.pinned);
  if (!note.pinned && preview >= 0)
    return tabs.map((t, i) => (i === preview ? note : t));
  return [...tabs, note];
}
export function pinTab(tabs: NoteTab[], id: string) {
  return tabs.map((t) => (tabId(t) === id ? { ...t, pinned: true } : t));
}
