// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import useConnectionPrompt from "./useConnectionPrompt";

it("prompts once, offers again on return/expiry, and defers offline, OAuth, and other dialogs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  let connected = false, connecting = false, open = false;
  const request = vi.fn();
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function Harness() { useConnectionPrompt({ connected: () => connected, connecting, open, request }); return null; }
  const render = async () => { await act(async () => root.render(<Harness/>)); };
  const tick = async () => { await act(async () => vi.advanceTimersByTime(1000)); };
  const event = async (name: string) => { await act(async () => window.dispatchEvent(new Event(name))); };
  try {
    await render(); expect(request).toHaveBeenCalledTimes(1);
    await tick(); await event("focus"); expect(request).toHaveBeenCalledTimes(1);
    await event("blur"); await event("focus"); expect(request).toHaveBeenCalledTimes(2);
    connecting = true; await render(); await event("blur"); await event("focus"); await tick();
    connecting = false; await render(); await tick(); expect(request).toHaveBeenCalledTimes(2);
    connected = true; await tick(); connected = false; await tick(); expect(request).toHaveBeenCalledTimes(3);
    online.mockReturnValue(false); await event("blur"); await event("focus"); await tick(); expect(request).toHaveBeenCalledTimes(3);
    online.mockReturnValue(true);
    const dialog = document.createElement("dialog"); dialog.open = true; host.append(dialog);
    await event("online"); expect(request).toHaveBeenCalledTimes(3);
    dialog.remove(); await tick(); expect(request).toHaveBeenCalledTimes(4);
    open = true; await render(); await event("blur"); await event("focus");
    open = false; await render(); await tick(); expect(request).toHaveBeenCalledTimes(4);
  } finally { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
