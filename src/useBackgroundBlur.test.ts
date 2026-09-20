// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useBackgroundBlur } from "./useBackgroundBlur";

vi.mock("./platform", () => ({ desktop: true, supportsFrosted: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

it("keeps pane and center blur independent, tracks resizing, and respects reduced transparency", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 800);
  let pending = () => {};
  let resize = () => {};
  const preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => preference);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { pending = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onError = vi.fn();
  function Harness({ center, panes, galaxy = true }: { center: boolean; panes: boolean; galaxy?: boolean }) {
    useBackgroundBlur(galaxy, center, panes, {
      compact: false, mobileView: "editor", navigation: true, rail: true, focusMode: false, topBars: true, statusBar: true, terminalStarted: true,
    }, onError);
    return createElement("div", {}, ...["sidebar", "document-area", "bookmark-rail", "top-bars", "terminal-panel", "status-bar", "editor-group"].map(className =>
      createElement("div", { className, key: className }, className === "editor-group" ? createElement("div", { className: "note-tabs" }) : null)));
  }
  const render = async (center: boolean, panes: boolean, galaxy = true) => {
    await act(async () => root.render(createElement(Harness, { center, panes, galaxy })));
    pending();
  };
  const regions = () => (vi.mocked(invoke).mock.lastCall?.[1] as { regions: unknown })?.regions;
  try {
    await render(false, true);
    const elements = [...container.querySelectorAll<HTMLElement>(".sidebar, .document-area, .bookmark-rail, .top-bars, .terminal-panel, .status-bar, .note-tabs")];
    const boxes = [
      { x: 0, y: 0, width: 200, height: 800 },
      { x: 200, y: 100, width: 600, height: 400 },
      { x: 800, y: 0, width: 200, height: 800 },
      { x: 200, y: 0, width: 600, height: 100 },
      { x: 200, y: 500, width: 600, height: 260 },
      { x: 200, y: 760, width: 600, height: 40 },
      { x: 200, y: 100, width: 300, height: 40 },
    ];
    elements.forEach((element, index) => { element.getBoundingClientRect = () => boxes[index] as DOMRect; });
    resize(); pending();
    const left = { x: 0, y: 0, width: 0.2, height: 1 };
    const middle = { x: 0.2, y: 0.125, width: 0.6, height: 0.5 };
    const top = { x: 0.2, y: 0, width: 0.6, height: 0.125 };
    const terminal = { x: 0.2, y: 0.625, width: 0.6, height: 0.325 };
    const status = { x: 0.2, y: 0.95, width: 0.6, height: 0.05 };
    const tabs = { x: 0.2, y: 0.125, width: 0.3, height: 0.05 };
    const right = { x: 0.8, y: 0, width: 0.2, height: 1 };
    expect(regions()).toEqual([left, right, top, terminal, status, tabs]);
    await render(true, false);
    expect(regions()).toEqual([middle]);
    await render(true, true);
    expect(regions()).toEqual([left, middle, right, top, terminal, status, tabs]);
    boxes[0].width = 0;
    resize(); pending();
    expect(regions()).toEqual([middle, right, top, terminal, status, tabs]);
    boxes[6].height = 0; // Hidden tab strips must not leave a native blur rectangle.
    resize(); pending();
    expect(regions()).toEqual([middle, right, top, terminal, status]);
    preference.matches = true;
    preference.addEventListener.mock.lastCall?.[1](); pending();
    expect(regions()).toEqual([]);
    preference.matches = false;
    await render(true, true, false);
    expect(regions()).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalled();
    container.remove();
    vi.unstubAllGlobals();
  }
});
