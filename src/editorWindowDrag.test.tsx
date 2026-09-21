// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { startEditorWindowDrag } from "./editorWindowDrag";

const native = vi.hoisted(() => ({ desktop: true, drag: vi.fn(() => Promise.resolve()) }));
vi.mock("./platform", () => ({ get desktop() { return native.desktop; } }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ startDragging: native.drag }) }));

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<div onPointerDownCapture={startEditorWindowDrag}>
    <div className="background" style={{ cursor: "text" }} />
    <div className="cm-content" contentEditable suppressContentEditableWarning><div className="cm-line">Text</div></div>
    <div className="document-content" contentEditable={false}><p>Read mode text</p></div>
    <button><span>Rename</span></button><input /><a href="#">Link</a>
    <div className="cm-gutters">1</div><div className="cm-panel">Search</div>
    <div role="separator" /><div className="scroll" />
    <div className="top-bars"><div className="breadcrumbs"><span>Note.md</span></div>
      <div className="format-toolbar"><button><span>Bold</span></button></div>
      <div className="view-options-panel"><span>Options</span></div>
      <div role="menu"><span>Menu padding</span></div>
    </div>
    <div className="note-tabs" role="tablist"><div role="tab"><span>Note</span></div></div>
  </div>));
}
function press(selector: string, init: MouseEventInit = {}, pointerType = "mouse") {
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperties(event, { pointerType: { value: pointerType }, isPrimary: { value: true } });
  container.querySelector(selector)!.dispatchEvent(event);
  return event;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  native.drag.mockClear();
  native.desktop = true;
  vi.unstubAllGlobals();
});

it("moves the window from background and source padding without changing the cursor", async () => {
  await mount();
  expect(press(".background").defaultPrevented).toBe(true);
  expect(press(".cm-content").defaultPrevented).toBe(true);
  expect(native.drag).toHaveBeenCalledTimes(2);
  expect((container.querySelector(".background") as HTMLElement).style.cursor).toBe("text");
});

it("preserves selection, controls, modified clicks, touch, and non-desktop behavior", async () => {
  await mount();
  for (const selector of [".cm-line", ".document-content p", "button span", "input", "a", ".cm-gutters", ".cm-panel", '[role="separator"]']) {
    expect(press(selector).defaultPrevented).toBe(false);
  }
  for (const init of [{ button: 2 }, { detail: 2 }, { shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
    expect(press(".background", init).defaultPrevented).toBe(false);
  }
  expect(press(".background", {}, "touch").defaultPrevented).toBe(false);
  expect(press(".background", {}, "pen").defaultPrevented).toBe(false);
  native.desktop = false;
  expect(press(".background").defaultPrevented).toBe(false);
  expect(native.drag).not.toHaveBeenCalled();
});

it("drags toolbar and tab-strip backgrounds while preserving controls, menus, and tab gestures", async () => {
  await mount();
  for (const selector of [".top-bars", ".breadcrumbs span", ".format-toolbar", ".note-tabs"]) {
    expect(press(selector).defaultPrevented).toBe(true);
  }
  expect(native.drag).toHaveBeenCalledTimes(4);
  for (const selector of [".format-toolbar button span", ".view-options-panel span", '[role="menu"] span', '[role="tab"] span']) {
    expect(press(selector).defaultPrevented).toBe(false);
  }
  expect(native.drag).toHaveBeenCalledTimes(4);
});

it("leaves native scrollbars available for scrolling", async () => {
  await mount();
  const scroller = container.querySelector(".scroll")!;
  Object.defineProperties(scroller, {
    clientWidth: { value: 180 }, clientHeight: { value: 100 },
    scrollHeight: { value: 400 }, scrollWidth: { value: 180 },
  });
  scroller.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
  expect(press(".scroll", { clientX: 190, clientY: 50 }).defaultPrevented).toBe(false);
  expect(native.drag).not.toHaveBeenCalled();
  expect(press(".scroll", { clientX: 100, clientY: 50 }).defaultPrevented).toBe(true);
  expect(native.drag).toHaveBeenCalledOnce();
});
