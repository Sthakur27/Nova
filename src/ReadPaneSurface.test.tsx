// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ReadPaneSurface from "./ReadPaneSurface";
it("waits for lazy content and stops restoring once the user scrolls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const callbacks: (() => void)[] = [];
  const resize = () => callbacks.forEach(callback => callback());
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { callbacks.push(callback); } observe() {} disconnect = disconnect; });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ReadPaneSurface scrollTop={900} onElement={() => {}}><article>Loading</article></ReadPaneSurface>));
    const surface = host.firstElementChild as HTMLDivElement;
    expect(surface.scrollTop).toBe(900);
    expect(disconnect).not.toHaveBeenCalled();
    Object.defineProperties(surface, { scrollHeight: { value: 1800 }, clientHeight: { value: 600 } });
    surface.scrollTop = 0; resize();
    expect(surface.scrollTop).toBe(900); expect(disconnect).toHaveBeenCalled();
    disconnect.mockClear(); surface.dispatchEvent(new Event("wheel"));
    expect(disconnect).toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
