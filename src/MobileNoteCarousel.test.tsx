// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MobileNoteCarousel, { adjacentNote } from "./MobileNoteCarousel";
let container: HTMLDivElement, root: Root;
let clock = 0;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 600 } as DOMRect);
  vi.useFakeTimers();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); clock = 0;
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const ids = ["First", "Middle", "Last"];
async function touch(type: string, x: number, y = 250, target: Element = container.querySelector(".note-carousel-current p")!, fingers = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  clock += 50;
  const touches = Array.from({ length: fingers }, () => ({ clientX: x, clientY: y }));
  Object.defineProperties(event, { touches: { value: type === "touchend" ? [] : touches }, changedTouches: { value: touches }, timeStamp: { value: clock } });
  await act(async () => target.dispatchEvent(event));
  return event;
}
async function advance(ms = 220) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(32); }); }
async function mount(selected = "First", onSelect = vi.fn(async (_id: string) => true)) {
  function Harness() {
    const [active, setActive] = useState(selected);
    return <MobileNoteCarousel enabled ids={ids} selected={active}
      onSelect={async id => { const result = await onSelect(id); if (result) setActive(id); return result; }}
      renderPreview={id => <p>{id} neighboring content</p>}>
      <p contentEditable suppressContentEditableWarning>{active} editable content</p><button>Rename</button><pre>code</pre>
    </MobileNoteCarousel>;
  }
  await act(async () => root.render(<Harness />));
  return onSelect;
}

it("wraps both directions and leaves a single tab alone", () => {
  expect(adjacentNote(ids, "Last", 1)).toBe("First");
  expect(adjacentNote(ids, "First", -1)).toBe("Last");
  expect(adjacentNote(["First"], "First", 1)).toBeNull();
  expect(adjacentNote(ids, "missing", 1)).toBeNull();
});

it("moves outgoing and incoming full panels together before selecting, then wraps last to first", async () => {
  const select = await mount("Last");
  const editor = container.querySelector(".note-carousel-current p");
  await touch("touchstart", 320); await touch("touchmove", 150);
  const viewport = container.querySelector<HTMLElement>(".mobile-note-carousel")!;
  expect(viewport.style.getPropertyValue("--note-drag")).toBe("-170px");
  expect(viewport.dataset.motion).toBe("dragging");
  expect(container.querySelector(".note-carousel-next")?.textContent).toBe("First neighboring content");
  expect(container.querySelector(".note-carousel-previous")?.textContent).toBe("Middle neighboring content");
  expect(select).not.toHaveBeenCalled(); expect(container.querySelector(".note-carousel-current p")).toBe(editor);
  await touch("touchend", 150); expect(select).not.toHaveBeenCalled();
  await advance();
  expect(select).toHaveBeenCalledExactlyOnceWith("First");
  expect(viewport.dataset.motion).toBe("idle");
  expect(container.querySelector(".note-carousel-current p")?.textContent).toContain("First");
});

it("wraps right from first to last, including gestures starting on code and buttons", async () => {
  const select = await mount();
  const code = container.querySelector("pre")!;
  await touch("touchstart", 30, 250, code); await touch("touchmove", 210, 250, code); await touch("touchend", 210, 250, code); await advance();
  expect(select).toHaveBeenLastCalledWith("Last");
  const button = container.querySelector("button")!, click = vi.fn(); button.addEventListener("click", click);
  await touch("touchstart", 300, 250, button); await touch("touchmove", 100, 250, button); await touch("touchend", 100, 250, button);
  await act(async () => button.click()); expect(click).not.toHaveBeenCalled();
  await advance(); expect(select).toHaveBeenLastCalledWith("First");
});

it("snaps back on a short drag, reversal, vertical scrolling, and touch cancellation", async () => {
  const select = await mount();
  await touch("touchstart", 250); await touch("touchmove", 235); await touch("touchend", 235); await advance();
  expect(select).not.toHaveBeenCalled();
  await touch("touchstart", 300); await touch("touchmove", 100); await touch("touchmove", 280); await touch("touchend", 280); await advance();
  expect(select).not.toHaveBeenCalled();
  await touch("touchstart", 300); const vertical = await touch("touchmove", 295, 300); await touch("touchmove", 100, 300); await touch("touchend", 100, 300); await advance();
  expect(vertical.defaultPrevented).toBe(false); expect(select).not.toHaveBeenCalled();
  await touch("touchstart", 300); await touch("touchmove", 100); await touch("touchcancel", 100); await advance();
  expect(select).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLElement>(".mobile-note-carousel")!.style.getPropertyValue("--note-drag")).toBe("0px");
});

it("holds the incoming panel during async draft preservation and restores the current note if switching fails", async () => {
  let finish!: (opened: boolean) => void;
  const select = await mount("First", vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })));
  await touch("touchstart", 300); await touch("touchmove", 100); await touch("touchend", 100); await advance();
  const viewport = container.querySelector<HTMLElement>(".mobile-note-carousel")!;
  expect(select).toHaveBeenCalledOnce(); expect(viewport.style.getPropertyValue("--note-drag")).toBe("-400px");
  expect(container.querySelector(".note-carousel-current p")?.textContent).toContain("First");
  await act(async () => finish(false)); await advance();
  expect(viewport.style.getPropertyValue("--note-drag")).toBe("0px");
  expect(container.querySelector(".note-carousel-current p")?.textContent).toContain("First");
});

it("cancels multi-touch and a tab-list change without opening a stale target", async () => {
  const select = vi.fn(async (_id: string) => true);
  const render = (tabs: string[]) => <MobileNoteCarousel enabled ids={tabs} selected="First" onSelect={select} renderPreview={id => id}><p>First</p></MobileNoteCarousel>;
  await act(async () => root.render(render(ids)));
  await touch("touchstart", 300); await touch("touchmove", 100, 250, undefined, 2); await touch("touchend", 100); await advance();
  expect(select).not.toHaveBeenCalled();
  await touch("touchstart", 300); await touch("touchmove", 100);
  await act(async () => root.render(render(["First"])));
  await advance(); expect(select).not.toHaveBeenCalled();
});
