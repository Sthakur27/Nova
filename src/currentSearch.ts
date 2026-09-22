import { searchMatcher, defaultSearchOptions } from "./searchOptions";
import type { Bookmark } from "./model";
export type SearchScope = "everywhere" | "current";
export type CurrentNote = {
  root: string;
  path: string;
  text: string;
  bookmarks: Bookmark[];
};
export function searchCurrentNote(note: CurrentNote, query: string, options = defaultSearchOptions) {
  const needle = query.trim();
  const hits: {
    root: string;
    path: string;
    line: number;
    snippet: string;
    from: number;
    to: number;
  }[] = [];
  if (!needle) return hits;
  const matcher = searchMatcher(query, options);
  if (!matcher.acceptsPath(note.path)) return hits;
  const pattern = new RegExp(matcher.pattern.source, matcher.pattern.flags + "g");
  let line = 1,
    lineStart = 0;
  for (const match of note.text.matchAll(pattern)) {
    const from = match.index!;
    for (
      let next = note.text.indexOf("\n", lineStart);
      next >= 0 && next < from;
      next = note.text.indexOf("\n", lineStart)
    ) {
      line++;
      lineStart = next + 1;
    }
    const end = note.text.indexOf("\n", from),
      lineEnd = end < 0 ? note.text.length : end;
    const snippetStart = Math.max(lineStart, from - 60);
    hits.push({
      root: note.root,
      path: note.path,
      line,
      snippet: note.text.slice(snippetStart, Math.min(lineEnd, from + 180)),
      from,
      to: from + match[0].length,
    });
    if (hits.length === 80) break;
  }
  return hits;
}
