// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NoteTabs from "./NoteTabs";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let resize: () => void;
const disconnect = vi.fn();
const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 40, height: 40, x: left, y: 0, toJSON() {} });

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function render(selected: string, ids = ["a", "b"], hidden = false) {
  await act(async () => root.render(<NoteTabs selected={selected} hidden={hidden}>
    {ids.map(id => <div key={id} data-tab-id={id}><button role="tab" aria-selected={id === selected}>{id}</button><button>Close</button></div>)}
  </NoteTabs>));
  return host.firstElementChild as HTMLDivElement;
}
function geometry(strip: HTMLElement, positions: Record<string, [number, number]>, width = 200) {
  Object.defineProperty(strip, "clientWidth", { configurable: true, value: width });
  strip.getBoundingClientRect = () => rect(100, width);
  for (const tab of strip.querySelectorAll<HTMLElement>("[data-tab-id]")) {
    tab.getBoundingClientRect = () => { const [left, size] = positions[tab.dataset.tabId!]!; return rect(100 + left - strip.scrollLeft, size); };
  }
}

it("reveals newly opened and created tabs including close controls without moving focus or ancestors", async () => {
  const strip = await render("a");
  geometry(strip, { a: [0, 100], b: [180, 100] });
  const button = strip.querySelector("button")!;
  button.focus();
  host.scrollTop = 120;
  await render("b");
  expect(strip.scrollLeft).toBe(80);
  expect(document.activeElement).toBe(button);
  expect(host.scrollTop).toBe(120);
  await render("new", ["a", "b", "new"]);
  geometry(strip, { a: [0, 100], b: [180, 100], new: [280, 110] });
  act(() => resize());
  expect(strip.scrollLeft).toBe(190);
  await render("a", ["a", "b", "new"]);
  expect(strip.scrollLeft).toBe(0);
});

it("leaves visible tabs and manual scrolling alone during unrelated renders", async () => {
  const strip = await render("a");
  geometry(strip, { a: [0, 100], b: [100, 100] });
  await render("b");
  expect(strip.scrollLeft).toBe(0);
  strip.scrollLeft = 150;
  await render("b");
  expect(strip.scrollLeft).toBe(150);
});

it("reveals the selected tab after a pane narrows or hidden tabs return", async () => {
  const strip = await render("b", undefined, true);
  geometry(strip, { a: [0, 100], b: [180, 100] });
  await render("b");
  expect(strip.scrollLeft).toBe(80);
  geometry(strip, { a: [0, 100], b: [180, 100] }, 120);
  act(() => resize());
  expect(strip.scrollLeft).toBe(160);
  await render("b", undefined, true);
  expect(disconnect).toHaveBeenCalled();
});

it("aligns an oversized tab once without oscillating on resize notifications", async () => {
  const strip = await render("a");
  geometry(strip, { a: [0, 100], b: [180, 300] });
  await render("b");
  expect(strip.scrollLeft).toBe(180);
  act(() => resize());
  expect(strip.scrollLeft).toBe(180);
});
