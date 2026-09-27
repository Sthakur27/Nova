// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BuiltinDocs from "./BuiltinDocs";

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
async function render() {
  await act(async () => root.render(<BuiltinDocs />));
}
it("opens Welcome directly with focus on Close, and switches between read-only pages", async () => {
  await render();
  expect(document.querySelector("dialog")).toBeNull();
  expect(button("About Nova").title).toBe("About Nova");
  await click("About Nova");
  expect(document.activeElement).toBe(button("Close built-in documents"));
  expect(document.querySelector("dialog h1")?.hasAttribute("tabindex")).toBe(false);
  expect(document.querySelector("dialog[open]")?.textContent).toContain("A little space to think");
  expect(document.querySelector("dialog textarea, dialog [contenteditable=true]")).toBeNull();
  await click("Changelog");
  expect(document.querySelector("dialog")?.textContent).toContain("Unreleased");
  expect(document.querySelector('dialog a[href="https://github.com/Sthakur27/Nova/blob/main/README.md"]')).not.toBeNull();
  await click("Close built-in documents");
  expect(document.activeElement).toBe(button("About Nova"));
});
it("dismisses with Escape, restores focus, and reopens on Welcome", async () => {
  await render();
  await click("About Nova"); await click("Changelog");
  await act(async () => document.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(button("About Nova"));
  await click("About Nova");
  expect(document.querySelector("dialog h1")?.textContent).toBe("Welcome to Nova");
});
