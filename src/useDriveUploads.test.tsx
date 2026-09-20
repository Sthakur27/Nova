// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useDriveUploads, type DriveUploads } from "./useDriveUploads";
vi.mock("./platform", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
it("reports uploads and failures, skips demo files, and stops after disconnect", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  let uploads!: DriveUploads;
  function Harness({connected}: {connected:boolean}) { uploads = useDriveUploads(connected); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness connected />));
    vi.mocked(invoke).mockResolvedValueOnce({root:"/notes",folderUrl:"https://drive.google.com/drive/folders/test",items:[{path:"a.txt",state:"uploaded",message:"Saved file is up to date in Drive."}]});
    await act(async () => { await uploads.upload("/notes"); });
    expect(uploads.items["/notes\na.txt"].state).toBe("uploaded");
    expect(uploads.activeRoot).toBeNull();
    vi.mocked(invoke).mockRejectedValueOnce("Google Drive is offline.");
    await act(async () => { await uploads.upload("/notes"); });
    expect(uploads.errors["/notes"]).toContain("offline");
    const count = vi.mocked(invoke).mock.calls.length;
    await act(async () => { await uploads.upload("demo"); });
    await act(async () => root.render(<Harness connected={false} />));
    await act(async () => { await uploads.upload("/notes"); });
    expect(vi.mocked(invoke).mock.calls.length).toBe(count);
    expect(uploads.items).toEqual({});
  } finally { await act(async () => root.unmount()); }
});
it("polls selected workspaces, protects local edits, applies downloads and stops when disconnected", async () => {
  vi.useFakeTimers(); vi.mocked(invoke).mockReset();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const onComplete=vi.fn(async()=>{});
  function Harness({connected}: {connected:boolean}) {
    const uploads=useDriveUploads(connected);
    uploads.configure({roots:["/notes"],protectedPaths:()=>["draft.txt"],onComplete});
    return null;
  }
  const root=createRoot(document.createElement("div"));
  try {
    vi.mocked(invoke).mockResolvedValue({root:"/notes",folderUrl:"",items:[],changes:[{path:"renamed.txt",previousPath:"old.txt"}]});
    await act(async()=>root.render(<Harness connected/>));
    await act(async()=>vi.advanceTimersByTimeAsync(2500));
    expect(invoke).toHaveBeenCalledWith("drive_upload",{root:"/notes",protectedPaths:["draft.txt"]});
    expect(onComplete).toHaveBeenCalledWith("/notes",[{path:"renamed.txt",previousPath:"old.txt"}]);
    await act(async()=>vi.advanceTimersByTimeAsync(60000));
    expect(invoke).toHaveBeenCalledTimes(2);
    await act(async()=>root.render(<Harness connected={false}/>));
    await act(async()=>vi.advanceTimersByTimeAsync(60000));
    expect(invoke).toHaveBeenCalledTimes(2);
  } finally { await act(async()=>root.unmount());vi.useRealTimers(); }
});
