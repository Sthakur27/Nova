import { loadDraft } from "./drafts";
import { invoke } from "./resetLocalState";
import { readNote, saveNote, saveBookmarks, searchFiles } from "./storage";
import { reanchor, type Workspace, type Bookmark } from "./model";
import { searchMatcher, type SearchOptions } from "./searchOptions";
import { ChangeSet, Text } from "@codemirror/state";

export type ReplaceIdentity = { root: string; path: string };
export type ReplacementChange = { from: number; to: number; insert: string };
export type ReplacePreview = ReplaceIdentity & { before: string; after: string; revision: string; changes: ReplacementChange[] };
export const replacementKey = ({root, path}: ReplaceIdentity) => JSON.stringify([root, path]);
export function replacementChanges(text: string, query: string, replacement: string, options: SearchOptions): ReplacementChange[] {
  if (!query.trim()) return [];
  const pattern = searchMatcher(query, options).pattern;
  const changes: ReplacementChange[] = [];
  // Replacement is deliberately literal, including $1 and $&.
  for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags + "g"))) {
    if (match[0] === replacement) continue;
    if (changes.length >= 10_000) throw new Error("More than 10,000 replacements in one file. Narrow the search.");
    changes.push({from: match.index!, to: match.index! + match[0].length, insert: replacement});
  }
  return changes;
}
export function mapReplacementBookmarks(bookmarks: Bookmark[], before: string, after: string, changes: ReplacementChange[]): Bookmark[] {
  const mapping = ChangeSet.of(changes, before.length);
  return reanchor(bookmarks.map(bookmark => {
    if (bookmark.unresolved) return bookmark;
    const from = mapping.mapPos(bookmark.from, -1), to = mapping.mapPos(bookmark.to, 1);
    return {...bookmark, from, to, quote: from === to ? bookmark.quote : after.slice(from, to), unresolved: from === to};
  }), after);
}
export async function previewWorkspaceReplace(folders: Workspace[], query: string, replacement: string, options: SearchOptions,
  blocked: () => ReplaceIdentity[]): Promise<{files: ReplacePreview[]; warnings: string[]}> {
  const matcher = searchMatcher(query, options);
  if (!query.trim()) throw new Error("Enter text to find first.");
  const local = folders.filter(folder => !folder.cloudSpace && !folder.error);
  // Empty filename queries without path filters intentionally do not traverse
  // the native tree. Supply an all-files filter so collapsed folders count too.
  const discovered = await searchFiles(local, "", {...options, include: options.include.trim() || "**", regexp: false, wholeWord: false});
  const candidates = new Map([...local.flatMap(folder => folder.files.map(file => ({root: folder.root, path: file.path}))), ...discovered.files]
    .filter(file => !file.path.split("/").some(part => [".git", "node_modules", "target", ".obsidian", ".Trash", ".nova-registry-backups"].includes(part))
      && !file.path.split("/").at(-1)!.match(/^(?:\.nova(?:\.|$)|\.tmp)/) && matcher.acceptsPath(file.path)).map(file => [replacementKey(file), file]));
  const warnings = [...discovered.warnings];
  if (folders.some(folder => folder.cloudSpace)) warnings.push("Cloud spaces are excluded. Replace works on Local files only.");
  if (discovered.files.length >= 100 || candidates.size > 100) warnings.push("Preview is limited to the first 100 candidate files. Narrow the include filter to cover remaining files.");
  const files: ReplacePreview[] = [];
  let previewCharacters = 0;
  for (const file of [...candidates.values()].slice(0, 100)) {
    try {
      if (blocked().some(item => replacementKey(item) === replacementKey(file)) || await loadDraft(file.root, file.path)) {
        warnings.push(`${file.path}: skipped because it is protected by an open tab or recovery draft.`); continue;
      }
      const note = await readNote(file.root, file.path);
      if (previewCharacters + note.text.length > 4_000_000) { warnings.push("Preview stopped at its text-size limit. Narrow the include filter."); break; }
      const changes = replacementChanges(note.text, query, replacement, options);
      if (!changes.length) continue;
      const outputCharacters = changes.reduce((length, change) => length + change.insert.length - (change.to - change.from), note.text.length);
      // Check expansion before constructing CodeMirror text or the display string.
      // A short input with thousands of matches can otherwise allocate gigabytes.
      if (previewCharacters + note.text.length + outputCharacters > 4_000_000) {
        warnings.push(`${file.path}: preview stopped at the combined before/after text-size limit. Narrow the search or use shorter replacement text.`);
        break;
      }
      previewCharacters += note.text.length + outputCharacters;
      const after = ChangeSet.of(changes, note.text.length).apply(Text.of(note.text.split("\n")));
      files.push({...file, before: note.text, after: after.toString(), revision: note.revision, changes});
    } catch (error) { warnings.push(`${file.path}: ${String(error)}`); }
  }
  return {files, warnings};
}
export async function applyWorkspaceReplacement(file: ReplacePreview, blocked: () => ReplaceIdentity[]): Promise<void> {
  const draft = await loadDraft(file.root, file.path);
  if (draft || blocked().some(item => replacementKey(item) === replacementKey(file)))
    throw new Error("File has unsaved edits or a recovery draft. Save it, then preview again.");
  if (file.root !== "demo") {
    await invoke("replace_saved_note", {root: file.root, path: file.path, text: file.after, revision: file.revision, changes: file.changes});
  } else {
    const note = await readNote(file.root, file.path);
    const bookmarks = mapReplacementBookmarks(note.bookmarks, file.before, file.after, file.changes);
    await saveNote(file.root, file.path, file.after, file.revision);
    await saveBookmarks(file.root, file.path, bookmarks);
  }
}
