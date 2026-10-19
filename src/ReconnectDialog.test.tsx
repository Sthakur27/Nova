// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ReconnectDialog from "./ReconnectDialog";
it("focuses Reconnect, calls it directly, allows dismissal, and restores editor focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const show = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const input = document.createElement("input"), host = document.createElement("div"); document.body.append(input, host); input.focus();
  const root = createRoot(host), reconnect = vi.fn(), onClose = vi.fn();
  try {
    await act(async () => root.render(<ReconnectDialog busy={false} reconnect={reconnect} onClose={onClose}/>));
    expect(document.activeElement?.textContent).toBe("Reconnect");
    expect(host.querySelector("dialog")?.getAttribute("aria-describedby")).toBeTruthy();
    await act(async () => (document.activeElement as HTMLButtonElement).click()); expect(reconnect).toHaveBeenCalledOnce();
    await act(async () => root.render(<ReconnectDialog busy reconnect={reconnect} onClose={onClose}/>));
    expect(host.querySelector("button")?.disabled).toBe(true);
    await act(async () => host.querySelectorAll("button")[1].click()); expect(onClose).toHaveBeenCalledOnce();
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }))); expect(onClose).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount()); expect(document.activeElement).toBe(input);
  } finally { host.remove(); input.remove(); HTMLDialogElement.prototype.showModal = show; HTMLDialogElement.prototype.close = close; vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
