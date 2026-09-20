// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import AppUpdate from "./AppUpdate";
import type { useAppUpdate } from "./useAppUpdate";
it("announces available updates, opens a modal, and prevents dismissal during installation", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const updater = { phase: "available" as ReturnType<typeof useAppUpdate>["phase"], version: "0.2.42", error: "", progress: undefined, checkNow: vi.fn(), download: vi.fn(), restart: vi.fn() };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = () => root.render(<AppUpdate updater={updater} />);
  try {
    await act(async () => render());
    const icon = host.querySelector<HTMLButtonElement>("button")!;
    expect(icon.dataset.available).toBe("true");
    expect(icon.getAttribute("aria-label")).toContain("0.2.42");
    await act(async () => icon.click());
    expect(host.querySelector("dialog")?.open).toBe(true);
    expect(document.activeElement?.id).toBe("app-update-title");
    await act(async () => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Download update")!.click());
    expect(updater.download).toHaveBeenCalledOnce();
    updater.phase = "installing";
    await act(async () => render());
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(host.querySelector("dialog")?.open).toBe(true);
    expect(Array.from(host.querySelectorAll("dialog button")).every(b => (b as HTMLButtonElement).disabled)).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it.each(["idle", "checking", "current"] as const)("hides the Settings update button while %s", async phase => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"), root = createRoot(host);
  const updater = { phase, version: "", error: "offline", progress: undefined, checkNow: vi.fn(), download: vi.fn(), restart: vi.fn() };
  try {
    await act(async () => root.render(<AppUpdate updater={updater} />));
    expect(host.childElementCount).toBe(0);
  } finally { await act(async () => root.unmount()); }
});
