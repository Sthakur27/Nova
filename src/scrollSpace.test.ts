// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { trackScrollSpace } from "./scrollSpace";
it("compensates growing top space when chrome collapses and reverses it on expansion", () => {
  let resize = () => {}, height = 500;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
  const pane = document.createElement("div");
  Object.defineProperty(pane, "clientHeight", { get: () => height });
  pane.scrollTop = 800;
  pane.scrollTo = vi.fn(options => { pane.scrollTop = (options as ScrollToOptions).top!; });
  const cleanup = trackScrollSpace(pane, false);
  try {
    height = 620; resize();
    expect(pane.scrollTop).toBe(920);
    height = 500; resize();
    expect(pane.scrollTop).toBe(800);
    // A user scroll changes the position preserved by the next resize.
    pane.scrollTop = 1050; pane.dispatchEvent(new Event("scroll"));
    height = 620; resize();
    expect(pane.scrollTop).toBe(1170);
    // Width-only changes do not move the note, and hidden surfaces are rebased.
    resize(); expect(pane.scrollTo).toHaveBeenCalledTimes(3);
    height = 0; resize(); height = 400; pane.scrollTop = 240; resize();
    expect(pane.scrollTop).toBe(240);
  } finally { cleanup(); expect(disconnect).toHaveBeenCalled(); vi.unstubAllGlobals(); }
});
it("ignores resize-generated scroll events and leaves mobile scroll space alone", () => {
  let resize = () => {}, height = 500;
  const observer = vi.fn(function (callback: () => void) { resize = callback; return { observe() {}, disconnect() {} }; });
  vi.stubGlobal("ResizeObserver", observer);
  const pane = document.createElement("div");
  Object.defineProperty(pane, "clientHeight", { get: () => height });
  pane.scrollTo = vi.fn(options => { pane.scrollTop = (options as ScrollToOptions).top!; });
  pane.scrollTop = 800;
  const cleanup = trackScrollSpace(pane, false);
  try {
    height = 400; pane.scrollTop = 750; pane.dispatchEvent(new Event("scroll")); resize();
    expect(pane.scrollTop).toBe(700);
    trackScrollSpace(pane, true)();
    expect(observer).toHaveBeenCalledTimes(1);
  } finally { cleanup(); vi.unstubAllGlobals(); }
});
