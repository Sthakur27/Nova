// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PlasmaEffects from "./PlasmaEffects";
import type { GalaxyPerformance } from "./galaxyPerformance";

let container: HTMLDivElement, root: Root;
let now: number, nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let motion: MediaQueryList;
let onResize: ResizeObserverCallback;
const clearRect = vi.fn(), stroke = vi.fn(), drawImage = vi.fn();

function advance(milliseconds: number, step = 40) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += step) {
    now += step;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(frame => frame(now));
    vi.advanceTimersByTime(step);
  }
}
async function render(active = true, supernova = 0, performanceMode: GalaxyPerformance | null = "saver") {
  await act(async () => root.render(<div className="app-shell">
    <button className="brand-emblem">Nova</button>
    <PlasmaEffects performanceMode={performanceMode ?? undefined} active={active} dirty={false} lineHighlight={false} supernova={supernova} />
  </div>));
}
beforeEach(() => {
  vi.useFakeTimers();
  now = 1000; nextFrame = 0; frames = new Map();
  clearRect.mockClear(); stroke.mockReset(); drawImage.mockClear();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame; frames.set(id, callback); return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  motion = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
  vi.stubGlobal("matchMedia", () => motion);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { onResize = callback; }
    observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
  });
  const gradient = { addColorStop: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect, stroke, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    fillRect: vi.fn(), setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
    rect: vi.fn(), roundRect: vi.fn(), clip: vi.fn(), fill: vi.fn(), drawImage,
    moveTo: vi.fn(), lineTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const rect = { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 } as DOMRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it("keeps the focused glow drawn without scheduling frames indefinitely", async () => {
  await render();
  advance(1000);
  expect(stroke).toHaveBeenCalled();
  expect(frames.size).toBe(0);
  const paints = clearRect.mock.calls.length;
  advance(5000);
  expect(clearRect).toHaveBeenCalledTimes(paints);
});

it.each(["pointerover", "pointerdown", "input", "keyup", "scroll", "selectionchange"])(
  "restarts briefly on %s after settling, without duplicate loops", async event => {
    await render(); advance(1000);
    document.dispatchEvent(new Event(event, { bubbles: true }));
    document.dispatchEvent(new Event(event, { bubbles: true }));
    expect(frames.size + vi.getTimerCount()).toBe(1);
    const paints = clearRect.mock.calls.length;
    advance(200);
    expect(clearRect.mock.calls.length).toBeGreaterThan(paints);
    expect(frames.size + vi.getTimerCount()).toBe(1);
    advance(1000);
    expect(frames.size).toBe(0);
  },
);

it("cancels animation and clears the glow on loss of focus", async () => {
  await render(); advance(200);
  expect(frames.size + vi.getTimerCount()).toBe(1);
  await render(false);
  expect(frames.size + vi.getTimerCount()).toBe(0);
  expect(clearRect).toHaveBeenLastCalledWith(0, 0, innerWidth, innerHeight);
  document.dispatchEvent(new Event("input"));
  expect(frames.size).toBe(0);
});

it("lets the explicit supernova finish after the interaction has settled", async () => {
  await render(true, now);
  advance(1200);
  expect(frames.size + vi.getTimerCount()).toBeGreaterThan(0);
  advance(2000);
  expect(frames.size).toBe(0);
});

it("draws once for reduced motion and clears the burst when it expires", async () => {
  Object.defineProperty(motion, "matches", { value: true });
  await render(true, now);
  advance(40);
  expect(frames.size).toBe(0);
  const paints = clearRect.mock.calls.length;
  advance(2800);
  expect(clearRect).toHaveBeenCalledTimes(paints);
  advance(400);
  expect(clearRect.mock.calls.length).toBeGreaterThan(paints);
  expect(frames.size).toBe(0);
});

it("reuses geometry between animation frames and clears only glow bounds", async () => {
  await render(); advance(80);
  const boxes = vi.mocked(Element.prototype.getBoundingClientRect);
  boxes.mockClear(); clearRect.mockClear();
  advance(200);
  expect(boxes).not.toHaveBeenCalled();
  expect(clearRect).toHaveBeenCalled();
  for (const [, , width, height] of clearRect.mock.calls) {
    expect(width).toBeLessThan(innerWidth);
    expect(height).toBeLessThan(innerHeight);
  }
});

it.each(["scroll", "resize"])("remeasures geometry after %s", async event => {
  await render(); advance(1000);
  const boxes = vi.mocked(Element.prototype.getBoundingClientRect);
  boxes.mockClear();
  if (event === "resize") onResize([], {} as ResizeObserver);
  else document.dispatchEvent(new Event("scroll"));
  advance(80);
  expect(boxes).toHaveBeenCalled();
});

it("clears both the old and new position when a control moves", async () => {
  await render(); advance(1000);
  const emblem = container.querySelector("button")!;
  emblem.getBoundingClientRect = () => ({ left: 300, top: 200, right: 400, bottom: 250, width: 100, height: 50 } as DOMRect);
  clearRect.mockClear();
  document.dispatchEvent(new Event("scroll")); advance(40);
  expect(clearRect).toHaveBeenCalledWith(0, 0, 101, 51);
  expect(clearRect).toHaveBeenCalledWith(299, 199, 102, 52);
});

it("clears a removed control while idle without restarting animation", async () => {
  await render(); advance(1000);
  clearRect.mockClear(); stroke.mockClear();
  await act(async () => { container.querySelector("button")!.remove(); });
  advance(40);
  expect(clearRect).toHaveBeenCalledWith(0, 0, 101, 51);
  expect(stroke).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});

it.each(["transitionend", "transitioncancel", "removed"])("tracks moving geometry until a transition is %s", async ending => {
  await render(); advance(1000);
  const emblem = container.querySelector("button")!;
  const transition = (type: string) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "propertyName", { value: "transform" });
    emblem.dispatchEvent(event);
  };
  transition("transitionrun");
  advance(80);
  expect(frames.size + vi.getTimerCount()).toBe(1);
  const boxes = vi.mocked(Element.prototype.getBoundingClientRect);
  boxes.mockClear(); advance(40);
  expect(boxes).toHaveBeenCalled();
  if (ending === "removed") await act(async () => { emblem.remove(); });
  else transition(ending);
  advance(80);
  expect(frames.size).toBe(0);
});

