// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import VoiceControl from "./VoiceControl";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), handlers: new Map<string, () => void>(), partial: undefined as undefined | ((event: { payload: { sessionId: string; text: string } }) => void) }));
vi.mock("./storage", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name, handler) => {
  if (name === "speech:partial") mocks.partial = handler;
  return () => { if (name === "speech:partial") mocks.partial = undefined; };
}) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  listen: async (name: string, handler: () => void) => {
    mocks.handlers.set(name, handler);
    return () => { mocks.handlers.delete(name); };
  },
}) }));

it("toggles dictation from a focused input and the native menu, respects busy states, and advertises the shortcut", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.invoke.mockImplementation(async (command: string) => command === "speech_status" ? { ready: true } : command === "speech_finish" ? "Hello" : undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const input = document.createElement("input");
  document.body.append(input);
  const root = createRoot(host);
  const props = { disabled: false, onBegin: vi.fn(), onText: vi.fn(), onPartial: vi.fn(), onCancel: vi.fn(), onBusy: vi.fn(), onError: vi.fn() };
  const press = async (extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key: "D", metaKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra });
    await act(async () => { input.dispatchEvent(event); });
    return event;
  };
  try {
    await act(async () => root.render(<VoiceControl {...props} />));
    input.focus();
    expect(host.querySelector('[aria-label="Dictate"]')?.getAttribute("aria-keyshortcuts")).toBe("Meta+Shift+D");
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain("⌘⇧D");
    expect((await press({ shiftKey: false })).defaultPrevented).toBe(false);
    expect((await press({ metaKey: false, ctrlKey: true })).defaultPrevented).toBe(false);
    expect((await press({ key: "v", shiftKey: false })).defaultPrevented).toBe(false);
    expect((await press({ key: "V" })).defaultPrevented).toBe(false);
    await press({ repeat: true });
    expect(props.onBegin).not.toHaveBeenCalled();
    expect((await press()).defaultPrevented).toBe(true);
    expect(props.onBegin).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    const sessionId = mocks.invoke.mock.calls.find(call => call[0] === "speech_start")![1].sessionId;
    await act(async () => { mocks.partial?.({ payload: { sessionId, text: "Hel" } }); });
    expect(props.onPartial).toHaveBeenCalledWith("Hel");
    expect(props.onText).not.toHaveBeenCalled();
    await press({ repeat: true });
    expect(props.onText).not.toHaveBeenCalled();
    await press();
    expect(props.onText).toHaveBeenCalledWith("Hello");
    await act(async () => { mocks.handlers.get("nova:dictate")?.(); });
    expect(props.onBegin).toHaveBeenCalledTimes(2);
    await act(async () => { mocks.handlers.get("nova:dictate")?.(); });
    await act(async () => root.render(<VoiceControl {...props} disabled />));
    await press();
    expect(props.onBegin).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    input.remove();
  }
  expect(mocks.handlers.has("nova:dictate")).toBe(false);
  const event = new KeyboardEvent("keydown", { key: "D", metaKey: true, shiftKey: true, cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
