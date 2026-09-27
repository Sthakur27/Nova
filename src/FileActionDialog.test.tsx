// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FileActionDialog from "./FileActionDialog";

it.each(["folder", "move"] as const)("submits %s destinations and keeps failures editable", async action => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const show = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const onSubmit = vi.fn().mockRejectedValueOnce(new Error("Destination unavailable")).mockResolvedValue(undefined);
  const onClose = vi.fn();
  try {
    await act(async () => root.render(<FileActionDialog folder={{root:"/cloud",name:"Notes",files:[],directories:["Empty"]}}
      path={action === "move" ? "note.md" : ""} action={action} onSubmit={onSubmit} onClose={onClose}/>));
    expect(host.querySelector("option")?.value).toBe("Empty");
    const input = host.querySelector("input")!;
    if (action === "folder") {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Projects/Research");
        input.dispatchEvent(new Event("input", {bubbles:true}));
      });
    }
    const submit = () => host.querySelector("form")!.dispatchEvent(new Event("submit", {bubbles:true,cancelable:true}));
    await act(async () => { submit(); });
    expect(onSubmit).toHaveBeenLastCalledWith(action === "folder" ? "Projects/Research" : "");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Destination unavailable");
    expect(onClose).not.toHaveBeenCalled();
    expect(input.disabled).toBe(false);
    await act(async () => { submit(); });
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove(); HTMLDialogElement.prototype.showModal = show; HTMLDialogElement.prototype.close = close; vi.unstubAllGlobals();
  }
});
