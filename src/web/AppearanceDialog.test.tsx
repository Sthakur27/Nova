// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import AppearanceDialog from "./AppearanceDialog";

it("switches writing width and restores the trigger after Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const show = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const host = document.createElement("div"), trigger = document.createElement("button");
  document.body.append(trigger, host); trigger.focus();
  const root = createRoot(host);
  function Harness() {
    const [wide, setWide] = useState(false), [open, setOpen] = useState(true);
    return open ? <AppearanceDialog wide={wide} onWideChange={setWide} onClose={() => setOpen(false)}/> : null;
  }
  try {
    await act(async () => root.render(<Harness/>));
    const buttons = host.querySelectorAll('[aria-pressed]');
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    await act(async () => (buttons[1] as HTMLButtonElement).click());
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount());
    host.remove(); trigger.remove(); HTMLDialogElement.prototype.showModal = show; HTMLDialogElement.prototype.close = close; vi.unstubAllGlobals();
  }
});
