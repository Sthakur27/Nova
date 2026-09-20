// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTabReorder } from "./useTabReorder";

let container: HTMLDivElement, root: Root;
const reorder = vi.fn(), activate = vi.fn(), close = vi.fn();
const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 40 } as DOMRect);
const pointer = (target: EventTarget, type: string, x: number, y = 20) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: "mouse" } });
  target.dispatchEvent(event);
};
const button = (id: string) => container.querySelector<HTMLElement>(`[data-tab-id="${id}"] [role="tab"]`)!;
const click = (target: HTMLElement) => target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  reorder.mockClear(); activate.mockClear(); close.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  function Harness() {
    const ref = useTabReorder(reorder);
    return <div ref={ref} role="tablist">{["a", "b", "c"].map(id => <div key={id} data-tab-id={id}>
      <button role="tab" onClick={activate}><span>{id}</span></button><button onClick={close}>Close</button>
    </div>)}</div>;
  }
  await act(async () => root.render(<Harness />));
  container.querySelector<HTMLElement>('[role="tablist"]')!.getBoundingClientRect = () => rect(0, 300);
  container.querySelectorAll<HTMLElement>("[data-tab-id]").forEach((tab, i) => { tab.getBoundingClientRect = () => rect(i * 100, 100); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.unstubAllGlobals();
});
it("shows an insertion marker, moves to the end, and suppresses the release click", () => {
  pointer(button("a").firstChild!, "pointerdown", 40);
  pointer(window, "pointermove", 280);
  expect(container.querySelector('[data-tab-id="c"]')?.getAttribute("data-drop-side")).toBe("after");
  pointer(window, "pointerup", 280);
  expect(reorder).toHaveBeenCalledExactlyOnceWith("a", null);
  click(button("a"));
  expect(activate).not.toHaveBeenCalled();
  expect(container.querySelector("[data-dragging], [data-drop-side], [data-reordering]")).toBeNull();
  pointer(button("c"), "pointerdown", 270);
  pointer(window, "pointermove", 20);
  pointer(window, "pointerup", 20);
  expect(reorder).toHaveBeenLastCalledWith("c", "a");
});
it("preserves ordinary clicks and excludes close buttons", () => {
  pointer(button("a"), "pointerdown", 40);
  pointer(window, "pointermove", 43);
  pointer(window, "pointerup", 43);
  click(button("a"));
  expect(activate).toHaveBeenCalledOnce();
  const closeButton = button("a").nextElementSibling as HTMLElement;
  pointer(closeButton, "pointerdown", 80);
  pointer(window, "pointermove", 280);
  pointer(window, "pointerup", 280);
  click(closeButton);
  expect(close).toHaveBeenCalledOnce();
  expect(reorder).not.toHaveBeenCalled();
});
it.each(["escape", "cancel", "outside", "blur"])("cancels on %s without changing the order", reason => {
  pointer(button("a"), "pointerdown", 40);
  pointer(window, "pointermove", 280);
  if (reason === "escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  if (reason === "cancel") pointer(window, "pointercancel", 280);
  if (reason === "blur") window.dispatchEvent(new Event("blur"));
  pointer(window, "pointerup", 280, reason === "outside" ? 100 : 20);
  expect(reorder).not.toHaveBeenCalled();
  expect(container.querySelector("[data-drop-side], [data-reordering]")).toBeNull();
});

it("recognizes vertical drags into pane edges and drops between groups", async () => {
  const drop = vi.fn();
  function Panes() {
    const ref = useTabReorder(reorder, drop);
    return <div ref={ref}>{["left", "right"].map(id => <section key={id} data-editor-pane={id}>
      <div role="tablist"><div data-tab-id={id}><button role="tab">{id}</button></div></div>
    </section>)}</div>;
  }
  await act(async () => root.render(<Panes />));
  const panes = container.querySelectorAll<HTMLElement>("[data-editor-pane]");
  panes.forEach((pane, i) => {
    pane.getBoundingClientRect = () => ({ ...rect(i * 300, 300), top: 0, bottom: 400, height: 400 });
    pane.querySelector<HTMLElement>('[role="tablist"]')!.getBoundingClientRect = () => rect(i * 300, 300);
    pane.querySelector<HTMLElement>('[data-tab-id]')!.getBoundingClientRect = () => rect(i * 300, 100);
  });
  pointer(button("left"), "pointerdown", 50);
  pointer(window, "pointermove", 50, 390);
  expect(panes[0].dataset.paneDrop).toBe("bottom");
  pointer(window, "pointerup", 50, 390);
  expect(drop).toHaveBeenCalledWith("left", { pane: "left", edge: "bottom", before: null });
  expect(container.querySelector("[data-pane-drop]")).toBeNull();
  pointer(button("left"), "pointerdown", 50);
  pointer(window, "pointermove", 440, 200);
  expect(panes[1].dataset.paneDrop).toBe("center");
  pointer(window, "pointerup", 440, 200);
  expect(drop).toHaveBeenLastCalledWith("left", { pane: "right", edge: undefined, before: null });
  pointer(button("left"), "pointerdown", 50);
  pointer(window, "pointermove", 310, 20);
  pointer(window, "pointerup", 310, 20);
  expect(drop).toHaveBeenLastCalledWith("left", { pane: "right", before: "right" });
});
