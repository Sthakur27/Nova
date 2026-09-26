// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import SavedStatesPanel from "./SavedStatesPanel";
import { type SavedState } from "./savedStates";
const id = JSON.stringify(["cloud", "work.md"]);
const state: SavedState = { name: "Work", tabs: [{ root: "cloud", path: "work.md", pinned: true }], activePane: "main",
  layout: { kind: "pane", id: "main", tabs: [id], selected: id }, views: { [id]: { scrollTop: 800 } } };
it("saves to the first free shortcut and restores, updates, and deletes directly from a card", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onSave = vi.fn(() => true), onRestore = vi.fn(async () => {}), onDelete = vi.fn();
  const onReturn = vi.fn(async () => {});
  const slots = [state, null, ...Array(7).fill(null)];
  try {
    await act(async () => root.render(<SavedStatesPanel previousState={state} onReturn={onReturn} slots={slots} error="" onSave={onSave} onRestore={onRestore} onDelete={onDelete} />));
    expect(host.querySelector("dialog")).toBeNull();
    await act(async () => (host.querySelector('[aria-label="Return to previous state"]') as HTMLButtonElement).click());
    expect(onReturn).toHaveBeenCalledOnce();
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "  Work + personal  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onSave).toHaveBeenCalledWith(1, "Work + personal");
    expect(input.value).toBe("");
    await act(async () => (host.querySelector('[aria-label="Restore Work"]') as HTMLButtonElement).click());
    expect(onRestore).toHaveBeenCalledWith(0);
    await act(async () => (host.querySelector('[aria-label="Save over Work"]') as HTMLButtonElement).click());
    expect(onSave).not.toHaveBeenCalledWith(0, "Work", state);
    const confirm = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Confirm overwrite")!;
    await act(async () => confirm.click());
    expect(onSave).toHaveBeenCalledWith(0, "Work", state);
    await act(async () => (host.querySelector('[aria-label="Delete Work"]') as HTMLButtonElement).click());
    expect(onDelete).toHaveBeenCalledWith(0);
    await act(async () => root.render(<SavedStatesPanel slots={Array(9).fill(state)} error="Open the folder first." onSave={onSave} onRestore={onRestore} onDelete={onDelete} />));
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Open the folder first.");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("accepts a suggested name with Tab or saves it directly without overwriting a custom name", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onSave = vi.fn(() => true);
  try {
    await act(async () => root.render(<SavedStatesPanel slots={Array(9).fill(null)} suggestedName="Work + personal"
      error="" onSave={onSave} onRestore={async () => {}} onDelete={() => {}} />));
    const input = host.querySelector("input")!, button = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(input.placeholder).toBe("Work + personal");
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(onSave).toHaveBeenLastCalledWith(0, "Work + personal");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(input.value).toBe("");
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(tab));
    expect(input.value).toBe("Work + personal");
    expect(tab.defaultPrevented).toBe(false);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "My custom state");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(input.value).toBe("My custom state");
    await act(async () => button.click());
    expect(onSave).toHaveBeenLastCalledWith(0, "My custom state");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("cancels overwrites and reorders from the handle with keyboard or drag without restoring", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onSave = vi.fn(() => true), onReorder = vi.fn(), onRestore = vi.fn(async () => {});
  const second = { ...state, name: "Personal" };
  try {
    await act(async () => root.render(<SavedStatesPanel slots={[state, null, second, ...Array(6).fill(null)]}
      error="" onSave={onSave} onReorder={onReorder} onRestore={onRestore} onDelete={() => {}} />));
    await act(async () => (host.querySelector('[aria-label="Save over Work"]') as HTMLButtonElement).click());
    await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Cancel")!.click());
    expect(onSave).not.toHaveBeenCalled();
    const handle = host.querySelector('[aria-label="Reorder Personal"]') as HTMLButtonElement;
    await act(async () => handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(onReorder).toHaveBeenLastCalledWith(2, 0);
    onReorder.mockClear();
    const list = host.querySelector('.saved-states-list')!;
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 400));
    vi.spyOn(host.querySelector('[data-state-slot="0"]')!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
    vi.spyOn(host.querySelector('[data-state-slot="2"]')!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 200, 100));
    const event = (name: string, clientY: number) => {
      const result = new Event(name, { bubbles: true, cancelable: true });
      Object.defineProperties(result, { pointerId: { value: 1 }, isPrimary: { value: true }, button: { value: 0 }, pointerType: { value: "mouse" }, clientX: { value: 100 }, clientY: { value: clientY } });
      return result;
    };
    await act(async () => handle.dispatchEvent(event("pointerdown", 150)));
    await act(async () => window.dispatchEvent(event("pointermove", 30)));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await act(async () => window.dispatchEvent(event("pointerup", 30)));
    expect(onReorder).not.toHaveBeenCalled();
    const body = host.querySelector('[data-state-slot="2"] .saved-state-files')!;
    const save = host.querySelector('[aria-label="Save over Personal"]')!;
    await act(async () => save.dispatchEvent(event("pointerdown", 150)));
    await act(async () => window.dispatchEvent(event("pointermove", 30)));
    await act(async () => window.dispatchEvent(event("pointerup", 30)));
    expect(onReorder).not.toHaveBeenCalled();
    await act(async () => body.dispatchEvent(event("pointerdown", 150)));
    await act(async () => window.dispatchEvent(event("pointermove", 30)));
    await act(async () => window.dispatchEvent(event("pointerup", 30)));
    await act(async () => body.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(onReorder).toHaveBeenLastCalledWith(2, 0);
    expect(onRestore).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("renames with a modal, preserves the expected snapshot, and allows cancel or retry after a conflict", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onRename = vi.fn(), onSave = vi.fn(() => true);
  try {
    await act(async () => root.render(<SavedStatesPanel slots={[state]} error="" onSave={onSave}
      onRestore={async () => {}} onDelete={() => {}} onRename={onRename} />));
    const pencil = host.querySelector('[aria-label="Rename Work"]') as HTMLButtonElement;
    await act(async () => pencil.click());
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(onRename).not.toHaveBeenCalled();
    await act(async () => pencil.click());
    const input = host.querySelector("dialog input") as HTMLInputElement;
    expect(input.value).toBe("Work");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "  Writing  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    onRename.mockImplementationOnce(() => { throw new Error("State changed elsewhere"); });
    const submit = () => host.querySelector("dialog form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => { submit(); });
    expect(host.querySelector('dialog [role="alert"]')?.textContent).toBe("State changed elsewhere");
    await act(async () => { submit(); });
    expect(onRename).toHaveBeenLastCalledWith(0, "Writing", state);
    expect(host.querySelector("dialog")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
