// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import HeadingOutline from "./HeadingOutline";
import { headingOutline } from "./markdownOutline";

class OutlineWorker {
  static instances: OutlineWorker[] = [];
  onmessage?: (event: { data: { headings: ReturnType<typeof headingOutline> } }) => void;
  text = "";
  terminate = vi.fn();
  constructor() { OutlineWorker.instances.push(this); }
  postMessage(text: string) { this.text = text; }
  finish() { this.onmessage?.({ data: { headings: headingOutline(this.text) } }); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); OutlineWorker.instances = []; });

it("navigates exact duplicate-heading positions and refreshes unsaved headings without accepting stale worker results", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Worker", OutlineWorker);
  vi.useFakeTimers();
  const host = document.createElement("div"), root = createRoot(host), onJump = vi.fn();
  const render = (text: string, markdown = true, hasDocument = true) => root.render(<HeadingOutline text={text} markdown={markdown} hasDocument={hasDocument} onJump={onJump} />);
  try {
    await act(async () => render("# Same\n\n### Same"));
    await act(async () => vi.advanceTimersByTime(150));
    const first = OutlineWorker.instances[0];
    await act(async () => first.finish());
    const buttons = host.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[1].getAttribute("aria-label")).toContain("heading level 3, line 3");
    await act(async () => buttons[1].click());
    expect(onJump).toHaveBeenCalledWith(8);
    await act(async () => render("# Unsaved"));
    expect(host.querySelector("button")).toBeNull();
    expect(first.terminate).toHaveBeenCalled();
    await act(async () => first.finish());
    expect(host.textContent).not.toContain("Same");
    await act(async () => vi.advanceTimersByTime(150));
    await act(async () => OutlineWorker.instances[1].finish());
    expect(host.querySelector("button")?.textContent).toContain("Unsaved");
    await act(async () => render("# Plain", false));
    expect(host.textContent).toContain("Headings are available in Markdown notes.");
    await act(async () => render("", true, false));
    expect(host.textContent).toContain("Open a note");
  } finally { await act(async () => root.unmount()); }
});
