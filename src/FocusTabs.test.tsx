// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FocusTabs from "./FocusTabs";

it("reveals tabs on mouse hover, supports navigation, and retains keyboard access", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  const render = async (enabled: boolean) => act(async () => root.render(<FocusTabs enabled={enabled}>
    <button role="tab" onClick={select}>Second note</button>
  </FocusTabs>));
  try {
    await render(true);
    const region = host.firstElementChild as HTMLElement;
    const tab = host.querySelector("button")!;
    const pointer = async (type: string, pointerType = "mouse") => act(async () => {
      const event = new MouseEvent(type, { bubbles: true });
      Object.defineProperty(event, "pointerType", { value: pointerType });
      region.dispatchEvent(event);
    });
    expect(region.dataset.open).toBe("false");
    await pointer("pointerover", "touch");
    expect(region.dataset.open).toBe("false");
    await pointer("pointerover");
    expect(region.dataset.open).toBe("true");
    await act(async () => tab.click());
    expect(select).toHaveBeenCalledOnce();
    await pointer("pointerout");
    expect(region.dataset.open).toBe("false");
    await act(async () => region.focus());
    expect(region.dataset.open).toBe("true");
    await act(async () => tab.focus());
    expect(region.dataset.open).toBe("true");
    await act(async () => tab.blur());
    expect(region.dataset.open).toBe("false");
    await render(false);
    expect(region.hasAttribute("tabindex")).toBe(false);
    expect(region.hasAttribute("role")).toBe(false);
    expect(host.querySelector("button")).toBe(tab);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
