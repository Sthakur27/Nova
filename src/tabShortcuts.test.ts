import { expect, it, vi } from "vitest";
import { installTabCloseShortcut } from "./tabShortcuts";

it.each([true, false])("closes once with the platform shortcut (Mac: %s)", mac => {
  const target = new EventTarget();
  const close = vi.fn();
  const cleanup = installTabCloseShortcut(target as Window, mac, close);
  const press = (options: Partial<KeyboardEvent> = {}) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key: "w", metaKey: mac, ctrlKey: !mac, ...options });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  for (const options of [{ shiftKey: true }, { altKey: true }, { isComposing: true }, { metaKey: !mac, ctrlKey: mac }, { key: "s" }]) {
    expect(press(options)).toBe(false);
  }
  expect(close).not.toHaveBeenCalled();
  expect(press()).toBe(true);
  expect(press({ repeat: true })).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  cleanup();
  expect(press()).toBe(false);
});
