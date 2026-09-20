// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { searchKeymap } from "@codemirror/search";
import { editorSearch } from "./editorSearch";
import { EditorState } from "@codemirror/state";
import { expect, it, vi } from "vitest";
import Editor, { type EditorHandle } from "./Editor";
import { DocumentEditor } from "./DocumentEditor";
import { RICH_DOCUMENT_LIMIT, supportsDocumentView } from "./documentLimits";

// jsdom has no layout engine; CodeMirror measures ranges during viewport updates.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

vi.mock("./DocumentEditor", () => ({
  DocumentEditor: vi.fn(function () { throw new Error("Large notes must not construct the rich editor"); }),
}));

it("keeps the size boundary and restored drafts out of rich rendering", () => {
  expect(supportsDocumentView(RICH_DOCUMENT_LIMIT)).toBe(true);
  expect(supportsDocumentView(RICH_DOCUMENT_LIMIT + 1)).toBe(false);
  expect(supportsDocumentView(10, 2_300_000)).toBe(false);
});

it.each([false, true])("opens and edits a 2.3 MB Markdown note without rich parsing (snapshot: %s)", async restored => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const text = "# Heading\n\nA **formatted** paragraph.\n\n".repeat(65_000) + "Last line.";
  expect(text.length).toBeGreaterThan(2_300_000);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const ref = createRef<EditorHandle>();
  const onChange = vi.fn();
  try {
    await act(async () => root.render(<Editor ref={ref}
      initial={restored ? "Old text" : text}
      snapshot={restored ? { state: EditorState.create({ doc: text }), scrollTop: 0 } : undefined}
      bookmarks={[]} onChange={onChange} onBookmarks={() => {}}
      onCursor={() => {}} onBookmark={() => {}} onSave={() => {}}
      isMarkdown documentMode="edit" showLineNumbers showLineHighlight={false}
      wordWrap={false} spellcheck={false} />));
    expect(DocumentEditor).not.toHaveBeenCalled();
    expect(ref.current!.isDocumentView()).toBe(false);
    expect(ref.current!.text()).toBe(text);
    expect(container.querySelector<HTMLElement>(".source-editor-mount")!.hidden).toBe(false);
    // Editing and undo must still reach the end of the complete document.
    await act(async () => {
      ref.current!.jump(text.length);
      ref.current!.beginDictation();
      ref.current!.insertDictation("Added ending");
    });
    expect(ref.current!.text()).toContain("Last line. Added ending");
    expect(onChange).toHaveBeenCalled();
    await act(async () => ref.current!.undo());
    expect(ref.current!.text()).toBe(text);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("changes language on rename and preserves text and undo across restored tabs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const ref = createRef<EditorHandle>();
  const render = (filePath: string, snapshot?: ReturnType<EditorHandle["snapshot"]>) => root.render(
    <Editor ref={ref} initial="class Main {}" snapshot={snapshot} filePath={filePath}
      bookmarks={[]} onChange={() => {}} onBookmarks={() => {}} onCursor={() => {}}
      onBookmark={() => {}} onSave={() => {}} isMarkdown={false}
      showLineNumbers showLineHighlight={false} wordWrap={false} spellcheck />,
  );
  try {
    await act(async () => render("Main.java"));
    expect(container.querySelector(".cm-scroller > .source-file-heading")?.textContent).toBe("Main");
    expect(container.querySelector(".cm-foldGutter")).not.toBeNull();
    expect(container.querySelector(".cm-content")?.getAttribute("spellcheck")).toBe("false");
    await act(async () => {
      ref.current!.jump(ref.current!.text().length);
      ref.current!.beginDictation();
      ref.current!.insertDictation("addition");
    });
    const snapshot = ref.current!.snapshot();
    await act(async () => render("Main.txt"));
    expect(container.querySelector(".cm-scroller > .source-file-heading")?.textContent).toBe("Main");
    expect(ref.current!.text()).not.toContain("Main.txt");
    expect(container.querySelector(".cm-foldGutter")).toBeNull();
    expect(container.querySelector(".cm-content")?.getAttribute("spellcheck")).toBe("true");
    expect(ref.current!.text()).toContain("addition");
    await act(async () => root.render(null));
    await act(async () => render("Main.java", snapshot));
    expect(container.querySelector(".cm-foldGutter")).not.toBeNull();
    await act(async () => ref.current!.undo());
    expect(ref.current!.text()).toBe("class Main {}");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("toggles Find from the editor and search field while preserving the query", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = new EditorView({ parent: container, doc: "needle", extensions: [editorSearch, keymap.of(searchKeymap)] });
  const findEvent = () => new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
  try {
    view.focus();
    expect(runScopeHandlers(view, findEvent(), "editor")).toBe(true);
    const input = container.querySelector<HTMLInputElement>('[main-field]')!;
    expect(document.activeElement).toBe(input);
    input.value = "needle";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const closeEvent = findEvent();
    input.dispatchEvent(closeEvent);
    expect(closeEvent.defaultPrevented).toBe(true);
    expect(container.querySelector('[main-field]')).toBeNull();
    expect(view.hasFocus).toBe(true);
    expect(runScopeHandlers(view, findEvent(), "editor")).toBe(true);
    expect(container.querySelector<HTMLInputElement>('[main-field]')!.value).toBe("needle");
    // Find also closes when focus has moved back into the editor.
    view.focus();
    expect(runScopeHandlers(view, findEvent(), "editor")).toBe(true);
    expect(container.querySelector('[main-field]')).toBeNull();
  } finally {
    view.destroy();
    container.remove();
  }
});
