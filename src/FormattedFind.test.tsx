// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Editor, { type EditorHandle } from "./Editor";
import ReadFind from "./ReadFind";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.scrollTo = vi.fn();

it.each(["edit", "read"] as const)("finds and navigates Markdown while preserving %s mode and source", async mode => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef<EditorHandle>();
  const source = "# Heading\n\nA **needle** and another needle.\n";
  const onChange = vi.fn();
  const jump = (from: number, to: number) => ref.current!.jump(from, to);
  const press = async (target: EventTarget, key: string, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
    await act(async () => { target.dispatchEvent(event); });
    return event;
  };
  try {
    await act(async () => root.render(<>
      <ReadFind text={source} disabled={false} onJump={jump} onHighlight={(matches, active) => ref.current?.setFindMatches(matches, active)} />
      <Editor ref={ref} initial={source} bookmarks={[]} onChange={onChange}
        onBookmarks={() => {}} onCursor={() => {}} onBookmark={() => {}} onSave={() => {}}
        isMarkdown documentMode={mode} showLineNumbers={false} showLineHighlight={false}
        wordWrap spellcheck={false} />
    </>));
    const rich = host.querySelector<HTMLElement>(".tiptap")!;
    rich.focus();
    expect((await press(rich, "f", { metaKey: true })).defaultPrevented).toBe(true);
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Find in note"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "needle");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("1 of 2");
    expect([...rich.querySelectorAll(".note-find-hit")].map(node => node.textContent)).toEqual(["needle", "needle"]);
    expect(rich.querySelector(".note-find-current")).toBe(rich.querySelectorAll(".note-find-hit")[0]);
    expect(ref.current!.selection().from).toBe(source.indexOf("needle"));
    await press(input, "Enter");
    expect(ref.current!.selection().from).toBe(source.lastIndexOf("needle"));
    expect(document.activeElement).toBe(input);
    expect(rich.querySelector(".note-find-current")).toBe(rich.querySelectorAll(".note-find-hit")[1]);
    await press(input, "Escape");
    expect(host.querySelector('[role="search"]')).toBeNull();
    expect(rich.querySelector(".note-find-hit")).toBeNull();
    expect(ref.current!.isDocumentView()).toBe(true);
    expect(host.querySelector<HTMLElement>(".source-editor-mount")!.hidden).toBe(true);
    expect(host.querySelector(".document-pane")!.getAttribute("data-mode")).toBe(mode);
    expect(ref.current!.text()).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
