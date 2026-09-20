// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { EditorState, type Transaction } from "@codemirror/state";
import { history, isolateHistory, undo, redo } from "@codemirror/commands";
import { DocumentEditor } from "./DocumentEditor";
import { parseDocument, taskOffsets, textChanges } from "./documentMarkdown";

// ProseMirror resolves Mod when its keymap module is first loaded.
vi.hoisted(() => Object.defineProperty(navigator, "platform", { configurable: true, get: () => "MacIntel" }));

const editors: DocumentEditor[] = [];
function create(source: string) {
  const mount = document.createElement("div");
  document.body.append(mount);
  const change = vi.fn();
  const editor = new DocumentEditor(mount, source, { change, selection: vi.fn(), undo: vi.fn(), redo: vi.fn(), save: vi.fn(), bookmark: vi.fn() });
  editors.push(editor);
  return { editor, mount, change };
}
afterEach(() => { editors.splice(0).forEach(e => e.destroy()); document.body.replaceChildren(); });

it("uses identical document markup for Read and Edit without rewriting Markdown", () => {
  const source = "# Heading\n\nA **bold** paragraph.\n\n- one\n    - nested\n\n1. one\n    2. two\n\n- [ ] Task\n\n> Quote\n\n```js\nconst a = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n";
  const { editor, change } = create(source);
  const html = editor.editor.view.dom.innerHTML;
  editor.setEditable(false, false);
  expect(editor.editor.view.dom.innerHTML).toBe(html);
  editor.setEditable(true, true);
  expect(editor.editor.view.dom.innerHTML).toBe(html);
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
  expect(editor.editor.view.dom.querySelector("ol ol")?.getAttribute("start")).toBe("2");
  expect(editor.editor.view.dom.querySelector("table")).not.toBeNull();
});

it.each([
  ["Control", "First"], ["Control", "Bullet"], ["Control", "Task"],
  ["Command", "First"], ["Command", "Bullet"], ["Command", "Task"],
])("selects and replaces the entire Markdown document with %s+A from %s", (modifier, start) => {
  const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  try {
    const source = "# Heading\n\nFirst paragraph.\n\n- Bullet\n  - Nested\n\n- [ ] Task\n- [x] Done\n\nLast paragraph.";
    const { editor, change } = create(source);
    editor.select(source.indexOf(start) + 3, undefined, false);
    const event = new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: modifier === "Control", metaKey: modifier === "Command", bubbles: true, cancelable: true });
    editor.editor.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.editor.state.selection.from).toBe(0);
    expect(editor.editor.state.selection.to).toBe(editor.editor.state.doc.content.size);
    expect(editor.sourceSelection()).toEqual({ anchor: 0, head: source.length });
    expect(editor.editor.view.dom.querySelectorAll(".document-all-selected")).toHaveLength(editor.editor.state.doc.childCount);
    expect(editor.source).toBe(source);
    expect(change).not.toHaveBeenCalled();
    editor.editor.commands.insertContent("Replacement");
    expect(editor.source.trim()).toBe("Replacement");
    expect(editor.editor.state.doc.childCount).toBe(1);
    expect(editor.editor.state.doc.firstChild?.type.name).toBe("paragraph");
  } finally {
    platform.mockRestore();
  }
});

it("allows only checkbox changes in Read and preserves exact source formatting", () => {
  const source = "# Tasks\r\n\r\n* [ ] same\r\n* [X] same\r\n";
  const { editor, mount, change } = create(source);
  editor.setEditable(false, false);
  editor.editor.commands.insertContent("FORBIDDEN");
  editor.format("h2");
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
  const boxes = mount.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  boxes[1].click();
  expect(editor.source).toBe(source.replace("[X]", "[ ]"));
  expect(change).toHaveBeenCalledTimes(1);
  boxes[0].click();
  expect(editor.source).toBe(source.replace("* [ ] same", "* [x] same").replace("[X]", "[ ]"));
});

