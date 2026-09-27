// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FileLocationControls from "./FileLocationControls";
import { confirmCloudMove } from "./confirmCloudMove";

it("reveals files and routes Cloud and muted Local buttons to their respective actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onReveal = vi.fn(), onOpenDrive = vi.fn(), onMoveToCloud = vi.fn();
  const props = { root: "/notes", path: "note.md", desktop: true, busy: false, onReveal, onOpenDrive, onMoveToCloud };
  try {
    await act(async () => root.render(<FileLocationControls {...props} cloud={false} />));
    const [folder, cloud] = container.querySelectorAll("button");
    expect(cloud.getAttribute("aria-label")).toBe("Move to Cloud");
    expect(cloud.classList.contains("cloud-location-local")).toBe(true);
    expect(cloud.disabled).toBe(false);
    expect(cloud.getAttribute("aria-haspopup")).toBe("dialog");
    folder.click(); cloud.click();
    expect(onReveal).toHaveBeenCalledOnce();
    expect(onMoveToCloud).toHaveBeenCalledOnce();
    expect(onOpenDrive).not.toHaveBeenCalled();
    await act(async () => root.render(<FileLocationControls {...props} cloud />));
    expect(cloud.getAttribute("aria-label")).toBe("Open in Google Drive");
    expect(cloud.classList.contains("cloud-location-local")).toBe(false);
    expect(cloud.hasAttribute("aria-haspopup")).toBe(false);
    cloud.click();
    expect(onOpenDrive).toHaveBeenCalledOnce();
    for (const unavailable of [{ root: "demo" }, { root: "" }, { path: "" }, { path: ".nova" }, { desktop: false }]) {
      await act(async () => root.render(<FileLocationControls {...props} {...unavailable} cloud={false} />));
      expect(folder.disabled).toBe(true);
      expect(cloud.disabled).toBe(true);
      folder.click(); cloud.click();
    }
    await act(async () => root.render(<FileLocationControls {...props} busy cloud={false} />));
    expect(cloud.disabled).toBe(true);
    cloud.click();
    expect(onMoveToCloud).toHaveBeenCalledOnce();
    expect(onReveal).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("requires confirmation to move a Local note and lets Cancel or Escape preserve it", async () => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  for (const action of ["Cancel", "Escape", "Move to Cloud"]) {
    const result = confirmCloudMove("note.md", "Notes");
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain("Move note.md to Cloud?");
    expect(dialog.textContent).toContain("live in Notes");
    expect(document.activeElement?.textContent).toBe("Cancel");
    if (action === "Escape") dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    else [...dialog.querySelectorAll("button")].find(button => button.textContent === action)!.click();
    expect(await result).toBe(action === "Move to Cloud");
    expect(document.querySelector("dialog")).toBeNull();
  }
});
