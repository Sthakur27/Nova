// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { useAppUpdate } from "./useAppUpdate";
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
let state!: ReturnType<typeof useAppUpdate>;
let root: ReturnType<typeof createRoot>;
const prepare = vi.fn(), release = vi.fn();
const update = { version: "0.2.20", close: vi.fn(), download: vi.fn(), install: vi.fn() };
async function mount(enabled = true) {
  function Harness() { state = useAppUpdate(enabled, prepare, release); return null; }
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
}
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.resetAllMocks();
  vi.mocked(check).mockResolvedValue(null);
  vi.mocked(invoke).mockResolvedValue(undefined);
  prepare.mockResolvedValue(undefined);
  update.close.mockResolvedValue(undefined);
  update.download.mockResolvedValue(undefined);
  update.install.mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
it("checks on launch without periodic polling", async () => {
  await mount();
  expect(check).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(state.phase).toBe("current");
  await act(async () => vi.advanceTimersByTimeAsync(3600000));
  expect(check).toHaveBeenCalledTimes(1);
});
it("never checks outside enabled desktop environments", async () => {
  await mount(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(3600000 * 2); await state.checkNow(); });
  expect(check).not.toHaveBeenCalled();
});
it("deduplicates checks and retries network errors", async () => {
  await mount();
  let fail!: (error: Error) => void;
  vi.mocked(check).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  let pending!: Promise<void>;
  await act(async () => { pending = state.checkNow(); void state.checkNow(); });
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => { fail(new Error("offline")); await pending; });
  expect(state.error).toContain("offline");
  await act(async () => state.checkNow());
  expect(state.error).toBe("");
  expect(state.phase).toBe("current");
});
it("downloads without installing, preserves drafts before installation, and restarts", async () => {
  const order: string[] = [];
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  prepare.mockImplementation(async () => { order.push("preserve"); });
  vi.mocked(invoke).mockImplementation(async command => { order.push(command); });
  update.install.mockImplementation(async () => { order.push("install"); });
  await mount();
  await act(async () => state.checkNow());
  expect(state.phase).toBe("available");
  update.download.mockImplementation(async callback => {
    callback({ event: "Started", data: { contentLength: 100 } });
    callback({ event: "Progress", data: { chunkLength: 50 } });
  });
  await act(async () => state.download());
  expect(state.progress).toBe(50);
  expect(state.phase).toBe("ready");
  expect(update.install).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(3600000));
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => state.restart());
  expect(order).toEqual(["preserve", "begin_update", "install", "restart_after_update"]);
});
it("blocks installation if preservation fails and allows retry", async () => {
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  await mount();
  await act(async () => state.checkNow());
  update.download.mockRejectedValueOnce(new Error("network"));
  await act(async () => state.download());
  expect(state.phase).toBe("available");
  await act(async () => state.download());
  prepare.mockRejectedValueOnce(new Error("draft disk full"));
  await act(async () => state.restart());
  expect(update.install).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  expect(state.phase).toBe("ready");
  expect(state.error).toContain("draft disk full");
});
it("releases the lock after an installer failure and permits retry", async () => {
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  await mount();
  await act(async () => state.checkNow());
  await act(async () => state.download());
  update.install.mockRejectedValueOnce(new Error("permission denied"));
  await act(async () => state.restart());
  expect(invoke).toHaveBeenCalledWith("cancel_update");
  expect(release).toHaveBeenCalledOnce();
  expect(state.phase).toBe("ready");
  await act(async () => state.restart());
  expect(invoke).toHaveBeenCalledWith("restart_after_update");
});
it("does not install when another window blocks the native update lock", async () => {
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  await mount();
  await act(async () => state.checkNow());
  await act(async () => state.download());
  vi.mocked(invoke).mockRejectedValueOnce(new Error("Close other Nova windows"));
  await act(async () => state.restart());
  expect(update.install).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
  expect(state.error).toContain("Close other Nova windows");
});
it("does not reinstall if only relaunch failed", async () => {
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  await mount();
  await act(async () => state.checkNow());
  await act(async () => state.download());
  vi.mocked(invoke).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("relaunch failed"));
  await act(async () => state.restart());
  await act(async () => state.restart());
  expect(update.install).toHaveBeenCalledOnce();
});
it("finds a newly published update when Settings is reopened", async () => {
  const { default: AppUpdate } = await import("./AppUpdate");
  function Harness({ settings }: { settings: boolean }) {
    state = useAppUpdate(true, prepare, release);
    return settings ? <AppUpdate updater={state} /> : null;
  }
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness settings={false} />));
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  await act(async () => root.render(<Harness settings />));
  expect(check).toHaveBeenCalledTimes(2);
  expect(state.phase).toBe("current");
  await act(async () => root.render(<Harness settings={false} />));
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  await act(async () => root.render(<Harness settings />));
  expect(check).toHaveBeenCalledTimes(3);
  expect(state.phase).toBe("available");
  expect(state.version).toBe(update.version);
  await act(async () => root.render(<Harness settings />));
  expect(check).toHaveBeenCalledTimes(3);
});
it("preserves an active download and downloaded update when checks are requested", async () => {
  vi.mocked(check).mockResolvedValue(update as unknown as Update);
  await mount();
  await act(async () => state.checkNow());
  let finish!: () => void;
  update.download.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = state.download(); });
  await act(async () => state.checkNow());
  expect(state.phase).toBe("downloading");
  await act(async () => { finish(); await pending; });
  await act(async () => state.checkNow());
  expect(state.phase).toBe("ready");
  expect(check).toHaveBeenCalledTimes(1);
  expect(update.close).not.toHaveBeenCalled();
});
