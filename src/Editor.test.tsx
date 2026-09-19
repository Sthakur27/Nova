// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
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
