// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { confirmCloudReset } from "./confirmCloudReset";
it("requires explicit consent and explains the local data loss", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  for (const action of ["Cancel", "Escape", "Reset from Google Drive"]) {
    const result = confirmCloudReset();
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain("Changes not yet uploaded");
    expect(dialog.textContent).toContain("Google Drive files will not be changed");
    expect(document.activeElement?.textContent).toBe("Cancel");
    if (action === "Escape") dialog.dispatchEvent(new Event("cancel", {cancelable:true}));
    else [...dialog.querySelectorAll("button")].find(button => button.textContent === action)!.click();
    expect(await result).toBe(action === "Reset from Google Drive");
    expect(document.querySelector("dialog")).toBeNull();
  }
});
