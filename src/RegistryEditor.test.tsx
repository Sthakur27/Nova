// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import RegistryEditor from "./RegistryEditor";
import { invoke } from "./resetLocalState";
import { loadDraft, storeDraft, clearDraft } from "./drafts";
vi.mock("./resetLocalState", () => ({ invoke: vi.fn() }));
vi.mock("./drafts", () => ({ loadDraft: vi.fn(), storeDraft: vi.fn(), clearDraft: vi.fn() }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const onClose = vi.fn(), onSaved = vi.fn();
const button = (label: string) => [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(250); }); };
async function render() {
  await act(async () => root.render(<RegistryEditor folder={{ root: "/notes", name: "Notes", files: [] }} onClose={onClose} onSaved={onSaved}/>));
  await tick();
}
async function edit(text: string) {
  await act(async () => {
    const input = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tick();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.mocked(loadDraft).mockResolvedValue(null); vi.mocked(storeDraft).mockResolvedValue(); vi.mocked(clearDraft).mockResolvedValue();
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "read_registry_document") return { text: "{}", revision: "original" };
    if (command === "validate_registry_document") { JSON.parse((args as { text: string }).text); return null; }
    if (command === "save_registry_document") return "updated";
    throw new Error(command);
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("blocks invalid saves, preserves drafts, and only writes valid JSON on explicit Save", async () => {
  await render(); await edit("{");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(button("Save .nova").disabled).toBe(true);
  expect(storeDraft).toHaveBeenLastCalledWith("/notes", ".nova", { text: "{", revision: "original", bookmarks: [] });
  expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "save_registry_document")).toBe(false);
  await edit('{"starred":["a.md"]}');
  expect(button("Save .nova").disabled).toBe(false);
  await act(async () => button("Save .nova").click());
  expect(invoke).toHaveBeenCalledWith("save_registry_document", { root: "/notes", text: '{"starred":["a.md"]}', revision: "original" });
  expect(clearDraft).toHaveBeenCalledWith("/notes", ".nova"); expect(onSaved).toHaveBeenCalledOnce();
});
it("restores a conflicting recovery draft without overwriting newer metadata", async () => {
  vi.mocked(loadDraft).mockResolvedValue({ text: '{"custom":1}', revision: "older", bookmarks: [] });
  await render();
  expect(host.querySelector("textarea")!.value).toBe('{"custom":1}');
  expect(host.textContent).toContain("saved file changed");
  expect(button("Save .nova").disabled).toBe(true);
});
it("keeps edits and explains a native save rejection", async () => {
  await render(); await edit('{"custom":1}');
  vi.mocked(invoke).mockRejectedValueOnce(new Error(".nova changed since this editor opened."));
  await act(async () => button("Save .nova").click());
  expect(host.textContent).toContain(".nova changed"); expect(clearDraft).not.toHaveBeenCalled();
  expect(host.querySelector("textarea")!.value).toBe('{"custom":1}');
});
it("does not close when recovery storage fails", async () => {
  await render(); vi.mocked(storeDraft).mockRejectedValue(new Error("disk full")); await edit("{");
  await act(async () => button("Close").click());
  expect(onClose).not.toHaveBeenCalled(); expect(host.textContent).toContain("Copy your edits before closing");
});
