// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import useReconnectPrompt, { needsDriveReconnect, RECONNECT_DELAY } from "./useReconnectPrompt";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("remembers dismissal for an hour across focus, online events, and reloads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  let prompt!: ReturnType<typeof useReconnectPrompt>;
  function Harness() { prompt = useReconnectPrompt({ account: "alice", needed: () => true, busy: false }); return null; }
  const host = document.createElement("div"); let root = createRoot(host);
  try {
    await act(async () => root.render(<Harness/>)); expect(prompt.open).toBe(true);
    await act(async () => prompt.dismiss()); expect(prompt.open).toBe(false);
    await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); vi.advanceTimersByTime(1000); });
    expect(prompt.open).toBe(false);
    await act(async () => root.unmount()); root = createRoot(host);
    await act(async () => root.render(<Harness/>)); expect(prompt.open).toBe(false);
    await act(async () => vi.advanceTimersByTime(RECONNECT_DELAY - 1000)); expect(prompt.open).toBe(true);
  } finally { await act(async () => root.unmount()); }
});
it("defers offline, hidden, busy, and other dialogs; closes after recovery", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  let needed = true, busy = false, blocked = false, prompt!: ReturnType<typeof useReconnectPrompt>;
  function Harness() { prompt = useReconnectPrompt({ account: "alice", needed: () => needed, busy, blocked }); return null; }
  const root = createRoot(document.createElement("div"));
  const tick = async () => { await act(async () => vi.advanceTimersByTime(1000)); };
  const render = async () => { await act(async () => root.render(<Harness/>)); };
  const dialog = document.createElement("dialog");
  try {
    await render(); expect(prompt.open).toBe(false);
    online.mockReturnValue(true); hidden.mockReturnValue(true); await tick(); expect(prompt.open).toBe(false);
    hidden.mockReturnValue(false); busy = true; await render(); await tick(); expect(prompt.open).toBe(false);
    busy = false; blocked = true; await render(); await tick(); expect(prompt.open).toBe(false);
    blocked = false; await render(); dialog.open = true; document.body.append(dialog); await tick(); expect(prompt.open).toBe(false);
    dialog.remove(); await tick(); expect(prompt.open).toBe(true);
    needed = false; await tick(); expect(prompt.open).toBe(false);
    needed = true; await tick(); expect(prompt.open).toBe(true);
  } finally { dialog.remove(); await act(async () => root.unmount()); }
});
it("recognizes native authorization failures without treating offline or conflicts as expiry", () => {
  expect(needsDriveReconnect("Google access expired or was revoked. Choose Reconnect Google Drive in Cloud settings.")).toBe(true);
  expect(needsDriveReconnect("Could not read the Google connection from the system credential store.")).toBe(true);
  for (const message of ["Google Drive is offline. Check your connection and retry.", "Both copies changed. Review them.", "Reconnect Drive and refresh Cloud first."]) expect(needsDriveReconnect(message)).toBe(false);
});

it("shares dismissals between windows while keeping different accounts independent", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  let account = "alice", prompt!: ReturnType<typeof useReconnectPrompt>;
  function Harness() { prompt = useReconnectPrompt({ account, needed: () => true, busy: false }); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness/>)); expect(prompt.open).toBe(true);
    localStorage.setItem("nova-reconnect-dismissed-v1:alice", String(Date.now() + RECONNECT_DELAY));
    await act(async () => window.dispatchEvent(new Event("storage"))); expect(prompt.open).toBe(false);
    account = "bob"; await act(async () => { root.render(<Harness/>); });
    await act(async () => vi.advanceTimersByTime(1000)); expect(prompt.open).toBe(true);
  } finally { await act(async () => root.unmount()); }
});
it("keeps the one-hour cooldown when persistent storage is blocked", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  let prompt!: ReturnType<typeof useReconnectPrompt>;
  function Harness() { prompt = useReconnectPrompt({ account: "alice", needed: () => true, busy: false }); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness/>));
    await act(async () => prompt.dismiss());
    await act(async () => vi.advanceTimersByTime(RECONNECT_DELAY - 1000)); expect(prompt.open).toBe(false);
    await act(async () => vi.advanceTimersByTime(1000)); expect(prompt.open).toBe(true);
  } finally { await act(async () => root.unmount()); }
});
