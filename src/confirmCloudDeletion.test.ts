// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { confirmCloudDeletion } from "./confirmCloudDeletion";
it("requires an explicit delete; Cancel and Escape preserve the local copy", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  for (const action of ["Cancel", "Escape", "Delete local copy"]) {
    const result = confirmCloudDeletion("<note>.txt");
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain("<note>.txt");
    expect(dialog.textContent).toContain("cannot be undone");
    expect(dialog.querySelector("note")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Cancel");
    if (action === "Escape") dialog.dispatchEvent(new Event("cancel", {cancelable:true}));
    else [...dialog.querySelectorAll("button")].find(button => button.textContent === action)!.click();
    expect(await result).toBe(action === "Delete local copy");
    expect(document.querySelector("dialog")).toBeNull();
  }
});
