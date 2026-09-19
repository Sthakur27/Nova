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
    pointer(container.querySelector(".top-bars")!, "pointerdown", 500, 100);
    pointer(window, "pointermove", 500, 160);
    expect(onMove).toHaveBeenLastCalledWith("top", 304);
    pointer(window, "pointercancel", 500, 160);
    expect(onFinish).toHaveBeenLastCalledWith("top", false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
