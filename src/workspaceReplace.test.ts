// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { defaultSearchOptions } from "./searchOptions";
import { applyWorkspaceReplacement, mapReplacementBookmarks, previewWorkspaceReplace, replacementChanges } from "./workspaceReplace";
import { readNote, searchFiles } from "./storage";
import { loadDraft } from "./drafts";
import { invoke } from "./resetLocalState";
vi.mock("./storage", () => ({readNote: vi.fn(), searchFiles: vi.fn(), saveNote: vi.fn(), saveBookmarks: vi.fn()}));
vi.mock("./drafts", () => ({loadDraft: vi.fn()}));
vi.mock("./resetLocalState", () => ({invoke: vi.fn()}));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(searchFiles).mockResolvedValue({files: [], warnings: []}); vi.mocked(loadDraft).mockResolvedValue(null); });
it("honors case, whole words, regex and literal replacement strings", () => {
  expect(replacementChanges("Cat cat cats cot", "c[ao]t", "$1", {...defaultSearchOptions, regexp: true, wholeWord: true, caseSensitive: true}))
    .toEqual([{from: 4, to: 7, insert: "$1"}, {from: 13, to: 16, insert: "$1"}]);
  expect(replacementChanges("cat", "cat", "cat", defaultSearchOptions)).toEqual([]);
  expect(() => replacementChanges("cat", "[", "", {...defaultSearchOptions, regexp: true})).toThrow();
});
it("previews full contents with filters and excludes Cloud, drafts, and dirty files", async () => {
  vi.mocked(readNote).mockResolvedValue({text: "cat\ncat", revision: "r1", bookmarks: []});
  vi.mocked(loadDraft).mockImplementation(async (_root, path) => path === "draft.md" ? {text: "draft", revision: "r", bookmarks: []} : null);
  const result = await previewWorkspaceReplace([
    {root: "/local", name: "Local", files: ["a.md", "dirty.md", "draft.md", "skip.txt", ".nova"].map(path => ({path, name: path}))},
    {root: "/cloud", name: "Cloud", files: [{path: "c.md", name: "c.md"}], cloudSpace: {id: "c", name: "c", account: "c"}},
  ], "cat", "dog", {...defaultSearchOptions, include: "*.md"}, () => [{root: "/local", path: "dirty.md"}]);
  expect(result.files).toHaveLength(1);
  expect(result.files[0]).toMatchObject({path: "a.md", before: "cat\ncat", after: "dog\ndog", revision: "r1"});
  expect(readNote).toHaveBeenCalledTimes(1);
  expect(result.warnings.join(" ")).toContain("Cloud spaces are excluded");
});
it("rechecks newly dirty files and drafts at apply, then sends exact reviewed revision", async () => {
  const file = {root: "/local", path: "a.md", before: "cat", after: "dog", revision: "r1", changes: [{from: 0, to: 3, insert: "dog"}]};
  await expect(applyWorkspaceReplacement(file, () => [file])).rejects.toThrow("unsaved edits");
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(loadDraft).mockResolvedValue({text: "new draft", revision: "r1", bookmarks: []});
  await expect(applyWorkspaceReplacement(file, () => [])).rejects.toThrow("recovery draft");
  vi.mocked(loadDraft).mockResolvedValue(null);
  await applyWorkspaceReplacement(file, () => []);
  expect(invoke).toHaveBeenCalledWith("replace_saved_note", {root: "/local", path: "a.md", text: "dog", revision: "r1", changes: file.changes});
});
it("preserves bookmarks through replacements before and within their range", () => {
  const before = "cat hello cat", after = "tiger hello tiger";
  const changes = replacementChanges(before, "cat", "tiger", defaultSearchOptions);
  expect(mapReplacementBookmarks([{id: "b", name: "selected", from: 4, to: 13, quote: "hello cat"}], before, after, changes))
    .toEqual([{id: "b", name: "selected", from: 6, to: 17, quote: "hello tiger", unresolved: false, line: 1}]);
  expect(mapReplacementBookmarks([{id: "deleted", name: "Passage", from: 0, to: 3, quote: "cat"}], "cat", "", [{from: 0, to: 3, insert: ""}]))
    .toEqual([{id: "deleted", name: "Passage", from: 0, to: 0, quote: "cat", unresolved: true, line: 1}]);
});
it("discovers collapsed folders without an include filter and skips loaded internal directories", async () => {
  vi.mocked(readNote).mockResolvedValue({text: "cat", revision: "r1", bookmarks: []});
  vi.mocked(searchFiles).mockResolvedValue({files: [{root: "/local", path: "collapsed/note.md", name: "note.md"}], warnings: []});
  const result = await previewWorkspaceReplace([{root: "/local", name: "Local", directories: [],
    files: [".git/config", "node_modules/pkg/file.txt", ".nova.backup"].map(path => ({path, name: path}))}],
    "cat", "dog", {...defaultSearchOptions, includeHidden: true}, () => []);
  expect(searchFiles).toHaveBeenCalledWith(expect.anything(), "", expect.objectContaining({include: "**"}));
  expect(result.files.map(file => file.path)).toEqual(["collapsed/note.md"]);
  expect(readNote).toHaveBeenCalledTimes(1);
});
it("rejects projected replacement expansion before allocating output", async () => {
  vi.mocked(readNote).mockResolvedValue({text: "a".repeat(10_000), revision: "r1", bookmarks: []});
  const result = await previewWorkspaceReplace([{root: "/local", name: "Local", files: [{path: "a.md", name: "a.md"}]}],
    "a", "b".repeat(100_000), defaultSearchOptions, () => []);
  expect(result.files).toEqual([]);
  expect(result.warnings.join(" ")).toContain("combined before/after text-size limit");
});
it("budgets combined before and after text across preview files", async () => {
  vi.mocked(readNote).mockResolvedValue({text: "a".repeat(700_000), revision: "r1", bookmarks: []});
  const result = await previewWorkspaceReplace([{root: "/local", name: "Local", files: ["a.md", "b.md", "c.md"].map(path => ({path, name: path}))}],
    "a+", "b".repeat(700_000), {...defaultSearchOptions, regexp: true}, () => []);
  expect(result.files.map(file => file.path)).toEqual(["a.md", "b.md"]);
  expect(result.warnings.join(" ")).toContain("combined before/after text-size limit");
  expect(result.files.reduce((length, file) => length + file.before.length + file.after.length, 0)).toBe(2_800_000);
});
