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
import { documentChanged } from "./documentChanged";

// jsdom has no layout engine; CodeMirror measures ranges during viewport updates.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

it("clears unsaved state on undo or manual restoration and restores it on redo", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const ref = createRef<EditorHandle>();
  let saved = { text: "Original text", revision: "1", bookmarks: [] };
  let dirty = false;
  const update = () => { dirty = documentChanged(saved, ref.current!.text(), ref.current!.marks()); };
  try {
    await act(async () => root.render(<Editor ref={ref} initial={saved.text}
      bookmarks={[]} onChange={update} onBookmarks={update}
      onCursor={() => {}} onBookmark={() => {}} onSave={() => {}}
      isMarkdown={false} showLineNumbers showLineHighlight={false} wordWrap={false} spellcheck={false} />));
    const view = EditorView.findFromDOM(container.querySelector(".cm-editor")!)!;
    await act(async () => view.dispatch({ changes: { from: view.state.doc.length, insert: "!" } }));
    expect(dirty).toBe(true);
    await act(async () => ref.current!.undo());
    expect(dirty).toBe(false);
    await act(async () => ref.current!.redo());
    expect(dirty).toBe(true);
    await act(async () => view.dispatch({ changes: { from: view.state.doc.length - 1, to: view.state.doc.length } }));
    expect(dirty).toBe(false);
    // A new save becomes the baseline for subsequent undo/redo operations.
    await act(async () => ref.current!.undo());
    saved = { ...saved, text: ref.current!.text(), revision: "2" };
    update();
    expect(dirty).toBe(false);
    await act(async () => ref.current!.redo());
    expect(dirty).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

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

it("removes a saved Source bookmark from its gutter without changing Markdown", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const ref = createRef<EditorHandle>();
  const onBookmarks = vi.fn();
  const text = "- Saved item";
  try {
    await act(async () => root.render(<Editor ref={ref} initial={text}
      bookmarks={[{ id: "saved", name: "Saved item", from: 2, to: text.length, quote: "Saved item" }]}
      onChange={() => {}} onBookmarks={onBookmarks} onCursor={() => {}} onBookmark={() => {}} onSave={() => {}}
      isMarkdown showLineNumbers showLineHighlight={false} wordWrap={false} spellcheck={false} />));
    const button = container.querySelector<HTMLButtonElement>('.cm-bookmark-entry button.is-bookmarked')!;
    expect(button.title).toBe("Remove bookmark: Saved item");
    await act(async () => button.click());
    expect(onBookmarks).toHaveBeenCalledWith([]);
    expect(ref.current!.text()).toBe(text);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it.each(["notes.txt", "NOTES.TXT", "notes.md", "code.ts"])("handles typed arrows according to file type in %s", async filePath => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const ref = createRef<EditorHandle>();
  const converts = /\.txt$/i.test(filePath);
  try {
    await act(async () => root.render(<Editor ref={ref} initial="existing -> <- " filePath={filePath}
      bookmarks={[]} onChange={() => {}} onBookmarks={() => {}}
      onCursor={() => {}} onBookmark={() => {}} onSave={() => {}}
      isMarkdown={filePath.endsWith(".md")} showLineNumbers={false} showLineHighlight={false}
      wordWrap={false} spellcheck={false} />));
    const view = EditorView.findFromDOM(container.querySelector(".cm-editor")!)!;
    const type = (text: string) => {
      for (const char of text) {
        const { from, to } = view.state.selection.main;
        const insert = () => view.state.update({ changes: { from, to, insert: char },
          selection: { anchor: from + char.length }, userEvent: "input.type" });
        if (!view.state.facet(EditorView.inputHandler).some(handler => handler(view, from, to, char, insert)))
          view.dispatch(insert());
      }
    };
    expect(ref.current!.text()).toBe("existing -> <- ");
    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      type("->");
    });
    expect(ref.current!.text()).toBe("existing -> <- " + (converts ? "→" : "->"));
    if (converts) {
      await act(async () => ref.current!.undo());
      expect(ref.current!.text()).toBe("existing -> <- ->");
      await act(async () => ref.current!.redo());
      expect(ref.current!.text()).toBe("existing -> <- →");
    }
    await act(async () => type(" left<-"));
    expect(ref.current!.text()).toContain(converts ? " left←" : " left<-");
    if (converts) {
      await act(async () => {
        expect(runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Backspace" }), "editor")).toBe(true);
      });
      expect(ref.current!.text()).toContain(" left<-");
      await act(async () => type(" literal"));
      expect(ref.current!.text()).toContain(" left<- literal");
    }
    await act(async () => view.dispatch(view.state.replaceSelection(" pasted -> <-"), { userEvent: "input.paste" }));
    expect(ref.current!.text()).toContain(" pasted -> <-");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
