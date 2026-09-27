// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openWorkspace } from "./storage";
import { useCloudSpaces } from "./useCloudSpaces";
import { useDriveUploads } from "./useDriveUploads";
vi.mock("./platform", () => ({driveSupported:true}));
vi.mock("@tauri-apps/api/event", () => ({listen:vi.fn(async () => () => {})}));
vi.mock("@tauri-apps/api/core", () => ({invoke:vi.fn()}));
vi.mock("./storage", () => ({openWorkspace:vi.fn()}));

it.each(["C:/Notes", "mobile-sync/stable-id"])("refreshes existing space contents through the sync scheduler for %s", async workspace => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(invoke).mockReset();
  let remoteHasNote = false;
  let downloaded = false;
  const space = {root:workspace,name:"Notes",files:[]};
  const updated = {...space,files:[{path:"New from another device.md",name:"New from another device.md",size:20}]};
  vi.mocked(openWorkspace).mockImplementation(async () => downloaded ? updated : space);
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "cloud_setup") return [workspace];
    if (command === "drive_upload") {
      downloaded = remoteHasNote;
      return {items:[],changes:downloaded ? [{path:"New from another device.md",previousPath:""}] : []};
    }
    throw new Error(`Unexpected command ${command}`);
  });
  const apply = vi.fn();
  let cloud!: ReturnType<typeof useCloudSpaces>;
  function Harness() {
    const uploads=useDriveUploads(true);
    uploads.configure({roots:[],protectedPaths:()=>["draft.md"],onComplete:async()=>{}});
    cloud=useCloudSpaces(true,true,apply,uploads.upload);
    return null;
  }
  const root=createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness />));
    expect(apply).toHaveBeenLastCalledWith([space]);
    remoteHasNote=true;
    await act(async () => { await cloud.refresh(); });
    expect(invoke).toHaveBeenLastCalledWith("drive_upload",{root:workspace,protectedPaths:["draft.md"]});
    expect(apply).toHaveBeenLastCalledWith([updated]);
    expect(cloud.loading).toBe(false);
  } finally { await act(async () => root.unmount()); }
});

it("discovers automatically under StrictMode without losing the pending result", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(invoke).mockReset();
  let resolve!: (roots: string[]) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise(done => {resolve = done as typeof resolve;}));
  const space = {root:"mobile-sync/stable-id",name:"Notes",files:[]};
  vi.mocked(openWorkspace).mockResolvedValue(space);
  const apply = vi.fn();
  let state!: ReturnType<typeof useCloudSpaces>;
  const sync = vi.fn(async () => {});
  function Harness({connected=true}) { state=useCloudSpaces(connected,true,apply,sync); return null; }
  const root=createRoot(document.createElement("div"));
  try {
    await act(async()=>root.render(<StrictMode><Harness/></StrictMode>));
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async()=>resolve([space.root]));
    expect(apply).toHaveBeenCalledWith([space]);
    expect(state.loaded).toBe(true);
    expect(state.loading).toBe(false);
    expect(sync).toHaveBeenCalledExactlyOnceWith(space.root);
    await act(async()=>root.render(<StrictMode><Harness connected={false}/></StrictMode>));
    expect(state.loaded).toBe(false);
  } finally { await act(async()=>root.unmount()); }
});

it("does not expose a download that completes after disconnect", async () => {
  vi.mocked(invoke).mockReset();
  let resolve!: (roots: string[]) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise(done => {resolve = done as typeof resolve;}));
  const apply=vi.fn();
  const sync = vi.fn(async () => {});
  function Harness({connected}: {connected:boolean}) { useCloudSpaces(connected,true,apply,sync);return null; }
  const root=createRoot(document.createElement("div"));
  try {
    await act(async()=>root.render(<Harness connected/>));
    await act(async()=>root.render(<Harness connected={false}/>));
    await act(async()=>resolve(["mobile-sync/stable-id"]));
    expect(apply).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  } finally { await act(async()=>root.unmount()); }
});
