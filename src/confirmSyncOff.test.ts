// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { confirmSyncOff, stopsSync } from "./confirmSyncOff";
it("confirms only changes that stop effective sync, including inherited defaults", () => {
  const policy = {version: 1 as const, rules: {"": true, "private": false, "keep.txt": true}};
  expect(stopsSync(policy, "note.txt", "exclude", ["note.txt"])).toBe(true);
  expect(stopsSync(policy, "note.txt", "inherit", ["note.txt"])).toBe(false);
  expect(stopsSync(policy, "", "inherit", ["note.txt", "keep.txt"])).toBe(true);
  expect(stopsSync(policy, "private", "exclude", ["private/a.txt"])).toBe(false);
});
it("requires explicit confirmation; cancel and Escape preserve sync", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  for (const action of ["Keep syncing", "Escape", "Turn off sync"]) {
    const result = confirmSyncOff("note.txt");
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain("will not be deleted");
    expect(document.activeElement?.textContent).toBe("Keep syncing");
    if (action === "Escape") dialog.dispatchEvent(new Event("cancel", {cancelable:true}));
    else [...dialog.querySelectorAll("button")].find(button => button.textContent === action)!.click();
    expect(await result).toBe(action === "Turn off sync");
    expect(document.querySelector("dialog")).toBeNull();
  }
});