it("edits a paragraph without normalizing surrounding lists or reference definitions", () => {
  const source = "Intro\n\n*   original\n*   list\n\n[ref]: https://example.com\n";
  const { editor } = create(source);
  editor.editor.commands.setTextSelection(6);
  editor.editor.commands.insertContent(" added");
  expect(editor.source).toBe(source.replace("Intro", "Intro added"));
  editor.setEditable(false, false);
  editor.setSource(source);
  expect(editor.editor.state.doc.textContent).toContain("Intro");
  expect(editor.source).toBe(source);
});

it.each(["bullet", "numbered", "task"] as const)("types after a %s control in an empty document", action => {
  const { editor } = create("");
  editor.format(action);
  editor.editor.commands.insertContent("hello");
  expect(editor.source).toContain(action === "numbered" ? "1. hello" : action === "task" ? "- [ ] hello" : "- hello");
});

it("maps selections to Markdown offsets and back across repeated formatted text", () => {
  const source = "# Heading\n\nFirst **same**.\n\nSecond **same**.";
  const { editor } = create(source);
  const from = source.lastIndexOf("same");
  editor.select(from, from + 4, false);
  expect(editor.editor.state.doc.textBetween(editor.editor.state.selection.from, editor.editor.state.selection.to)).toBe("same");
  const selection = editor.sourceSelection();
  expect(source.slice(selection.anchor, selection.head).replaceAll("**", "")).toBe("same");
});

it("preserves unsupported Markdown instead of discarding it on nearby edits", () => {
  const source = "Intro\n\nFootnote[^1]\n\n[^1]: keep this\n\n<div>literal html</div>\n";
  const { editor } = create(source);
  editor.editor.commands.insertContentAt(6, " added");
  expect(editor.source).toBe(source.replace("Intro", "Intro added"));
});

it("locates nested tasks and emits granular source changes", () => {
  const text = "- [ ] parent\n    - [x] child\n\n```\n- [ ] code\n```";
  expect(taskOffsets(text)).toEqual([3, 20]);
  expect(textChanges("before [ ] after", "before [x] after")).toEqual([{ from: 8, to: 9, insert: "x" }]);
  expect(parseDocument(text).parts).toHaveLength(2);
});

it("supports checking tasks mixed with ordinary bullets in Read", () => {
  const source = "- ordinary\n- [ ] task\n- ordinary again\n";
  const { editor, mount } = create(source);
  editor.setEditable(false, false);
  mount.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  expect(editor.source).toBe(source.replace("[ ]", "[x]"));
});

it("preserves column alignment when editing a Markdown table", () => {
  const { editor, mount } = create("| Left | Right |\n| :--- | ---: |\n| a | b |\n");
  expect(mount.querySelectorAll("th")[1].style.textAlign).toBe("right");
  let target = 0;
  editor.editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === "b") target = pos; });
  editor.editor.commands.insertContentAt(target + 1, " edited");
  expect(editor.source).toContain("---:");
  expect(editor.source).toContain("b edited");
});

it.each(["- first\n- second", "1. first\n2. second", "- [ ] first\n- [ ] second"])("nests and outdents with Tab: %s", source => {
  const { editor } = create(source);
  editor.select(source.indexOf("second"), undefined, false);
  const key = (shiftKey: boolean) => editor.editor.view.someProp("handleKeyDown", handler => handler(editor.editor.view, new KeyboardEvent("keydown", { key: "Tab", shiftKey })));
  expect(key(false)).toBe(true);
  const nested = editor.editor.state.doc;
  expect(nested.child(0).childCount).toBe(1);
  expect(nested.child(0).child(0).childCount).toBe(2);
  expect(key(true)).toBe(true);
  expect(editor.editor.state.doc.child(0).childCount).toBe(2);
});

// Building 10,000 DOM blocks takes longer on Windows CI; retain the full fixture
// and correctness assertions without treating the default timeout as a benchmark.
it("maps selections across thousands of formatted blocks without a whole-document diff", () => {
  const source = "## Heading\n\nA **bold** paragraph with *emphasis* and `code`.\n\n".repeat(5_000) + "The unique ending.";
  const { editor, change } = create(source);
  const offset = source.indexOf("unique ending");
  editor.setSource(source, offset, offset + "unique ending".length);
  expect(editor.sourceSelection()).toEqual({ anchor: offset, head: offset + "unique ending".length });
  expect(editor.editor.state.doc.textBetween(editor.editor.state.selection.from, editor.editor.state.selection.to)).toBe("unique ending");
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
}, 15_000);

