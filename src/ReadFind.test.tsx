// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ReadFind from "./ReadFind";
import { buildReadPages, pageForLine } from "./readPages";

it("captures Ctrl/Cmd-F, navigates matches without losing input focus, wraps, and closes", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onJump = vi.fn();
  const press = async (target: EventTarget, key: string, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
    await act(async () => { target.dispatchEvent(event); });
    return event;
  };
  const type = async (value: string) => {
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  };
  try {
    await act(async () => root.render(<ReadFind text="Note note notebook" disabled={false} onJump={onJump} />));
    expect((await press(window, "f")).defaultPrevented).toBe(false);
    expect((await press(window, "f", { ctrlKey: true })).defaultPrevented).toBe(true);
    const input = await type("note");
    expect(host.textContent).toContain("1 of 3");
    expect(onJump).toHaveBeenLastCalledWith(0, 4);
    expect(document.activeElement).toBe(input);
    await press(input, "Enter");
    expect(onJump).toHaveBeenLastCalledWith(5, 9);
    await press(input, "Enter", { shiftKey: true });
    await press(input, "Enter", { shiftKey: true });
    expect(host.textContent).toContain("3 of 3");
    expect(onJump).toHaveBeenLastCalledWith(10, 14);
    expect((await press(input, "f", { metaKey: true })).defaultPrevented).toBe(true);
    expect(host.querySelector("input")).toBeNull();
    await press(window, "f", { metaKey: true });
    const reopenedInput = host.querySelector("input")!;
    expect(document.activeElement).toBe(reopenedInput);
    expect(reopenedInput.value).toBe("note");
    expect(reopenedInput.selectionStart).toBe(0);
    expect(reopenedInput.selectionEnd).toBe(4);
    await type("missing");
    expect(host.textContent).toContain("No results");
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Previous match (Shift+Enter)"]')!.disabled).toBe(true);
    await press(reopenedInput, "Escape");
    expect(host.querySelector("input")).toBeNull();
    await act(async () => root.render(<ReadFind text="Note" disabled onJump={onJump} />));
    expect((await press(window, "f", { ctrlKey: true })).defaultPrevented).toBe(false);
    await act(async () => root.render(<ReadFind text="Note" disabled={false} onJump={onJump} />));
    const terminal = document.createElement("div"); terminal.id = "terminal-panel"; host.append(terminal);
    expect((await press(terminal, "f", { ctrlKey: true })).defaultPrevented).toBe(false);
    terminal.remove();
    // The match list includes text beyond the currently rendered reading page.
    const text = "padding\n".repeat(1000) + "needle";
    await act(async () => root.render(<ReadFind text={text} disabled={false} onJump={onJump} />));
    await press(window, "f", { metaKey: true });
    await type("needle");
    expect(onJump).toHaveBeenLastCalledWith(8000, 8006);
    const line = text.slice(0, onJump.mock.lastCall![0]).split("\n").length;
    expect(pageForLine(buildReadPages(text, false), line)).toBeGreaterThan(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("keeps independent queries and only handles shortcuts in the active panel", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const jumps = [vi.fn(), vi.fn()];
  const render = (active: number) => act(async () => root.render(<>
    {[0, 1].map(index => <section key={index}>
      <ReadFind text={index === 0 ? "apple apple" : "pear"} disabled={active !== index} onJump={jumps[index]} />
    </section>)}
  </>));
  const press = () => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true })); });
  try {
    await render(0);
    await press();
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "apple");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    jumps[0].mockClear();
    await render(1);
    await press();
    const inputs = host.querySelectorAll("input");
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe("apple");
    expect(inputs[1].value).toBe("");
    expect(document.activeElement).toBe(inputs[1]);
    expect(jumps[0]).not.toHaveBeenCalled();
    await press();
    expect(host.querySelectorAll("input")).toHaveLength(1);
    expect(host.querySelector("input")!.value).toBe("apple");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
