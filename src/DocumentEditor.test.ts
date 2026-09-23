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
  const formatting = vi.fn();
  const bookmark = vi.fn();
  const editor = new DocumentEditor(mount, source, { change, formatting, selection: vi.fn(), undo: vi.fn(), redo: vi.fn(), save: vi.fn(), bookmark });
  editors.push(editor);
  return { editor, mount, change, formatting, bookmark };
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

it("tracks the selected visual line in Edit and Read and disables without modifying Markdown", async () => {
  const source = "First paragraph.\n\nSecond paragraph.";
  const { editor, change } = create(source);
  const dom = editor.editor.view.dom;
  vi.spyOn(dom, "getClientRects").mockReturnValue([new DOMRect(0, 0, 400, 100)] as unknown as DOMRectList);
  vi.spyOn(dom, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 400, 100));
  const coords = vi.spyOn(editor.editor.view, "coordsAtPos").mockReturnValue({ top: 30, bottom: 50, left: 0, right: 0 });
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  editor.setLineHighlight(true);
  await frame();
  expect(dom.classList.contains("has-line-highlight")).toBe(true);
  expect(dom.style.getPropertyValue("--active-line-top")).toBe("10px");
  expect(dom.style.getPropertyValue("--active-line-height")).toBe("20px");
  editor.setEditable(false, false);
  coords.mockReturnValue({ top: 70, bottom: 90, left: 0, right: 0 });
  editor.select(source.indexOf("Second"), undefined, false);
  await frame();
  expect(dom.style.getPropertyValue("--active-line-top")).toBe("50px");
  editor.setLineHighlight(false);
  expect(dom.classList.contains("has-line-highlight")).toBe(false);
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
});

it("reports formatting when a shortcut toggles typing marks without changing the document", () => {
  const { editor, change, formatting } = create("hello");
  editor.select(2, 2, false);
  const pressBold = () => editor.editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true, cancelable: true }));
  pressBold();
  expect(editor.activeFormatting()).toContain("bold");
  expect(formatting).toHaveBeenLastCalledWith(["bold"]);
  expect(change).not.toHaveBeenCalled();
  pressBold();
  expect(editor.activeFormatting()).not.toContain("bold");
  expect(formatting).toHaveBeenLastCalledWith([]);
});

it("tracks marks and block formatting as the caret and selection move", () => {
  const source = "**bold** and *italic*\n\n- list\n\nplain";
  const { editor } = create(source);
  editor.select(3, 3, false);
  expect(editor.activeFormatting()).toContain("bold");
  editor.select(source.indexOf("italic") + 2, undefined, false);
  expect(editor.activeFormatting()).toEqual(["italic"]);
  editor.select(source.indexOf("list") + 2, undefined, false);
  expect(editor.activeFormatting()).toEqual(["bullet"]);
  editor.select(source.indexOf("plain") + 2, undefined, false);
  expect(editor.activeFormatting()).toEqual([]);
  editor.select(2, source.indexOf(" and") + 4, false);
  expect(editor.activeFormatting()).not.toContain("bold");
});

it("keeps bookmark markers on the saved block in Edit and Read without highlighting text", () => {
  const source = "First paragraph.\n\n- First item\n- Saved item";
  const { editor, mount, change } = create(source);
  const from = source.indexOf("Saved item");
  editor.setBookmarks([{ id: "saved", name: "Saved passage", from, to: source.length, quote: "Saved item" }]);
  for (const editable of [true, false, true]) {
    editor.setEditable(editable, false);
    expect(mount.querySelectorAll(".document-bookmarked")).toHaveLength(1);
    expect(mount.querySelector(".document-bookmarked")?.textContent).toBe("Saved item");
    expect(mount.querySelector(".bookmark-highlight")).toBeNull();
  }
  editor.setBookmarks([]);
  expect(mount.querySelector(".document-bookmarked")).toBeNull();
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
});

// Exercise the same input-rule path as browser typing, one character at a time.
function typeText(editor: DocumentEditor, text: string) {
  const view = editor.editor.view;
  for (const character of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", handler => handler(view, from, to, character, () => view.state.tr.insertText(character, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(character, from, to));
  }
}
function pressKey(editor: DocumentEditor, key: string) {
  const view = editor.editor.view;
  return view.someProp("handleKeyDown", handler => handler(view, new KeyboardEvent("keydown", { key })));
}

