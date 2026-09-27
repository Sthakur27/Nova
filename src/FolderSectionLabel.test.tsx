// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FolderSectionLabel from "./FolderSectionLabel";

it("uses Local only when the full name does not fit and restores the name after resizing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect = disconnect;
  });
  let available = 200;
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return {width: this.classList.contains("folder-section-measure") ? 140 : available} as DOMRect;
  });
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<FolderSectionLabel name="Research notes"/>));
    const label = () => host.querySelector(".folder-section-label > span:last-child")!.textContent;
    expect(label()).toBe("Research notes");
    available = 70;
    await act(async () => resize());
    expect(label()).toBe("Local");
    available = 160;
    await act(async () => resize());
    expect(label()).toBe("Research notes");
  } finally {
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    bounds.mockRestore(); vi.unstubAllGlobals();
  }
});
