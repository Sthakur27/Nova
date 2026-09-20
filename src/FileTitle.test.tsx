// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FileTitle from "./FileTitle";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function edit(onRename: (name: string) => Promise<void>, path = "Notes/Original.md") {
  await act(async () => root.render(<FileTitle path={path} onRename={onRename} />));
  await act(async () => container.querySelector("button")!.click());
  return container.querySelector("textarea")!;
}
async function type(input: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(input: HTMLTextAreaElement, key: string, options: KeyboardEventInit = {}) {
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })));
}

it.each(["Enter", "blur", "Meta+s", "Control+s"])("renames on %s and preserves the extension", async trigger => {
  const rename = vi.fn().mockResolvedValue(undefined);
  const input = await edit(rename);
  expect(input.value).toBe("Original");
  await type(input, "  New title  ");
  if (trigger === "blur") await act(async () => input.blur());
  else await key(input, trigger === "Enter" ? "Enter" : "s", { metaKey: trigger === "Meta+s", ctrlKey: trigger === "Control+s" });
  expect(rename).toHaveBeenCalledExactlyOnceWith("New title.md");
  expect(container.querySelector("textarea")).toBeNull();
});

it("Escape cancels without a blur save", async () => {
  const rename = vi.fn();
  const input = await edit(rename);
  await type(input, "Discard me");
  await key(input, "Escape");
  await act(async () => input.blur());
  expect(rename).not.toHaveBeenCalled();
  expect(container.querySelector("h1")?.textContent).toBe("Original");
});

it("deduplicates Enter, Command-S and blur while rename is pending", async () => {
  let finish!: () => void;
  const rename = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const input = await edit(rename);
  await type(input, "New");
  await key(input, "Enter");
  await key(input, "s", { metaKey: true });
  await act(async () => input.blur());
  expect(rename).toHaveBeenCalledTimes(1);
  expect(input.readOnly).toBe(true);
  await act(async () => finish());
});

it.each(["", "  ", "../outside", "New\nname"])("rejects invalid title %j", async name => {
  const rename = vi.fn();
  const input = await edit(rename);
  await type(input, name);
  await key(input, "Enter");
  expect(rename).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

it("keeps failed renames editable for retry", async () => {
  const rename = vi.fn().mockRejectedValueOnce(new Error("A file with that name already exists.")).mockResolvedValueOnce(undefined);
  const input = await edit(rename);
  await type(input, "Existing");
  await key(input, "Enter");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("already exists");
  expect(input.value).toBe("Existing");
  await type(input, "Unique");
  await key(input, "Enter");
  expect(rename).toHaveBeenLastCalledWith("Unique.md");
});

it("does not rename unchanged titles or commit an IME confirmation", async () => {
  const rename = vi.fn();
  let input = await edit(rename);
  await key(input, "Enter");
  expect(rename).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  input = container.querySelector("textarea")!;
  await type(input, "日本語");
  await key(input, "Enter", { isComposing: true });
  expect(rename).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")).not.toBeNull();
});

it("keeps dotfiles extensionless", async () => {
  const rename = vi.fn().mockResolvedValue(undefined);
  const input = await edit(rename, ".env");
  await type(input, ".settings");
  await key(input, "Enter");
  expect(rename).toHaveBeenCalledExactlyOnceWith(".settings");
});
