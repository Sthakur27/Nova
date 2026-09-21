// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useDriveUploads, type DriveUploads } from "./useDriveUploads";
vi.mock("./platform", () => ({ driveSupported: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
it("keeps untouched notes local and replaces their status after the first upload", async () => {
  vi.mocked(invoke).mockReset();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  let uploads!: DriveUploads;
  function Harness() { uploads = useDriveUploads(true); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness />));
    vi.mocked(invoke).mockResolvedValueOnce({root:"/notes",folderUrl:"",uploaded:false,items:[
      {path:"Untitled.txt",state:"local",message:"Saved on this device · Edit or rename to sync"},
    ]});
    await act(async () => { await uploads.upload("/notes"); });
    expect(uploads.items["/notes\nUntitled.txt"].state).toBe("local");
    expect(uploads.errors["/notes"]).toBeFalsy();
    expect(uploads.transferringRoot).toBeNull();
    await act(async () => { uploads.schedule("/notes"); });
    expect(uploads.items["/notes\nUntitled.txt"]).toBeUndefined();
    vi.mocked(invoke).mockResolvedValueOnce({root:"/notes",folderUrl:"",uploaded:true,items:[
      {path:"Untitled.txt",state:"uploaded",message:"Uploaded changes to Google Drive."},
    ]});
    await act(async () => { await uploads.upload("/notes"); });
    expect(uploads.items["/notes\nUntitled.txt"].state).toBe("uploaded");
    expect(uploads.pending["/notes"]).toBe(false);
  } finally { await act(async () => root.unmount()); }
});
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
it("waits while hidden and checks immediately when returning to the foreground", async () => {
  vi.useFakeTimers(); vi.mocked(invoke).mockReset();
  const visibility = vi.spyOn(document, "visibilityState", "get");
  visibility.mockReturnValue("hidden");
  vi.mocked(invoke).mockResolvedValue({root:"mobile",folderUrl:"",items:[]});
  function Harness() {
    const uploads = useDriveUploads(true);
    uploads.configure({roots:["mobile"],protectedPaths:()=>[],onComplete:async()=>{}});
    return null;
  }
  const root=createRoot(document.createElement("div"));
  try {
    await act(async()=>root.render(<Harness/>));
    await act(async()=>vi.advanceTimersByTimeAsync(62500));
    expect(invoke).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async()=>{document.dispatchEvent(new Event("visibilitychange"));});
    expect(invoke).toHaveBeenCalledWith("drive_upload",{root:"mobile",protectedPaths:[]});
  } finally { await act(async()=>root.unmount());visibility.mockRestore();vi.useRealTimers(); }
});
it("checks only the focused file every five seconds and pauses for blur, drafts, local tabs and disconnect", async () => {
  vi.useFakeTimers(); vi.mocked(invoke).mockReset();
  const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue({root:"/notes",folderUrl:"",items:[],changes:[]});
  let selected: {root:string;path:string} | null = {root:"/notes",path:"a.txt"};
  let protectedPaths: string[] = [];
  function Harness({connected}: {connected:boolean}) {
    const uploads = useDriveUploads(connected);
    uploads.configure({roots:["/notes"],focusedFile:()=>selected,protectedPaths:()=>protectedPaths,onComplete:async()=>{}});
    return null;
  }
  const root=createRoot(document.createElement("div"));
  try {
    await act(async()=>root.render(<Harness connected/>));
    await act(async()=>vi.advanceTimersByTimeAsync(2500));
    vi.mocked(invoke).mockClear();
    await act(async()=>vi.advanceTimersByTimeAsync(2500));
    expect(invoke).toHaveBeenLastCalledWith("drive_upload",{root:"/notes",onlyPath:"a.txt",protectedPaths:[]});
    selected={root:"/notes",path:"b.txt"};
    await act(async()=>vi.advanceTimersByTimeAsync(5000));
    expect(invoke).toHaveBeenLastCalledWith("drive_upload",{root:"/notes",onlyPath:"b.txt",protectedPaths:[]});
    focus.mockReturnValue(false);
    await act(async()=>vi.advanceTimersByTimeAsync(5000));
    focus.mockReturnValue(true); protectedPaths=["b.txt"];
    await act(async()=>vi.advanceTimersByTimeAsync(5000));
    protectedPaths=[];selected=null;
    await act(async()=>vi.advanceTimersByTimeAsync(5000));
    expect(invoke).toHaveBeenCalledTimes(2);
    await act(async()=>root.render(<Harness connected={false}/>));
    selected={root:"/notes",path:"a.txt"};
    await act(async()=>vi.advanceTimersByTimeAsync(5000));
    expect(invoke).toHaveBeenCalledTimes(2);
  } finally { await act(async()=>root.unmount());focus.mockRestore();vi.useRealTimers(); }
});

