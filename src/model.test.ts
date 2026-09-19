import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { bookmarkField } from "./Editor";
import { filenameMatches, reanchor, type Bookmark } from "./model";
const mark: Bookmark = {
  id: "1",
  name: "Important",
  from: 6,
  to: 12,
  quote: "target",
};
describe("bookmark recovery", () => {
  it("recovers a passage moved outside the editor", () => {
    const text = "An external introduction\nHello target world";
    expect(reanchor([mark], text)[0].from).toBe(text.indexOf("target"));
  });
  it("chooses the nearest repeated passage", () => {
    expect(
      reanchor(
        [{ ...mark, from: 40, to: 46 }],
        "target" + ".".repeat(40) + "target",
      )[0].from,
    ).toBe(46);
  });
  it("marks a missing anchor as unresolved instead of jumping somewhere else", () => {
    expect(reanchor([mark], "Nothing here")[0].unresolved).toBe(true);
  });
  it("uses UTF-16 positions consistently for emoji", () => {
    expect(reanchor([mark], "🌙 target")[0].from).toBe(3);
  });
});
describe("live bookmark tracking", () => {
  const make = () =>
    EditorState.create({
      doc: "Hello target world",
      extensions: [bookmarkField.init(() => [mark])],
    });
  it("moves when text is inserted before it", () => {
    const tr = make().update({ changes: { from: 0, insert: "New\n" } });
    expect(tr.state.field(bookmarkField)[0]).toMatchObject({
      from: 10,
      to: 16,
      quote: "target",
    });
  });
  it("keeps the original anchor when text is inserted exactly at its start", () => {
    const tr = make().update({ changes: { from: 6, insert: "new " } });
    expect(tr.state.field(bookmarkField)[0]).toMatchObject({
      from: 10,
      to: 16,
      quote: "target",
    });
  });
  it("flags deleted passages", () => {
    const tr = make().update({ changes: { from: 6, to: 12 } });
    expect(tr.state.field(bookmarkField)[0]).toMatchObject({
      from: 6,
      to: 6,
      unresolved: true,
    });
  });
});
it("ranks filename starts before substrings and parent folder matches", () => {
  const files = ["notes/other.md", "my notes.md", "notes.md"].map((path) => ({
    path,
    name: path.split("/").at(-1)!,
  }));
  expect(filenameMatches(files, "notes").map((f) => f.path)).toEqual([
    "notes.md",
    "my notes.md",
    "notes/other.md",
  ]);
});
