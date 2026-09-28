// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import CloudSetup from "./CloudSetup";

it("offers Cloud sign-in and setup retry without a local-folder prerequisite", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  const connect = vi.fn(), retry = vi.fn();
  const drive = { status: { connected: false, configured: true, email: null }, busy: false, checking: false, error: "", supported: true, connect, disconnect: vi.fn(), cancel: vi.fn() };
  try {
    await act(async () => root.render(<CloudSetup embedded drive={drive} loading={false} error="" retry={retry}/>));
    expect(host.querySelector("main")).toBeNull();
    expect(host.textContent).not.toContain("Open Folder");
    await act(async () => host.querySelector("button")!.click());
    expect(connect).toHaveBeenCalledOnce();
    await act(async () => root.render(<CloudSetup embedded drive={{ ...drive, status: { ...drive.status, connected: true } }} loading={false} error="Network unavailable" retry={retry}/>));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Network unavailable");
    await act(async () => host.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("lets a saved expired account reconnect from the mobile setup gate", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"), root = createRoot(host);
  const connect = vi.fn().mockResolvedValue(true), retry = vi.fn(), cancel = vi.fn();
  const props = {drive:{status:{connected:true, configured:true}, supported:true, connect, cancel}, loading:false, error:"Google access expired", retry} as unknown as ComponentProps<typeof CloudSetup>;
  const button = (label:string) => [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
  try {
    await act(async()=>root.render(<CloudSetup {...props}/>));
    await act(async()=>button("Reconnect Google Drive").click());
    expect(connect).toHaveBeenCalledOnce(); expect(retry).toHaveBeenCalledOnce();
    retry.mockClear(); connect.mockResolvedValue(false);
    await act(async()=>button("Reconnect Google Drive").click());
    expect(retry).not.toHaveBeenCalled();
    await act(async()=>root.render(<CloudSetup {...props} drive={{...props.drive, busy:true}}/>));
    expect(button("Waiting for Google…").disabled).toBe(true);
    await act(async()=>button("Cancel sign-in").click());
    expect(cancel).toHaveBeenCalledOnce();
  } finally { await act(async()=>root.unmount()); }
});
