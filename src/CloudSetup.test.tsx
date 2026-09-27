// @vitest-environment jsdom
import { act } from "react";
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
