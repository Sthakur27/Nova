// @vitest-environment jsdom
import { act, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MobileFileBar from "./MobileFileBar";
import MobileViewControls from "./MobileViewControls";
import RenameDialog from "./RenameDialog";
import FileTitle from "./FileTitle";
import { dismissKeyboardOutsideEditor } from "./mobileGestures";
import { tabId } from "./tabs";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tabs = [{ root: "demo", path: "One.md", pinned: true }, { root: "demo", path: "Two.md", pinned: true }];

it("selects an open file and dismisses the sheet before closing a file", async () => {
  const onSelect = vi.fn(), onCloseTab = vi.fn();
  await act(async () => root.render(<MobileFileBar tabs={tabs} selected={tabId(tabs[0])} onSelect={onSelect} onNew={vi.fn()} onCloseTab={onCloseTab} />));
  await act(async () => container.querySelector<HTMLButtonElement>(".mobile-file-picker")!.click());
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe("One.md");
  await act(async () => container.querySelectorAll<HTMLButtonElement>(".mobile-file-choice")[1].click());
  expect(onSelect).toHaveBeenCalledWith(tabs[1]); expect(container.querySelector("dialog")).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>(".mobile-file-picker")!.click());
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close One.md"]')!.click());
  expect(onCloseTab).toHaveBeenCalledWith(tabs[0]); expect(container.querySelector("dialog")).toBeNull();
});

it("uses explicit mobile rename without committing on blur, preserves extensions, and reports errors", async () => {
  const onRename = vi.fn().mockRejectedValueOnce(new Error("Already exists")).mockResolvedValue(undefined), onClose = vi.fn();
  await act(async () => root.render(<RenameDialog compact root="demo" path="One.md" onRename={onRename} onClose={onClose} />));
  expect(container.querySelectorAll("input")).toHaveLength(1);
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Renamed");
    input.dispatchEvent(new Event("input", { bubbles: true })); input.blur();
  });
  expect(onRename).not.toHaveBeenCalled();
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(onRename).toHaveBeenCalledWith("Renamed.md"); expect(onClose).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Already exists");
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(onClose).toHaveBeenCalledOnce();
});

it("cancels mobile rename without saving and opens the dialog from the title", async () => {
  const onRename = vi.fn(), onClose = vi.fn(), onRequestRename = vi.fn();
  await act(async () => root.render(<FileTitle path="One.md" onRename={onRename} onRequestRename={onRequestRename} />));
  await act(async () => container.querySelector("button")!.click());
  expect(onRequestRename).toHaveBeenCalledOnce(); expect(container.querySelector("textarea")).toBeNull();
  await act(async () => root.render(<RenameDialog compact root="demo" path="One.md" onRename={onRename} onClose={onClose} />));
  await act(async () => container.querySelector('button[type="button"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(onClose).toHaveBeenCalledOnce(); expect(onRename).not.toHaveBeenCalled();
});

it("dismisses for blank note padding while preserving caret taps and formatting selection", () => {
  container.innerHTML = '<div contenteditable="true" tabindex="0"><p>Text</p></div><div class="format-toolbar"><button>Bold</button></div>';
  const editable = container.firstElementChild as HTMLElement;
  const preventDefault = vi.fn();
  editable.focus();
  const tap = (target: Element) => dismissKeyboardOutsideEditor({ target, preventDefault } as unknown as ReactPointerEvent<HTMLElement>);
  tap(editable.firstElementChild!); expect(document.activeElement).toBe(editable);
  tap(container.querySelector("button")!); expect(document.activeElement).toBe(editable);
  tap(editable); expect(document.activeElement).not.toBe(editable); expect(preventDefault).toHaveBeenCalledOnce();
});

it("enters focus from the file bar without changing the note or opening the file sheet", async () => {
  const onFocus = vi.fn(), onSelect = vi.fn(), onNew = vi.fn();
  await act(async () => root.render(<MobileFileBar tabs={tabs} selected={tabId(tabs[1])}
    onSelect={onSelect} onNew={onNew} viewControls={<MobileViewControls focused={false} galaxy onFocus={onFocus} onGalaxy={vi.fn()} />} onCloseTab={vi.fn()} />));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Enter focus mode"]')!.click());
  expect(onFocus).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
  expect(onNew).not.toHaveBeenCalled();
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.querySelector(".mobile-file-picker")?.getAttribute("aria-label")).toBe("Open files: Two.md");
});

it("keeps Galaxy toggling independent of focus and exposes an exit action", async () => {
  const onGalaxy = vi.fn(), onFocus = vi.fn();
  await act(async () => root.render(<MobileViewControls focused galaxy onFocus={onFocus} onGalaxy={onGalaxy} />));
  const galaxy = container.querySelector<HTMLButtonElement>('[aria-label="Galaxy mode"]')!;
  expect(galaxy.getAttribute("aria-pressed")).toBe("true");
  await act(async () => galaxy.click());
  expect(onGalaxy).toHaveBeenCalledOnce();
  expect(onFocus).not.toHaveBeenCalled();
  await act(async () => root.render(<MobileViewControls focused galaxy={false} onFocus={onFocus} onGalaxy={onGalaxy} />));
  expect(galaxy.getAttribute("aria-pressed")).toBe("false");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Exit focus mode"]')!.click());
  expect(onFocus).toHaveBeenCalledWith(false);
});
