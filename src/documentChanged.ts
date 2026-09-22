import type { Bookmark, DocumentData } from "./model";

export function documentChanged(saved: DocumentData | undefined, text: string, bookmarks: Bookmark[]): boolean {
  if (!saved || saved.text !== text || saved.bookmarks.length !== bookmarks.length) return true;
  return bookmarks.some((mark, index) => {
    const original = saved.bookmarks[index];
    return mark.id !== original.id || mark.name !== original.name ||
      mark.from !== original.from || mark.to !== original.to || mark.quote !== original.quote ||
      !!mark.unresolved !== !!original.unresolved;
  });
}
