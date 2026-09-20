// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import DriveRestore from "./DriveRestore";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openWorkspace } from "./storage";
vi.mock("@tauri-apps/api/core", () => ({invoke:vi.fn()}));
vi.mock("@tauri-apps/plugin-dialog", () => ({open:vi.fn()}));
vi.mock("./storage", () => ({openWorkspace:vi.fn()}));
it("requires a chosen destination and opens the downloaded workspace", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host=document.createElement("div"),root=createRoot(host),onRestored=vi.fn();
  document.body.append(host);
  const button=(label:string)=>[...host.querySelectorAll('button')].find(item=>item.textContent===label)!;
  try {
    vi.mocked(invoke).mockResolvedValueOnce([{id:"remote-id",name:"Work notes"}]);
    await act(async()=>root.render(<DriveRestore disabled={false} onRestored={onRestored}/>));
    await act(async()=>button("Bring notes to this device").click());
    expect(button("Download & open workspace").disabled).toBe(true);
    vi.mocked(open).mockResolvedValueOnce(null);
    await act(async()=>button("Choose a local folder…").click());
    expect(button("Download & open workspace").disabled).toBe(true);
    vi.mocked(open).mockResolvedValueOnce("/chosen-parent");
    await act(async()=>button("Choose a local folder…").click());
    vi.mocked(invoke).mockResolvedValueOnce("/chosen-parent/Work notes - new");
    await act(async()=>button("Download & open workspace").click());
    expect(openWorkspace).toHaveBeenCalledWith("/chosen-parent");
    expect(invoke).toHaveBeenLastCalledWith("drive_restore",{parent:"/chosen-parent",workspaceId:"remote-id"});
    expect(onRestored).toHaveBeenCalledWith("/chosen-parent/Work notes - new");
    expect(host.textContent).toContain("Downloaded to /chosen-parent/Work notes - new");
  } finally { await act(async()=>root.unmount()); host.remove(); }
});
