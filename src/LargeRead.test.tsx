// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import LargeRead, { type LargeReadHandle } from "./LargeRead";
import { buildReadPages } from "./readPages";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

it("virtualizes continuous reading, jumps to unmounted text, and preserves the section in page mode", async () => {
  const observations = new Map<Element, (entries: { isIntersecting: boolean }[]) => void>();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe(node: Element) { observations.set(node, this.callback); }
    disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("Worker", class {
    onmessage?: (event: { data: unknown }) => void;
    postMessage({ text, markdown }: { text: string; markdown: boolean }) {
      this.onmessage?.({ data: { pages: buildReadPages(text, markdown) } });
    }
    terminate() {}
  });
  const scroll = vi.fn();
  const oldScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scroll;
  const host = document.createElement("div");
  host.className = "read-pane";
  host.scrollTo = vi.fn();
  const controls = document.createElement("div");
  document.body.append(host, controls);
  const root = createRoot(host);
  const ref = createRef<LargeReadHandle>();
  const text = "first\n" + "padding\n".repeat(900) + "last needle";
  const render = async (layout: "continuous" | "pages") => {
    await act(async () => root.render(<LargeRead ref={ref} text={text} markdown={false} layout={layout} controlsContainer={controls} />));
  };
  try {
    await render("continuous");
    expect(controls.textContent).toBe("");
    expect(host.textContent).toContain("first");
    expect(host.textContent).not.toContain("last needle");
    const first = host.querySelector('[data-read-chunk="0"]')!;
    await act(async () => observations.get(first)!([{ isIntersecting: false }]));
    expect(host.textContent).not.toContain("first");
    await act(async () => ref.current!.jump(902));
    expect(host.textContent).toContain("last needle");
    expect(scroll).toHaveBeenCalled();
    await render("pages");
    expect(host.textContent).toContain("last needle");
    expect(controls.querySelector("input")!.value).toBe("4");
    await act(async () => controls.querySelector<HTMLButtonElement>('[aria-label="Previous page"]')!.click());
    expect(controls.querySelector("input")!.value).toBe("3");
    await render("continuous");
    expect(controls.textContent).toBe("");
    expect(host.querySelector('[data-read-chunk="2"]')!.textContent).toContain("padding");
  } finally {
    await act(async () => root.unmount());
    host.remove(); controls.remove();
    HTMLElement.prototype.scrollIntoView = oldScroll;
  }
});