it("caps sustained interaction at 24 decorative frames per second on a fast display", async () => {
  await render(); advance(1000);
  const paintedAt = new Set<number>();
  stroke.mockImplementation(() => paintedAt.add(now));
  for (let i = 0; i < 12; i++) {
    document.dispatchEvent(new Event("pointerdown"));
    advance(80, 8); // Simulate a 125 Hz display during repeated interaction.
  }
  expect(paintedAt.size).toBeGreaterThan(10);
  expect(paintedAt.size).toBeLessThanOrEqual(24);
  advance(1200, 8);
  expect(frames.size + vi.getTimerCount()).toBe(0);
});

it.each([false, true])("bounds particle work for large effects (supernova: %s)", async burst => {
  vi.mocked(Element.prototype.getBoundingClientRect).mockReturnValue({
    left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700,
  } as DOMRect);
  await render(!burst, burst ? now : 0);
  advance(40);
  expect(drawImage).toHaveBeenCalledTimes(burst ? 240 : 32);
});

function hoverControl() {
  const button = container.querySelector("button")!;
  const matches = button.matches.bind(button);
  vi.spyOn(button, "matches").mockImplementation(selector => selector === ":hover" || matches(selector));
  button.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  return button;
}

it("defaults to high performance and keeps a stationary hover animated until it leaves", async () => {
  await render(true, 0, null);
  const button = hoverControl();
  advance(2000);
  expect(frames.size + vi.getTimerCount()).toBeGreaterThan(0);
  button.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
  advance(1000);
  expect(frames.size + vi.getTimerCount()).toBe(0);
});

it("settles a stationary hover in Saver and applies mode changes immediately", async () => {
  await render(true, 0, "high"); hoverControl(); advance(1000);
  expect(frames.size + vi.getTimerCount()).toBeGreaterThan(0);
  await render(true, 0, "saver"); hoverControl(); advance(1000);
  expect(frames.size + vi.getTimerCount()).toBe(0);
  await render(true, 0, "high"); hoverControl(); advance(1000);
  expect(frames.size + vi.getTimerCount()).toBeGreaterThan(0);
  await render(false, 0, "high");
  expect(frames.size + vi.getTimerCount()).toBe(0);
});

it("respects reduced motion even for a persistent hover in high performance", async () => {
  Object.defineProperty(motion, "matches", { value: true });
  await render(true, 0, "high"); hoverControl(); advance(1000);
  expect(stroke).toHaveBeenCalled();
  expect(frames.size + vi.getTimerCount()).toBe(0);
});

it("allows smoother high-performance effects without exceeding 60 FPS", async () => {
  await render(true, 0, "high"); hoverControl(); advance(1000);
  const paintedAt = new Set<number>();
  stroke.mockImplementation(() => paintedAt.add(now));
  advance(1000, 8);
  expect(paintedAt.size).toBeGreaterThan(24);
  expect(paintedAt.size).toBeLessThanOrEqual(60);
});

it("keeps keyboard-focused controls animated in high performance", async () => {
  await render(true, 0, "high");
  const button = container.querySelector("button")!;
  const matches = button.matches.bind(button);
  vi.spyOn(button, "matches").mockImplementation(selector => selector === ":focus-visible" || matches(selector));
  button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  advance(2000);
  expect(frames.size + vi.getTimerCount()).toBeGreaterThan(0);
  button.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  advance(1000);
  expect(frames.size + vi.getTimerCount()).toBe(0);
});

it("stops high-performance hover animation when its target is removed", async () => {
  await render(true, 0, "high");
  const button = hoverControl(); advance(1000);
  expect(frames.size + vi.getTimerCount()).toBeGreaterThan(0);
  await act(async () => { button.remove(); });
  advance(1000);
  expect(frames.size + vi.getTimerCount()).toBe(0);
});
