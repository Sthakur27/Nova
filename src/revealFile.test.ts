import { expect, it } from "vitest";
import { revealFile } from "./revealFile";

it("expands only the active file ancestors in a fully loaded tree", () => {
  const folder = { root: "/notes", name: "Notes", collapsed: true, files: [
    { path: "a/b/note.md", name: "note.md" }, { path: "other/keep.md", name: "keep.md" },
  ] };
  expect(revealFile(folder, "a/b/note.md")).toMatchObject({ collapsed: false, closedDirectories: ["other"] });
  expect(folder.collapsed).toBe(true);
});

it("retains existing expansion and pagination when revealing an unloaded file", () => {
  expect(revealFile({ root: "/notes", name: "Notes", files: [], directories: ["other"],
    expandedDirectories: ["other"], directoryPages: { "": 300 } }, "a/b/note.md"))
    .toMatchObject({ directories: ["other", "a", "a/b"], expandedDirectories: ["other", "a", "a/b"], directoryPages: { "": 300 } });
});
