// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Editor, { type EditorHandle } from "./Editor";
import { DocumentEditor } from "./DocumentEditor";
import { headingOutline } from "./markdownOutline";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
HTMLElement.prototype.scrollTo = () => {};

it.each([undefined, "edit", "read"] as const)("navigates duplicate headings in %s mode without editing source", async documentMode => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host), ref = createRef<EditorHandle>();
  const text = "# Same\n\nFirst paragraph.\n\n## Same\n\nLast paragraph.";
  const target = headingOutline(text)[1];
  const onChange = vi.fn();
  const scroll = vi.spyOn(DocumentEditor.prototype, "scrollSelectionIntoView");
  try {
    await act(async () => root.render(<Editor ref={ref} initial={text} bookmarks={[]} isMarkdown
      documentMode={documentMode} onChange={onChange} onBookmarks={() => {}} onCursor={() => {}}
      onBookmark={() => {}} onSave={() => {}} showLineNumbers showLineHighlight={false} wordWrap spellcheck={false} />));
    await act(async () => ref.current!.jump(target.from));
    expect(ref.current!.text()).toBe(text);
    expect(ref.current!.selection().from).toBe(target.from);
    expect(ref.current!.isDocumentView()).toBe(!!documentMode);
    if (documentMode) expect(scroll).toHaveBeenCalled();
    if (documentMode === "edit") {
      const selection = window.getSelection();
      expect(selection?.anchorNode?.parentElement?.closest("h2")?.textContent).toBe("Same");
    }
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove(); scroll.mockRestore(); vi.unstubAllGlobals();
  }
});