it("keeps checklist layout stable when undoing and redoing typing in a following bullet list", () => {
  const { editor, change, mount } = create("");
  let state = EditorState.create({ extensions: [history()] });
  change.mockImplementation((source, selection) => {
    state = state.update({ changes: textChanges(state.doc.toString(), source), selection,
      annotations: isolateHistory.of("full"), userEvent: "input" }).state;
  });
  editor.format("task");
  for (const text of ["First task", "Second task", "Third task"]) {
    editor.editor.commands.insertContent(text);
    editor.editor.commands.splitListItem("taskItem");
  }
  editor.editor.commands.liftListItem("taskItem");
  editor.format("bullet");
  editor.editor.commands.insertContent("Bullet");
  const source = editor.source;
  const checklist = mount.querySelector('ul[data-type="taskList"]')!.outerHTML;
  editor.editor.commands.insertContent(" typing");
  const dispatch = (tr: Transaction) => {
    state = tr.state;
    editor.setSource(state.doc.toString(), state.selection.main.anchor, state.selection.main.head);
  };
  expect(undo({ state, dispatch })).toBe(true);
  expect(editor.source).toBe(source);
  expect(mount.querySelector('ul[data-type="taskList"]')?.outerHTML).toBe(checklist);
  expect(editor.editor.state.doc.childCount).toBe(2);
  expect(editor.editor.state.doc.child(1).type.name).toBe("bulletList");
  expect(redo({ state, dispatch })).toBe(true);
  expect(editor.source).toBe(source + " typing");
  expect(mount.querySelector('ul[data-type="taskList"]')?.outerHTML).toBe(checklist);
  const offset = editor.source.indexOf("Bullet");
  editor.select(offset, offset + 6, false);
  expect(editor.editor.state.doc.textBetween(editor.editor.state.selection.from, editor.editor.state.selection.to)).toBe("Bullet");
});

it.each([
  "* [ ] task\r\n* bullet\r\n* [x] another task\r\n",
  "- parent\n  - [ ] task\n  - bullet\n  - [x] another task\n",
])("preserves source and task offsets when separating mixed list runs: %s", source => {
  const { editor, mount } = create(source);
  const lists = mount.querySelectorAll('ul[data-type="taskList"]');
  expect(lists).toHaveLength(2);
  expect([...lists].every(list => list.children.length === 1)).toBe(true);
  const offset = source.indexOf("bullet");
  editor.select(offset, offset + 6, false);
  expect(editor.editor.state.doc.textBetween(editor.editor.state.selection.from, editor.editor.state.selection.to)).toBe("bullet");
  mount.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  expect(editor.source).toBe(source.replace("[ ]", "[x]"));
});


it("keeps a read-mode search selection decorated while the find input has focus", () => {
  const { editor, mount, change } = create("A **needle** here.");
  editor.setEditable(false, false);
  editor.select(4, 10, false);
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  expect(mount.querySelector(".read-search-selection")?.textContent).toBe("needle");
  expect(change).not.toHaveBeenCalled();
});


it("scrolls the reading pane to a match even when Find owns focus", () => {
  const { editor, mount, change } = create("First needle.\n\nLast needle.");
  const pane = document.createElement("div");
  pane.className = "document-pane";
  mount.before(pane);
  pane.append(mount);
  Object.defineProperty(pane, "clientHeight", { value: 400 });
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
  pane.scrollTo = vi.fn();
  editor.setEditable(false, false);
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  editor.select(20, 26, false);
  vi.spyOn(editor.editor.view, "coordsAtPos").mockReturnValue({ top: 1500, bottom: 1520, left: 0, right: 20 });
  editor.scrollSelectionIntoView();
  expect(pane.scrollTo).toHaveBeenLastCalledWith({ top: 1210, behavior: "instant" });
  expect(document.activeElement).toBe(input);
  expect(change).not.toHaveBeenCalled();
});