it.each([
  ["- ", "bulletList"], ["* ", "bulletList"], ["+ ", "bulletList"],
  ["1 ", "orderedList"], ["1. ", "orderedList"], ["1) ", "orderedList"], ["3. ", "orderedList"],
  ["# ", "heading"], ["###### ", "heading"], ["> ", "blockquote"],
  ["``` ", "codeBlock"], ["```js ", "codeBlock"], ["~~~ ", "codeBlock"],
  ["[ ] ", "taskList"], ["[x] ", "taskList"], ["- [ ] ", "taskList"],
  ["---", "horizontalRule"],
])("converts typed %j into %s", (text, type) => {
  const { editor } = create("");
  typeText(editor, text);
  if (type === "taskList") expect(editor.editor.view.dom.querySelector('input[type="checkbox"]')).not.toBeNull();
  else expect(editor.editor.state.doc.firstChild?.type.name).toBe(type);
  if (type !== "horizontalRule") {
    typeText(editor, "hello");
    expect(editor.editor.state.doc.textContent).toBe("hello");
    expect(parseDocument(editor.source).content.content?.[0].type).toBe(type);
  }
});

it.each([["**bold**", "bold"], ["*italic*", "italic"], ["~~strike~~", "strike"], ["`code`", "code"]])("formats typed %s inline", (text, mark) => {
  const { editor } = create("");
  typeText(editor, text);
  expect(editor.editor.state.doc.firstChild?.firstChild?.marks[0].type.name).toBe(mark);
});

it.each([["->", "→"], ["<-", "←"]])("converts typed %s to %s and restores it with Backspace", (typed, arrow) => {
  const { editor } = create("");
  typeText(editor, typed);
  expect(editor.editor.state.doc.textContent).toBe(arrow);
  expect(editor.source).toBe(arrow);
  pressKey(editor, "Backspace");
  expect(editor.editor.state.doc.textContent).toBe(typed);
  typeText(editor, " literal");
  expect(editor.editor.state.doc.textContent).toBe(typed + " literal");
});

it("continues typing after arrows while preserving untouched source and formatting", () => {
  const source = "*   untouched\r\n\r\n**Start**";
  const { editor } = create(source);
  editor.select(source.length - 2, undefined, false);
  typeText(editor, "->next<-end");
  expect(editor.source).toBe("*   untouched\r\n\r\n**Start→next←end**");
});

it.each(["`code`", "```\ncode\n```"])("keeps typed arrows literal in %j", source => {
  const { editor } = create(source);
  editor.editor.commands.setTextSelection(3);
  typeText(editor, "-> <-");
  expect(editor.editor.state.doc.textContent).toBe("co-> <-de");
});

it("preserves existing and programmatically inserted arrow markers", () => {
  const source = "A -> B <- C";
  const { editor, change } = create(source);
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
  editor.editor.commands.insertContent("-> <- ");
  expect(editor.editor.state.doc.textContent).toBe("-> <- " + source);
});

it("undoes a typing conversion with Backspace and continues and exits lists with Enter", () => {
  const { editor } = create("");
  typeText(editor, "- ");
  pressKey(editor, "Backspace");
  expect(editor.editor.state.doc.firstChild?.type.name).toBe("paragraph");
  expect(editor.editor.state.doc.textContent).toBe("- ");
  editor.setSource("");
  typeText(editor, "1 first");
  pressKey(editor, "Enter");
  typeText(editor, "second");
  expect(editor.source).toContain("2. second");
  pressKey(editor, "Enter");
  pressKey(editor, "Enter");
  expect(editor.editor.state.selection.$from.parent.type.name).toBe("paragraph");
  expect(editor.editor.state.selection.$from.depth).toBe(1);
});

it("leaves markers in prose and code literal and preserves surrounding source", () => {
  const source = "*   untouched\r\n\r\nEnd";
  const { editor } = create(source);
  editor.select(source.length, undefined, false);
  typeText(editor, " 1 - # ");
  expect(editor.source).toBe(source + " 1 - # ");
  editor.setSource("```\ncode\n```");
  editor.editor.commands.setTextSelection(1);
  typeText(editor, "1 - # ");
  expect(editor.editor.state.doc.firstChild?.type.name).toBe("codeBlock");
  expect(editor.editor.state.doc.textContent).toBe("1 - # code");
});

it.each(["1 ", "1) ", "[ ] ", "- [X] "])("restores %j with immediate Backspace", text => {
  const { editor } = create("");
  typeText(editor, text);
  pressKey(editor, "Backspace");
  expect(editor.editor.state.doc.textContent).toBe(text.startsWith("- ") ? text.slice(2) : text);
  expect(editor.editor.view.dom.querySelector('input[type="checkbox"]')).toBeNull();
});

