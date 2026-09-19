// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import TextWidthControl from "./TextWidthControl";
import LineSpacingControl from "./LineSpacingControl";

it.each(["width", "spacing"])("%s opens on the selection, supports keyboard choices, and restores trigger focus", async (kind) => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(async () => root.render(kind === "width" ? <TextWidthControl toolbar value="default" onChange={change} /> : <LineSpacingControl toolbar value="default" onChange={change} />));
    const trigger = host.querySelector("button")!;
    await act(async () => trigger.click());
    expect(document.activeElement?.textContent).toBe("Default");
    expect(document.activeElement?.getAttribute("aria-checked")).toBe("true");
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement?.textContent).toBe(kind === "width" ? "Wide" : "Relaxed");
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(change).toHaveBeenCalledWith(kind === "width" ? "wide" : "relaxed");
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(host.querySelector('[role="menu"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it.each(["width", "spacing"])("%s closes on a second trigger click even when the browser does not focus clicked buttons", async (kind) => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(async () => root.render(kind === "width" ? <TextWidthControl toolbar value="default" onChange={change} /> : <LineSpacingControl toolbar value="default" onChange={change} />));
    const trigger = host.querySelector("button")!;
    await act(async () => trigger.click());
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => {
      const allowDefault = trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      // Simulate WebKit's default: clicking a button blurs the focused menu item.
      if (allowDefault) (document.activeElement as HTMLElement).blur();
    });
    await act(async () => trigger.click());
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(change).not.toHaveBeenCalled();
    await act(async () => trigger.click());
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
