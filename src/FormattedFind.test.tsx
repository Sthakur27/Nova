// @vitest-environment jsdom
import { act, createRef, useState } from "react";
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
    if (mode === "read") {
      expect(ref.current!.replaceMatches(source, [{ from: source.indexOf("needle"), to: source.indexOf("needle") + 6 }], "changed")).toBe(false);
      expect(ref.current!.text()).toBe(source);
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("expands replace, replaces literally, preserves Markdown, and undoes each action", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef<EditorHandle>();
  const source = "# Heading\n\nA **needle** and another needle.\n\nbanana\n";
  const jump = (from: number, to: number) => ref.current!.jump(from, to);
  function Harness() {
    const [text, setText] = useState(source);
    return <>
      <ReadFind text={text} disabled={false} onJump={jump}
        onReplace={(expected, matches, replacement) => ref.current!.replaceMatches(expected, matches, replacement)}
        onHighlight={(matches, active) => ref.current?.setFindMatches(matches, active)} />
      <Editor ref={ref} initial={source} bookmarks={[]} onChange={() => setText(ref.current!.text())}
        onBookmarks={() => {}} onCursor={() => {}} onBookmark={() => {}} onSave={() => {}}
        isMarkdown documentMode="edit" showLineNumbers={false} showLineHighlight={false} wordWrap spellcheck={false} />
    </>;
  }
  const type = async (label: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true })); });
    expect(host.querySelector('input[aria-label="Replace with"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Show replace"]')!.click());
    await type("Find in note", "needle");
    const replacement = await type("Replace with", "$& needle");
    await act(async () => { replacement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(ref.current!.text()).toBe(source.replace("needle", () => "$& needle"));
    expect(document.activeElement).toBe(replacement);
    expect(ref.current!.selection().from).toBe(ref.current!.text().lastIndexOf("needle"));
    await act(async () => ref.current!.undo());
    expect(ref.current!.text()).toBe(source);
    await type("Replace with", "");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Replace all")!.click());
    expect(ref.current!.text()).toBe(source.replaceAll("needle", ""));
    expect(host.textContent).toContain("No results");
    await act(async () => ref.current!.undo());
    expect(ref.current!.text()).toBe(source);
    await type("Find in note", "ana");
    await type("Replace with", "X");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Replace all")!.click());
    expect(ref.current!.text()).toBe(source.replace("banana", "bXna"));
    await act(async () => ref.current!.undo());
    expect(ref.current!.text()).toBe(source);
    expect(ref.current!.isDocumentView()).toBe(true);
    expect(ref.current!.replaceMatches("stale", [{ from: 0, to: 1 }], "x")).toBe(false);
    expect(ref.current!.text()).toBe(source);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
