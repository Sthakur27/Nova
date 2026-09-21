// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PlasmaEffects from "./PlasmaEffects";

let container: HTMLDivElement, root: Root;
let now: number, nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let motion: MediaQueryList;
const clearRect = vi.fn(), stroke = vi.fn();

function advance(milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 40) {
    now += 40;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(frame => frame(now));
    vi.advanceTimersByTime(40);
  }
}
async function render(active = true, supernova = 0) {
  await act(async () => root.render(<div className="app-shell">
    <button className="brand-emblem">Nova</button>
    <PlasmaEffects active={active} dirty={false} lineHighlight={false} supernova={supernova} />
  </div>));
}
beforeEach(() => {
  vi.useFakeTimers();
  now = 1000; nextFrame = 0; frames = new Map();
  clearRect.mockClear(); stroke.mockClear();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame; frames.set(id, callback); return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  motion = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
  vi.stubGlobal("matchMedia", () => motion);
  const gradient = { addColorStop: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect, stroke, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    fillRect: vi.fn(), setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
    rect: vi.fn(), roundRect: vi.fn(), clip: vi.fn(), fill: vi.fn(), drawImage: vi.fn(),
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
    expect(frames.size).toBe(1);
    const paints = clearRect.mock.calls.length;
    advance(200);
    expect(clearRect.mock.calls.length).toBeGreaterThan(paints);
    expect(frames.size).toBe(1);
    advance(1000);
    expect(frames.size).toBe(0);
  },
);

it("cancels animation and clears the glow on loss of focus", async () => {
  await render(); advance(200);
  expect(frames.size).toBe(1);
  await render(false);
  expect(frames.size).toBe(0);
  expect(clearRect).toHaveBeenLastCalledWith(0, 0, innerWidth, innerHeight);
  document.dispatchEvent(new Event("input"));
  expect(frames.size).toBe(0);
});

it("lets the explicit supernova finish after the interaction has settled", async () => {
  await render(true, now);
  advance(1200);
  expect(frames.size).toBe(1);
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
  expect(clearRect).toHaveBeenCalledTimes(paints + 1);
  expect(frames.size).toBe(0);
});
