// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { DocumentEditor } from "./DocumentEditor";

const mocks = vi.hoisted(() => ({ desktop: false, invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./platform", () => ({ get desktop() { return mocks.desktop; } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
let editor: DocumentEditor;
function create(source = "[**Example**](https://example.com) and [email](mailto:hello@example.com)") {
  const mount = document.createElement("div");
  document.body.append(mount);
  const change = vi.fn();
  editor = new DocumentEditor(mount, source, { change, selection: vi.fn(), undo: vi.fn(), redo: vi.fn(), save: vi.fn(), bookmark: vi.fn() });
  return { root: editor.editor.view.dom, change };
}
function menu(target: Element) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
  target.dispatchEvent(event);
  return event;
}
afterEach(() => {
  editor?.destroy();
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
  mocks.desktop = false;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it.each([true, false])("opens nested link text with an ordinary click (editable: %s) without changing Markdown", editable => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const { root, change } = create();
  const source = editor.source;
  editor.setEditable(editable, false);
  root.querySelector("strong")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com", "_blank", "noopener,noreferrer");
  expect(editor.source).toBe(source);
  expect(change).not.toHaveBeenCalled();
});
it("opens the clicked link through the desktop command", () => {
  mocks.desktop = true;
  const { root } = create();
  root.querySelectorAll<HTMLAnchorElement>("a")[1].click();
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("open_external_link", { url: "mailto:hello@example.com" });
});
it("offers Open link on right-click and preserves source and selection", () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const { root, change } = create();
  editor.editor.commands.setTextSelection(3);
  const selection = editor.sourceSelection();
  expect(menu(root.querySelector("strong")!).defaultPrevented).toBe(true);
  expect(open).not.toHaveBeenCalled();
  const button = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
  expect(button.textContent).toBe("Open link");
  expect(document.activeElement).toBe(button);
  button.click();
  expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com", "_blank", "noopener,noreferrer");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(editor.sourceSelection()).toEqual(selection);
  expect(change).not.toHaveBeenCalled();
});
it("dismisses link menus on Escape, outside click, scroll, and editor teardown", () => {
  const { root } = create();
  for (const [index, dismiss] of [
    () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    () => root.dispatchEvent(new Event("scroll")),
    () => editor.destroy(),
  ].entries()) {
    menu(root.querySelector("a")!);
    expect(document.querySelector('[role="menu"]'), `iteration ${index}`).not.toBeNull();
    dismiss();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  }
});
it("retains text selection gestures and leaves ordinary context menus alone", () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const { root } = create();
  const link = root.querySelector<HTMLAnchorElement>("a")!;
  link.dispatchEvent(new MouseEvent("click", { shiftKey: true, bubbles: true, cancelable: true }));
  const range = document.createRange();
  range.selectNodeContents(link);
  window.getSelection()!.addRange(range);
  link.click();
  expect(open).not.toHaveBeenCalled();
  link.dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true, cancelable: true }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(menu(root.querySelector("p")!).defaultPrevented).toBe(false);
});
it.each(["javascript:alert(1)", "file:///etc/passwd", "../other.md"])("does not offer navigation for %s", href => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const { root } = create();
  const link = root.querySelector<HTMLAnchorElement>("a")!;
  link.setAttribute("href", href);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(menu(link).defaultPrevented).toBe(false);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

it("reports desktop launch failures without changing the document", async () => {
  mocks.desktop = true;
  mocks.invoke.mockRejectedValueOnce("No default application");
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  const { root, change } = create();
  root.querySelector<HTMLAnchorElement>("a")!.click();
  await Promise.resolve();
  expect(alert).toHaveBeenCalledWith("No default application");
  expect(change).not.toHaveBeenCalled();
});
