// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import CloseTabDialog from "./CloseTabDialog";

it("offers save, discard, and cancel; Escape cancels and closing restores focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const previous = document.createElement("button");
  document.body.append(previous);
  previous.focus();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const choose = vi.fn();
  try {
    await act(async () => root.render(<CloseTabDialog path="notes/Draft.md" onChoose={choose} />));
    expect(container.textContent).toContain("Draft.md");
    for (const button of container.querySelectorAll("button")) {
      await act(async () => button.click());
      expect(choose).toHaveBeenLastCalledWith(button.textContent!.toLowerCase());
    }
    await act(async () => container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(choose).toHaveBeenLastCalledWith("cancel");
  } finally {
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(previous);
    container.remove();
    previous.remove();
    vi.unstubAllGlobals();
  }
});
