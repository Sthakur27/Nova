import { expect, it, vi } from "vitest";
import { installFileSearchShortcut } from "./fileSearchShortcut";

it.each([true, false])("opens file search once with the platform shortcut (Mac: %s)", mac => {
  const target = new EventTarget();
  const open = vi.fn();
  const cleanup = installFileSearchShortcut(target as Window, mac, open);
  const press = (options: Partial<KeyboardEvent> = {}) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key: "p", metaKey: mac, ctrlKey: !mac, ...options });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  for (const options of [{ shiftKey: true }, { altKey: true }, { isComposing: true }, { metaKey: !mac, ctrlKey: mac }, { key: "s" }]) {
    expect(press(options)).toBe(false);
  }
  expect(open).not.toHaveBeenCalled();
  expect(press()).toBe(true);
  expect(press({ repeat: true })).toBe(true);
  expect(open).toHaveBeenCalledTimes(1);
  cleanup();
  expect(press()).toBe(false);
});
