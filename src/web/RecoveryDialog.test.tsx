// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import RecoveryDialog from "./RecoveryDialog";
import { exportText } from "./NoteEditor";
import type { WebNote } from "./store";
vi.mock("./NoteEditor", () => ({ exportText: vi.fn() }));

it("exports exact recovery text, confirms deletion, reports errors, and dismisses with focus restored", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const show = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const host = document.createElement("div"), trigger = document.createElement("button");
  document.body.append(trigger, host); trigger.focus();
  const root = createRoot(host);
  const copies = [{ name: "Note.md", text: "older text" }, { name: "Note.md", text: "another version" }];
  const remove = vi.fn< (index: number) => Promise<void> >().mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValue(undefined);
  function Harness() {
    const [recovery, setRecovery] = useState(copies), [open, setOpen] = useState(true);
    return open ? <RecoveryDialog note={{ name: "Note.md", recovery } as WebNote} onClose={() => setOpen(false)} onDelete={async index => {
      await remove(index); setRecovery(old => old.filter((_, position) => position !== index));
    }}/> : null;
  }
  const click = async (label: string) => act(async () => {
    Array.from(host.querySelectorAll("button")).find(button => button.textContent === label)!.click();
  });
  try {
    await act(async () => root.render(<Harness/>));
    await click("Export recovery copy 2");
    expect(exportText).toHaveBeenCalledWith("Recovered Note.md", "another version");
    await click("Delete recovery copy 1");
    expect(remove).not.toHaveBeenCalled();
    await click("Cancel");
    expect(host.textContent).not.toContain("This cannot be undone");
    await click("Delete recovery copy 1"); await click("Delete permanently");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Storage unavailable");
    expect(host.querySelectorAll("li")).toHaveLength(2);
    await click("Delete permanently");
    expect(host.querySelectorAll("li")).toHaveLength(1);
    await click("Delete recovery copy 1"); await click("Delete permanently");
    expect(host.textContent).toContain("No recovery copies remain");
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(host.querySelector("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount()); host.remove(); trigger.remove();
    HTMLDialogElement.prototype.showModal = show; HTMLDialogElement.prototype.close = close; vi.unstubAllGlobals();
  }
});
