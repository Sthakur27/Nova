// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCompactLayout } from "./useCompactLayout";
vi.mock("./platform", () => ({ mobile: true }));

let root: Root;
let host: HTMLDivElement;
let viewport: EventTarget & { height: number; scale: number };
function Screen() {
  useCompactLayout();
  return <div className="document-area"><input aria-label="Note" /></div>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerHeight", 844);
  vi.stubGlobal("innerWidth", 390);
  viewport = Object.assign(new EventTarget(), { height: 844, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Screen />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("hides navigation for the keyboard and restores it without shrinking the scroll canvas", () => {
  const html = document.documentElement;
  expect(html.style.getPropertyValue("--mobile-scroll-space")).toBe("440px");
  act(() => {
    host.querySelector("input")!.focus();
    viewport.height = 480;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(html.dataset.mobileKeyboard).toBe("true");
  expect(html.style.getPropertyValue("--mobile-height")).toBe("480px");
  expect(html.style.getPropertyValue("--mobile-scroll-space")).toBe("440px");
  act(() => { host.querySelector("input")!.blur(); viewport.height = 844; viewport.dispatchEvent(new Event("resize")); });
  expect(html.dataset.mobileKeyboard).toBe("false");
});
it("does not treat pinch zoom as a keyboard", () => {
  act(() => { viewport.scale = 2; viewport.height = 422; viewport.dispatchEvent(new Event("resize")); });
  expect(document.documentElement.dataset.mobileKeyboard).toBe("false");
  expect(document.documentElement.style.getPropertyValue("--mobile-height")).toBe("844px");
});
it("recognizes the keyboard when the webview's layout viewport also shrinks", () => {
  act(() => {
    vi.stubGlobal("innerHeight", 480);
    viewport.height = 480;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(document.documentElement.dataset.mobileKeyboard).toBe("true");
});

it("hides navigation for the iOS accessory tray even without a viewport resize", () => {
  act(() => { host.querySelector("input")!.focus(); });
  expect(document.documentElement.dataset.mobileKeyboard).toBe("true");
  act(() => { host.querySelector("input")!.blur(); });
  expect(document.documentElement.dataset.mobileKeyboard).toBe("false");
});
