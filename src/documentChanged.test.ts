import { expect, it } from "vitest";
import { documentChanged } from "./documentChanged";
import type { DocumentData } from "./model";

const saved: DocumentData = { text: "Original text", revision: "1", bookmarks: [] };

it("compares with saved content, including recovered drafts and later saves", () => {
  expect(documentChanged(saved, "Edited text", [])).toBe(true);
  expect(documentChanged(saved, saved.text, [])).toBe(false);
  const laterSave = { ...saved, text: "Edited text", revision: "2" };
  expect(documentChanged(laterSave, saved.text, [])).toBe(true);
  expect(documentChanged(laterSave, laterSave.text, [])).toBe(false);
  expect(documentChanged(undefined, saved.text, [])).toBe(true);
});

it("retains bookmark changes without treating derived line metadata as an edit", () => {
  const bookmark = { id: "a", name: "Passage", from: 0, to: 8, quote: "Original" };
  const withBookmark = { ...saved, bookmarks: [bookmark] };
  expect(documentChanged(withBookmark, saved.text, [{ ...bookmark, line: 1, unresolved: false }])).toBe(false);
  expect(documentChanged(withBookmark, saved.text, [{ ...bookmark, name: "Renamed" }])).toBe(true);
  expect(documentChanged(withBookmark, saved.text, [])).toBe(true);
  expect(documentChanged(saved, saved.text, [bookmark])).toBe(true);
});
