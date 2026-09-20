// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openWorkspace } from "./storage";
import { useCloudSpaces } from "./useCloudSpaces";
vi.mock("@tauri-apps/api/core", () => ({invoke:vi.fn()}));
vi.mock("./storage", () => ({openWorkspace:vi.fn()}));

it("discovers automatically under StrictMode without losing the pending result", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(invoke).mockReset();
  let resolve!: (roots: string[]) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise(done => {resolve = done as typeof resolve;}));
  const space = {root:"mobile-sync/stable-id",name:"Notes",files:[]};
  vi.mocked(openWorkspace).mockResolvedValue(space);
  const apply = vi.fn();
  let state!: ReturnType<typeof useCloudSpaces>;
  function Harness({connected=true}) { state=useCloudSpaces(connected,true,apply); return null; }
  const root=createRoot(document.createElement("div"));
  try {
    await act(async()=>root.render(<StrictMode><Harness/></StrictMode>));
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async()=>resolve([space.root]));
    expect(apply).toHaveBeenCalledWith([space]);
    expect(state.loaded).toBe(true);
    expect(state.loading).toBe(false);
    await act(async()=>root.render(<StrictMode><Harness connected={false}/></StrictMode>));
    expect(state.loaded).toBe(false);
  } finally { await act(async()=>root.unmount()); }
});

it("does not expose a download that completes after disconnect", async () => {
  vi.mocked(invoke).mockReset();
  let resolve!: (roots: string[]) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise(done => {resolve = done as typeof resolve;}));
  const apply=vi.fn();
  function Harness({connected}: {connected:boolean}) { useCloudSpaces(connected,true,apply);return null; }
  const root=createRoot(document.createElement("div"));
  try {
    await act(async()=>root.render(<Harness connected/>));
    await act(async()=>root.render(<Harness connected={false}/>));
    await act(async()=>resolve([]));
    expect(apply).not.toHaveBeenCalled();
  } finally { await act(async()=>root.unmount()); }
});