it("retains the last sync time while new changes wait, fail, or arrive during an upload", async () => {
  vi.useFakeTimers(); vi.mocked(invoke).mockReset();
  let uploads!: DriveUploads;
  let protectedPaths: string[] = [];
  function Harness() {
    uploads = useDriveUploads(true);
    uploads.configure({roots:[],protectedPaths:()=>protectedPaths,onComplete:async()=>{}});
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const report = {root:"/notes",folderUrl:"",items:[]};
  try {
    await act(async()=>root.render(<Harness/>));
    vi.mocked(invoke).mockResolvedValue(report);
    await act(async()=>{await uploads.upload("/notes");});
    const firstSync = uploads.lastSyncedAt["/notes"];
    expect(firstSync).toBeGreaterThan(0);
    await act(async()=>{uploads.schedule("/notes");});
    expect(uploads.pending["/notes"]).toBe(true);
    expect(uploads.lastSyncedAt["/notes"]).toBe(firstSync);
    vi.mocked(invoke).mockRejectedValueOnce("Offline");
    await act(async()=>{await uploads.upload("/notes");});
    expect(uploads.pending["/notes"]).toBe(true);
    expect(uploads.lastSyncedAt["/notes"]).toBe(firstSync);
    let finish!: (value: typeof report) => void;
    vi.mocked(invoke).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    let task!: Promise<void>;
    await act(async()=>{task=uploads.upload("/notes");});
    await act(async()=>{uploads.schedule("/notes"); finish(report); await task;});
    expect(uploads.pending["/notes"]).toBe(true);
    expect(uploads.completed["/notes"]).toBe("");
    protectedPaths = ["draft.txt"];
    await act(async()=>{await uploads.upload("/notes");});
    expect(uploads.pending["/notes"]).toBe(true);
    expect(uploads.lastSyncedAt["/notes"]).toBe(firstSync);
    protectedPaths = [];
    vi.setSystemTime(Date.now() + 1000);
    vi.mocked(invoke).mockResolvedValueOnce({...report,uploaded:true});
    await act(async()=>{await uploads.upload("/notes");});
    expect(uploads.pending["/notes"]).toBe(false);
    expect(uploads.lastSyncedAt["/notes"]).toBeGreaterThan(firstSync);
  } finally { await act(async()=>root.unmount()); vi.useRealTimers(); }
});

it("keeps no-change polls silent and reports activity only for real transfers", async () => {
  vi.useFakeTimers(); vi.mocked(invoke).mockReset();
  let uploads!: DriveUploads;
  function Harness() { uploads = useDriveUploads(true); return null; }
  const root = createRoot(document.createElement("div"));
  const report = {root:"/notes",folderUrl:"",items:[]};
  try {
    await act(async()=>root.render(<Harness/>));
    const progress = vi.mocked(listen).mock.calls.at(-1)![1];
    vi.mocked(invoke).mockResolvedValue(report);
    await act(async()=>{await uploads.upload("/notes");});
    const firstSync = uploads.lastSyncedAt["/notes"];
    vi.setSystemTime(Date.now() + 5000);
    let finish!: (value: typeof report) => void;
    vi.mocked(invoke).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    let task!: Promise<void>;
    await act(async()=>{task=uploads.upload("/notes");});
    expect(uploads.activeRoot).toBe("/notes");
    expect(uploads.transferringRoot).toBeNull();
    await act(async()=>{finish(report); await task;});
    expect(uploads.lastSyncedAt["/notes"]).toBe(firstSync);
    vi.mocked(invoke).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    await act(async()=>{task=uploads.upload("/notes");});
    await act(async()=>{progress({event:"drive-upload-progress",id:1,payload:{root:"/notes",path:"a.txt",state:"uploading",message:"Receiving changes…"}});});
    expect(uploads.transferringRoot).toBe("/notes");
    await act(async()=>{finish({...report,changes:[{path:"a.txt",previousPath:"a.txt"}]} as typeof report); await task;});
    expect(uploads.transferringRoot).toBeNull();
    expect(uploads.lastSyncedAt["/notes"]).toBeGreaterThan(firstSync);
  } finally { await act(async()=>root.unmount()); vi.useRealTimers(); }
});
