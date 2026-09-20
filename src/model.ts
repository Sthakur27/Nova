import type { SyncPolicy } from "./syncPolicy";
export type Bookmark = {
  id: string;
  name: string;
  from: number;
  to: number;
  quote: string;
  unresolved?: boolean;
  line?: number;
};
export type NoteFile = { path: string; name: string };
export type Workspace = {
  name: string;
  root: string;
  files: NoteFile[];
  starred?: string[];
  starsError?: string;
  syncPolicy?: SyncPolicy;
  syncError?: string;
  collapsed?: boolean;
  closedDirectories?: string[];
  error?: string;
};
export type DocumentData = {
  text: string;
  revision: string;
  bookmarks: Bookmark[];
};
export type SearchHit = { path: string; line: number; snippet: string };

// CodeMirror and these offsets both use UTF-16 code units.
export function reanchor(bookmarks: Bookmark[], text: string): Bookmark[] {
  return bookmarks
    .map((b) => {
      if (b.quote && text.slice(b.from, b.to) === b.quote)
        return { ...b, unresolved: false };
      if (!b.quote)
        return {
          ...b,
          from: Math.min(b.from, text.length),
          to: Math.min(b.to, text.length),
          unresolved: true,
        };
      let nearest = -1,
        offset = text.indexOf(b.quote);
      while (offset !== -1) {
        if (
          nearest === -1 ||
          Math.abs(offset - b.from) < Math.abs(nearest - b.from)
        )
          nearest = offset;
        offset = text.indexOf(b.quote, offset + 1);
      }
      return nearest === -1
        ? {
            ...b,
            from: Math.min(b.from, text.length),
            to: Math.min(b.to, text.length),
            unresolved: true,
          }
        : {
            ...b,
            from: nearest,
            to: nearest + b.quote.length,
            unresolved: false,
          };
    })
    .map((b) => ({ ...b, line: text.slice(0, b.from).split("\n").length }));
}
export function filenameMatches<T extends NoteFile>(
  files: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return files
    .filter((f) => f.path.toLowerCase().includes(q))
    .sort((a, b) => {
      const rank = (f: NoteFile) =>
        f.name.toLowerCase().startsWith(q)
          ? 0
          : f.name.toLowerCase().includes(q)
            ? 1
            : 2;
      return rank(a) - rank(b) || a.path.localeCompare(b.path);
    })
    .slice(0, 30);
}
