// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ReplaceDriveDialog from "./ReplaceDriveDialog";

it("requires explicit confirmation, keeps errors visible, and blocks dismissal during preparation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const show = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onClose = vi.fn();
  let reject!: (error: Error) => void;
  const onConfirm = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  try {
    await act(async () => root.render(<ReplaceDriveDialog name="Note.md" onConfirm={onConfirm} onClose={onClose}/>));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("Cancel");
    await act(async () => host.querySelectorAll("button")[1].click());
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => reject(new Error("Conflict changed")));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Error: Conflict changed");
    await act(async () => host.querySelector("button")!.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount()); host.remove();
    HTMLDialogElement.prototype.showModal = show; HTMLDialogElement.prototype.close = close; vi.unstubAllGlobals();
  }
});
