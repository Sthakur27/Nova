// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Explorer from "./Explorer";

const originalShow = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); HTMLDialogElement.prototype.showModal = originalShow; HTMLDialogElement.prototype.close = originalClose; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (label: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>("button")]
  .find(button => (button.getAttribute("aria-label") || button.textContent) === label)!;
async function click(label: string) { await act(async () => button(label).click()); }
async function render(cloudOnly = false) {
  const untouched = vi.fn();
  await act(async () => root.render(<Explorer folders={[]} cloudOnly={cloudOnly} activeRoot="" activePath="" externalDrag={false}
    onOpen={untouched} onRename={untouched} onFileAction={untouched} onChange={untouched} onRemove={untouched} onRefresh={untouched} onAdd={untouched} />));
  return untouched;
}
it("keeps the empty workspace and opens offline read-only pages without file actions", async () => {
  const untouched = await render();
  expect(host.textContent).toContain("Open a folder to get started.");
  expect(document.querySelector("dialog")).toBeNull();
  expect(button("About Nova").title).toBe("About Nova");
  await click("About Nova"); await click("Welcome");
  expect(document.querySelector("dialog[open]")?.textContent).toContain("A little space to think");
  expect(document.querySelector("dialog textarea, dialog [contenteditable=true]")).toBeNull();
  await click("Changelog");
  expect(document.querySelector("dialog")?.textContent).toContain("Unreleased");
  expect(document.querySelector('dialog a[href="https://github.com/Sthakur27/Nova/blob/main/README.md"]')).not.toBeNull();
  await click("Close built-in documents");
  expect(document.activeElement).toBe(button("About Nova"));
  expect(untouched).not.toHaveBeenCalled();
});
it("offers both pages with no Cloud folders and handles menu and dialog dismissal", async () => {
  await render(true);
  await click("About Nova");
  await act(async () => button("Welcome").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(button("About Nova").getAttribute("aria-expanded")).toBe("false");
  await click("About Nova");
  await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  expect(button("Welcome")).toBeUndefined();
  await click("About Nova"); await click("Changelog");
  await act(async () => document.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(button("About Nova"));
});
