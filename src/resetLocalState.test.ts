// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { invoke as nativeInvoke } from "@tauri-apps/api/core";
import { invoke, resetLocalState, localResetInProgress } from "./resetLocalState";
vi.mock("@tauri-apps/api/core", () => ({invoke:vi.fn()}));
it("drains in-flight work, blocks late saves/uploads, and resumes after a failed download", async () => {
  let finishSave!: () => void;
  vi.mocked(nativeInvoke).mockImplementation(command => command === "save_note"
    ? new Promise(resolve => { finishSave = () => resolve(undefined); })
    : Promise.reject(new Error("Offline")));
  const save = invoke("save_note");
  const reset = resetLocalState();
  const failed = expect(reset).rejects.toThrow("Offline");
  expect(localResetInProgress()).toBe(true);
  await expect(invoke("save_draft")).rejects.toThrow("being reset");
  await expect(invoke("drive_upload")).rejects.toThrow("being reset");
  expect(nativeInvoke).toHaveBeenCalledTimes(1);
  finishSave(); await save; await failed;
  expect(nativeInvoke).toHaveBeenLastCalledWith("cloud_reset_local");
  expect(localResetInProgress()).toBe(false);
  vi.mocked(nativeInvoke).mockResolvedValue(undefined);
  await invoke("save_note");
  expect(nativeInvoke).toHaveBeenLastCalledWith("save_note", undefined);
});
it("clears legacy drafts after success, reloads, and keeps old-session writes blocked", async () => {
  const reload = vi.fn();
  vi.stubGlobal("window", {location:{reload}});
  localStorage.setItem("nova-draft-v1:old", "stale draft");
  localStorage.setItem("nova-explorer-v1", "stale tabs");
  localStorage.setItem("appearance", "keep");
  vi.mocked(nativeInvoke).mockResolvedValue(undefined);
  try {
    await resetLocalState();
    expect(reload).toHaveBeenCalledOnce();
    expect(localStorage.getItem("nova-draft-v1:old")).toBeNull();
    expect(localStorage.getItem("nova-explorer-v1")).toBeNull();
    expect(localStorage.getItem("appearance")).toBe("keep");
    await expect(invoke("save_note")).rejects.toThrow("being reset");
  } finally { vi.unstubAllGlobals(); }
});
