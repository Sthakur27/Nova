import { expect, it, vi } from "vitest";
import { installWorkspaceSearchShortcut } from "./workspaceSearchShortcut";

it.each([true, false])("opens workspace search once with the platform shortcut (Mac: %s)", mac => {
  const target = new EventTarget();
  const open = vi.fn();
  const cleanup = installWorkspaceSearchShortcut(target as Window, mac, open);
  const press = (options: Partial<KeyboardEvent> = {}) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key: "f", shiftKey: true, metaKey: mac, ctrlKey: !mac, ...options });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  for (const options of [{ shiftKey: false }, { altKey: true }, { isComposing: true }, { metaKey: !mac, ctrlKey: mac }, { key: "s" }]) {
    expect(press(options)).toBe(false);
  }
  expect(open).not.toHaveBeenCalled();
  expect(press()).toBe(true);
  expect(press({ repeat: true })).toBe(true);
  expect(open).toHaveBeenCalledTimes(1);
  cleanup();
  expect(press()).toBe(false);
});
