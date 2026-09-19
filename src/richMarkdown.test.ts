import { it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { formatTransaction, paragraphStyle, formattingKeymap } from "./richMarkdown";
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

it("supports all heading levels and resets numbered lists to normal text", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const initial = EditorState.create({ doc: "3. hello", selection: { anchor: 4 } });
    const heading = formatTransaction(initial, `h${level}`).state;
    expect(heading.doc.toString()).toBe(`${"#".repeat(level)} hello`);
    expect(paragraphStyle(heading)).toBe(`h${level}`);
    expect(formatTransaction(heading, "paragraph").state.doc.toString()).toBe("hello");
  }
});

it("numbers selected lines and converts existing list markers", () => {
  const state = EditorState.create({ doc: "- one\n- [x] two\n3. three\nlast", selection: { anchor: 0, head: 24 } });
  expect(formatTransaction(state, "numbered").state.doc.toString()).toBe("1. one\n2. two\n3. three\nlast");
});

it("format shortcuts modify the selection and leave plain text editors alone", () => {
  let state = EditorState.create({ doc: "hello", selection: { anchor: 0, head: 5 } });
  const view = { get state() { return state; }, dispatch: (tr: import("@codemirror/state").Transaction) => { state = tr.state; } } as import("@codemirror/view").EditorView;
  const keys = formattingKeymap(() => true);
  expect(keys.find(k => k.key === "Mod-b")!.run!(view)).toBe(true);
  expect(state.doc.toString()).toBe("**hello**");
  keys.find(k => k.key === "Mod-b")!.run!(view);
  keys.find(k => k.key === "Mod-i")!.run!(view);
  expect(state.doc.toString()).toBe("*hello*");
  expect(formattingKeymap(() => false)[0].run!(view)).toBe(false);
  expect(state.doc.toString()).toBe("*hello*");
});