it.each(["- ordinary\n- item", "3. ordinary\n4. item"])("converts only the current list item to a checked task: %s", source => {
  const { editor, mount } = create(source);
  editor.select(source.indexOf("item"), undefined, false);
  typeText(editor, "[X] ");
  const list = editor.editor.state.doc.firstChild!;
  expect(list.childCount).toBe(2);
  expect(list.child(0).type.name).toBe("listItem");
  expect(list.child(1).type.name).toBe("taskItem");
  expect(list.child(1).attrs.checked).toBe(true);
  expect(mount.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(editor.source).toContain("[x] item");
});

it("keeps numbered start values and leaves bare numbers other than 1 literal", () => {
  const { editor } = create("");
  typeText(editor, "3) third");
  expect(editor.editor.state.doc.firstChild?.attrs.start).toBe(3);
  expect(editor.source).toBe("3. third");
  editor.setSource("");
  typeText(editor, "2026 ");
  expect(editor.editor.state.doc.firstChild?.type.name).toBe("paragraph");
  expect(editor.editor.state.doc.textContent).toBe("2026 ");
});

it.each(["```", "```ts", "~~~python"])("starts multiline code with %s then Enter", fence => {
  const { editor } = create("");
  typeText(editor, fence);
  pressKey(editor, "Enter");
  expect(editor.editor.state.doc.firstChild?.type.name).toBe("codeBlock");
  expect(editor.activeFormatting()).toContain("codeBlock");
  typeText(editor, "first");
  pressKey(editor, "Enter");
  typeText(editor, "**literal**");
  expect(editor.editor.state.doc.firstChild?.textContent).toBe("first\n**literal**");
  pressKey(editor, "Enter");
  pressKey(editor, "Enter");
  pressKey(editor, "Enter");
  expect(editor.editor.isActive("codeBlock")).toBe(false);
});

it("toggles code blocks with the formatting action and preserves neighboring Markdown", () => {
  const source = "*   untouched\n\nhello";
  const { editor } = create(source);
  editor.select(source.indexOf("hello"), undefined, false);
  editor.format("codeBlock");
  expect(editor.activeFormatting()).toContain("codeBlock");
  expect(editor.source).toBe("*   untouched\n\n```\nhello\n```");
  editor.format("codeBlock");
  expect(editor.activeFormatting()).not.toContain("codeBlock");
  expect(editor.source).toBe(source);
});

it("keeps unfinished inline backticks literal until closed and does not turn prose fences into blocks", () => {
  const { editor } = create("");
  typeText(editor, "`code");
  expect(editor.editor.state.doc.textContent).toBe("`code");
  typeText(editor, "`");
  expect(editor.editor.state.doc.textContent).toBe("code");
  expect(editor.editor.state.doc.firstChild?.firstChild?.marks[0].type.name).toBe("code");
  editor.setSource("");
  typeText(editor, "example ```");
  pressKey(editor, "Enter");
  expect(editor.editor.isActive("codeBlock")).toBe(false);
});

it("adds and removes bookmarks from formatted list controls in Edit and Read without editing the list", () => {
  const source = "- First item\n- **Saved** item\n  - Nested item\n\n1. Numbered item\n\n- [ ] Task item";
  const { editor, mount, bookmark, change } = create(source);
  const from = source.indexOf("Saved"), to = source.indexOf("\n", from);
  for (const editable of [true, false]) {
    editor.setEditable(editable, false);
    editor.setBookmarks([{ id: "saved", name: "Saved passage", from, to, quote: source.slice(from, to) }]);
    const remove = mount.querySelector<HTMLButtonElement>('button[aria-label="Remove bookmark: Saved passage"]')!;
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    remove.click();
    expect(bookmark).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), ["saved"]);
    editor.setBookmarks([]);
    editor.select(source.indexOf("Nested item"), undefined, false);
    const nested = [...mount.querySelectorAll("p")].find(node => node.textContent === "Nested item")!;
    nested.querySelector<HTMLButtonElement>("button")!.click();
    const [start, end, ids] = bookmark.mock.lastCall!;
    expect(source.slice(start, end)).toBe("Nested item");
    expect(ids).toEqual([]);
    expect(mount.querySelectorAll("ul li").length).toBeGreaterThanOrEqual(4);
    expect(mount.querySelector("ol li")?.textContent).toBe("Numbered item");
    expect(mount.querySelector('input[type="checkbox"]')).not.toBeNull();
  }
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
});
