// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { usePanelDrag } from "./usePanelDrag";

it("drags panel backgrounds, protects controls, snaps at edges, and cancels with Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onStart = vi.fn(() => 244), onMove = vi.fn(), onFinish = vi.fn();
  function Harness() {
    usePanelDrag({ shell: () => container, onStart, onMove, onFinish });
    return <><aside className="sidebar"><span>Background</span><button><span>Action</span></button><input /></aside><div className="top-bars">Top</div><div data-panel-drag="right" /></>;
  }
  const pointer = (target: EventTarget, type: string, x: number, y = 100) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    target.dispatchEvent(event);
  };
  try {
    await act(async () => root.render(<Harness />));
    container.getBoundingClientRect = () => ({ left: 0, right: 1200, top: 0 } as DOMRect);
    pointer(container.querySelector("button span")!, "pointerdown", 100);
    pointer(container.querySelector("input")!, "pointerdown", 100);
    expect(onStart).not.toHaveBeenCalled();
    pointer(container.querySelector("aside > span")!, "pointerdown", 100);
    pointer(window, "pointermove", 103);
    expect(onMove).not.toHaveBeenCalled();
    pointer(window, "pointermove", 150);
    expect(onMove).toHaveBeenLastCalledWith("left", 294);
    pointer(window, "pointermove", 40);
    expect(onMove).toHaveBeenLastCalledWith("left", 0);
    pointer(window, "pointerup", 40);
    expect(onFinish).toHaveBeenLastCalledWith("left", true);
    pointer(container.querySelector("[data-panel-drag]")!, "pointerdown", 1000);
    pointer(window, "pointermove", 900);
    expect(onMove).toHaveBeenLastCalledWith("right", 344);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onFinish).toHaveBeenLastCalledWith("right", false);
    onStart.mockClear(); onMove.mockClear(); onFinish.mockClear();
    pointer(container.querySelector(".top-bars")!, "pointerdown", 500, 100);
    pointer(window, "pointermove", 500, 160);
    expect(onStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    pointer(window, "pointercancel", 500, 160);
    expect(onFinish).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});


it("resizes bottom panels upward, snaps downward, and leaves terminal controls alone", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onStart = vi.fn(() => 260), onMove = vi.fn(), onFinish = vi.fn();
  function Harness() {
    usePanelDrag({ shell: () => container, bottomOnly: true, onStart, onMove, onFinish });
    return <><div data-panel-drag="bottom">Handle</div><div className="terminal-panel"><span>Background</span><div data-panel-no-drag>Terminal text</div></div><footer className="status-bar">Status</footer><button>Collapse</button><textarea data-panel-no-drag /><div data-panel-drag="left" /></>;
  }
  const pointer = (target: EventTarget, type: string, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 300, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    target.dispatchEvent(event);
  };
  try {
    await act(async () => root.render(<Harness />));
    container.getBoundingClientRect = () => ({ left: 0, right: 1200, top: 0, bottom: 800 } as DOMRect);
    for (const selector of ["button", "textarea", "[data-panel-no-drag]", '[data-panel-drag="left"]']) pointer(container.querySelector(selector)!, "pointerdown", 540);
    expect(onStart).not.toHaveBeenCalled();
    const handle = container.querySelector('[data-panel-drag="bottom"]')!;
    pointer(handle, "pointerdown", 540);
    pointer(window, "pointermove", 440);
    expect(onMove).toHaveBeenLastCalledWith("bottom", 360);
    pointer(window, "pointermove", 760);
    expect(onMove).toHaveBeenLastCalledWith("bottom", 0);
    pointer(window, "pointerup", 760);
    expect(onFinish).toHaveBeenLastCalledWith("bottom", true);
    pointer(handle, "pointerdown", 540);
    pointer(window, "pointermove", 440);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onFinish).toHaveBeenLastCalledWith("bottom", false);
    for (const selector of [".terminal-panel > span", ".status-bar"]) {
      pointer(container.querySelector(selector)!, "pointerdown", 540);
      pointer(window, "pointermove", 440);
      expect(onMove).toHaveBeenLastCalledWith("bottom", 360);
      pointer(window, "pointerup", 440);
      expect(onFinish).toHaveBeenLastCalledWith("bottom", true);
    }
  } finally {
    await act(async () => root.unmount());
    container.remove(); vi.unstubAllGlobals();
  }
});
