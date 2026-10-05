// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FilenameDialog from "./FilenameDialog";

it("retains rejected names, prevents duplicate submissions, and restores focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const show = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const host = document.createElement("div"), trigger = document.createElement("button");
  document.body.append(trigger, host); trigger.focus();
  const root = createRoot(host), onClose = vi.fn();
  let finish!: () => void;
  const onSubmit = vi.fn().mockRejectedValueOnce(new Error("Name already exists")).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  try {
    await act(async () => root.render(<FilenameDialog title="New note" initialName="Untitled.md" action="Create note" onSubmit={onSubmit} onClose={onClose}/>));
    const input = host.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe(8);
    const submit = () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => { submit(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Name already exists");
    expect(input.value).toBe("Untitled.md"); expect(onClose).not.toHaveBeenCalled();
    await act(async () => { submit(); submit(); host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(onSubmit).toHaveBeenCalledTimes(2); expect(onClose).not.toHaveBeenCalled(); expect(input.readOnly).toBe(true);
    await act(async () => finish()); expect(onClose).toHaveBeenCalledOnce();
    await act(async () => { host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(onClose).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount()); expect(document.activeElement).toBe(trigger);
    host.remove(); trigger.remove(); HTMLDialogElement.prototype.showModal = show; HTMLDialogElement.prototype.close = close; vi.unstubAllGlobals();
  }
});
