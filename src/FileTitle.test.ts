import { expect, it } from "vitest";
import { fileTitle } from "./FileTitle";

it.each([
  ["Notes/Getting started.md", "Getting started"],
  ["C:\\Notes\\Scratchpad.txt", "Scratchpad"],
  ["Notes/Version 1.2.md", "Version 1.2"],
  ["README", "README"],
  [".env", ".env"],
  [".settings.json", ".settings"],
  ["Notes/草稿 📝.md", "草稿 📝"],
  ["Notes/" + "long".repeat(100) + ".md", "long".repeat(100)],
  ["", "Untitled"],
])("formats the file title for %s", (path, expected) => {
  expect(fileTitle(path)).toBe(expected);
});
