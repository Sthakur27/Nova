// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "./App";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
it.each(["Edit", "Read"])("restores %s after saving a Markdown layout and switching to Source", async savedMode => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  localStorage.clear();
  localStorage.setItem("nova:show-read-mode:v1", "on");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  try {
    await act(async () => root.render(<App />));
    await act(async () => button(savedMode).click());
    await act(async () => button("Saved states").click());
    await act(async () => host.querySelector('form.saved-state-create')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => button("Source").click());
    expect(button("Source").getAttribute("aria-pressed")).toBe("true");
    await act(async () => host.querySelector<HTMLButtonElement>('.saved-state-title .saved-state-restore')!.click());
    expect(button(savedMode).getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector<HTMLElement>('.document-pane')!.hidden).toBe(false);
    expect(host.querySelector('.document-pane')?.getAttribute("data-mode")).toBe(savedMode.toLowerCase());
    await act(async () => button("Return to previous state").click());
    expect(button("Source").getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.render(null));
    await act(async () => root.render(<App />));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", ctrlKey: true, altKey: true, bubbles: true })));
    expect(button(savedMode).getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('.document-pane')?.getAttribute("data-mode")).toBe(savedMode.toLowerCase());
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals();
  }
});
