import { it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { formatTransaction } from "./richMarkdown";
import { dictationAnchor, setDictationAnchor } from "./dictation";
it("adds and removes bold without rewriting surrounding Markdown", () => {
  let s = EditorState.create({
    doc: "before hello [link](https://example.com)\n",
    selection: { anchor: 7, head: 12 },
  });
  s = formatTransaction(s, "bold").state;
  expect(s.doc.toString()).toBe(
    "before **hello** [link](https://example.com)\n",
  );
  s = formatTransaction(s, "bold").state;
  expect(s.doc.toString()).toBe("before hello [link](https://example.com)\n");
});
it("formats selected lines without touching the next line at a selection boundary", () => {
  const s = EditorState.create({
    doc: "first\nsecond\nthird",
    selection: { anchor: 0, head: 13 },
  });
  expect(formatTransaction(s, "h2").state.doc.toString()).toBe(
    "## first\n## second\nthird",
  );
});
it("replaces block syntax and keeps task contents", () => {
  const s = EditorState.create({
    doc: "- [x] finished",
    selection: { anchor: 8 },
  });
  expect(formatTransaction(s, "quote").state.doc.toString()).toBe("> finished");
});
it("formatting is undoable and moves live dictation anchors", () => {
  let state = EditorState.create({
    doc: "hello",
    selection: { anchor: 0, head: 5 },
    extensions: [history(), dictationAnchor],
  });
  state = state.update({ effects: setDictationAnchor.of(5) }).state;
  state = formatTransaction(state, "h1").state;
  expect(state.field(dictationAnchor)).toBe(7);
  undo({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  expect(state.doc.toString()).toBe("hello");
});
