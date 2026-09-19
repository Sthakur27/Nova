import { expect, it, vi } from "vitest";
import { installPanelShortcuts } from "./panelShortcuts";

function setup(mac: boolean) {
  const target = new EventTarget();
  const toggle = vi.fn();
  const cleanup = installPanelShortcuts(target as Window, mac, toggle);
  const press = (key: string, options: Partial<KeyboardEvent> = {}) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, metaKey: mac, ctrlKey: !mac, ...options });
    target.dispatchEvent(event);
    return event;
  };
  return { toggle, press, cleanup };
}

it.each([true, false])("maps the platform modifier and all four arrow keys (Mac: %s)", mac => {
  const { toggle, press, cleanup } = setup(mac);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) expect(press(key).defaultPrevented).toBe(true);
  expect(toggle.mock.calls.flat()).toEqual(["left", "right", "top", "bottom"]);
  cleanup();
  expect(press("ArrowLeft").defaultPrevented).toBe(false);
});

it.each([true, false])("preserves selection, other modifiers, and composition (Mac: %s)", mac => {
  const { toggle, press, cleanup } = setup(mac);
  for (const modifiers of [
    { shiftKey: true }, { altKey: true }, { isComposing: true },
    { metaKey: false, ctrlKey: false }, { metaKey: !mac, ctrlKey: mac }, { metaKey: true, ctrlKey: true },
  ]) expect(press("ArrowLeft", modifiers).defaultPrevented).toBe(false);
  expect(press("s").defaultPrevented).toBe(false);
  expect(toggle).not.toHaveBeenCalled();
  cleanup();
});

it("consumes held keys without repeatedly toggling a panel", () => {
  const { toggle, press, cleanup } = setup(true);
  press("ArrowDown");
  expect(press("ArrowDown", { repeat: true }).defaultPrevented).toBe(true);
  expect(toggle).toHaveBeenCalledExactlyOnceWith("bottom");
  cleanup();
});
