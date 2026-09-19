import { expect, it, vi } from "vitest";
import { installZoomShortcuts } from "./zoom";

function setup(setZoom = vi.fn(async (_factor: number) => {})) {
  const target = new EventTarget();
  const onError = vi.fn();
  const cleanup = installZoomShortcuts(target as Window, setZoom, onError);
  const press = (key: string, modifiers: Partial<KeyboardEvent> = { metaKey: true }) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, ...modifiers });
    target.dispatchEvent(event);
    return event;
  };
  return { setZoom, onError, cleanup, press };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("handles both plus variants, minus, and reset in order during rapid input", async () => {
  const { press, setZoom, cleanup } = setup();
  for (const key of ["+", "=", "-", "0"]) expect(press(key).defaultPrevented).toBe(true);
  await flush();
  expect(setZoom.mock.calls.map(([factor]) => factor)).toEqual([1.1, 1.2, 1.1, 1]);
  cleanup();
  expect(press("+").defaultPrevented).toBe(false);
});

it("leaves ordinary typing, other shortcuts, and Alt combinations alone", async () => {
  const { press, setZoom } = setup();
  expect(press("=", { metaKey: false }).defaultPrevented).toBe(false);
  expect(press("s").defaultPrevented).toBe(false);
  expect(press("+", { metaKey: true, altKey: true }).defaultPrevented).toBe(false);
  await flush();
  expect(setZoom).not.toHaveBeenCalled();
});

it("supports Ctrl and clamps repeated zoom shortcuts", async () => {
  const { press, setZoom } = setup();
  for (let i = 0; i < 30; i++) press("+", { ctrlKey: true });
  for (let i = 0; i < 30; i++) press("-");
  await flush();
  const factors = setZoom.mock.calls.map(([factor]) => factor);
  expect(Math.max(...factors)).toBe(2);
  expect(factors.at(-1)).toBe(0.5);
  expect(factors).toHaveLength(25);
});

it("reports native failure and keeps the last successful zoom for the next shortcut", async () => {
  const setZoom = vi.fn(async (_factor: number) => {}).mockRejectedValueOnce(new Error("failed"));
  const { press, onError } = setup(setZoom);
  press("+");
  press("+");
  await flush();
  expect(onError).toHaveBeenCalledOnce();
  expect(setZoom.mock.calls).toEqual([[1.1], [1.1]]);
});
