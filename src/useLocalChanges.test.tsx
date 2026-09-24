// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalChangeRetry } from "./localFileReload";
import { invoke } from "./resetLocalState";
import { useLocalChanges, type LocalWatch, type LocalChangeEvent } from "./useLocalChanges";
const { listen, unlisten } = vi.hoisted(() => ({ listen: vi.fn(), unlisten: vi.fn() }));
vi.mock("./platform", () => ({ desktop: true }));
vi.mock("./resetLocalState", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({listen}) }));
let listener: (event: {payload: LocalChangeEvent}) => void;
let generation = "";
let stamp = "original";
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); stamp = "original";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  listen.mockImplementation(async (_event, callback) => { listener = callback; return unlisten; });
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "watch_local_changes") { generation = (args as {generation: string}).generation; return {warnings: []}; }
    if (command === "local_path_stamps") return ((args as {paths: string[]}).paths).map(path => ({path, stamp, error: null}));
    return undefined;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tick = (ms = 100) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
function harness(initial: LocalWatch[] = [{root: "/notes", files: ["note.md"], directories: ["", "expanded"]}]) {
  let targets = initial, busy = false;
  const onFile = vi.fn(async () => {}), onDirectory = vi.fn(async () => {}), onError = vi.fn();
  function Harness() { useLocalChanges(true, {targets: () => targets, busy: () => busy, onFile, onDirectory, onError}); return null; }
  const root = createRoot(document.createElement("div"));
  return {root, onFile, onDirectory, onError,
    mount: async () => { await act(async () => root.render(<Harness/>)); await tick(0); },
    targets: async (next: LocalWatch[]) => { targets = next; await act(async () => root.render(<Harness/>)); await tick(0); },
    busy: (value: boolean) => { busy = value; },
    event: (changes: LocalWatch[] = [{root: "/notes", files: ["note.md"], directories: []}], extra: Partial<LocalChangeEvent> = {}) =>
      act(async () => listener({payload: {generation, changes, rescan: false, ...extra}})),
    close: () => act(async () => root.unmount()),
  };
}
it("does no idle filesystem work and coalesces only affected paths, even with unchanged timestamps", async () => {
  const h = harness(); await h.mount();
  try {
    expect(listen).toHaveBeenCalledWith("nova:local-changes", expect.any(Function));
    expect(h.onFile).toHaveBeenCalledTimes(1);
    expect(h.onDirectory).not.toHaveBeenCalled();
    const calls = vi.mocked(invoke).mock.calls.length;
    await tick(60_000);
    expect(invoke).toHaveBeenCalledTimes(calls);
    for (let i=0;i<100;i++) await h.event([{root: "/notes", files: ["note.md", "unrelated.md"], directories: []}]);
    await tick();
    expect(h.onFile).toHaveBeenCalledTimes(2);
    expect(h.onDirectory).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenLastCalledWith("local_path_stamps", {root: "/notes", paths: ["note.md"]});
    await h.event([{root: "/notes", files: [], directories: ["expanded"]}]); await tick();
    expect(h.onDirectory).toHaveBeenCalledExactlyOnceWith("/notes", "expanded");
  } finally { await h.close(); }
});
it("defers queued changes during saves and hidden windows without losing invalidations", async () => {
  const h = harness(); await h.mount();
  try {
    h.busy(true); await h.event(); await tick(1000);
    expect(h.onFile).toHaveBeenCalledTimes(1);
    h.busy(false); await tick(250);
    expect(h.onFile).toHaveBeenCalledTimes(2);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await h.event(); await tick(30_000);
    expect(h.onFile).toHaveBeenCalledTimes(2);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    await act(async () => document.dispatchEvent(new Event("visibilitychange"))); await tick();
    expect(h.onFile).toHaveBeenCalledTimes(3);
    expect(h.onDirectory).toHaveBeenCalledWith("/notes", "");
  } finally { await h.close(); }
});
it("reconciles on focus and watcher overflow, with retry only for pending work", async () => {
  const h = harness(); await h.mount();
  try {
    h.onFile.mockRejectedValueOnce(new LocalChangeRetry("save started"));
    await h.event(); await tick();
    expect(h.onError).not.toHaveBeenCalled();
    await tick(250);
    expect(h.onFile).toHaveBeenCalledTimes(3);
    await h.event([], {rescan: true, error: "Watcher overflow; reconciling."}); await tick();
    expect(h.onError).toHaveBeenCalledExactlyOnceWith("Watcher overflow; reconciling.");
    expect(h.onDirectory).toHaveBeenCalledTimes(2);
    await act(async () => window.dispatchEvent(new Event("focus"))); await tick();
    expect(h.onDirectory).toHaveBeenCalledTimes(4);
    const calls = vi.mocked(invoke).mock.calls.length;
    await tick(60_000); expect(invoke).toHaveBeenCalledTimes(calls);
  } finally { await h.close(); }
});
it("updates subscriptions when targets change and ignores old generations and closed paths", async () => {
  const h = harness(); await h.mount(); const old = generation;
  try {
    await h.targets([{root: "/notes", files: ["other.md"], directories: [""]}]);
    expect(generation).not.toBe(old);
    const count = h.onFile.mock.calls.length;
    await h.event([{root: "/notes", files: ["note.md"], directories: []}], {generation: old}); await tick();
    expect(h.onFile).toHaveBeenCalledTimes(count);
    await h.event([{root: "/notes", files: ["note.md"], directories: []}]); await tick();
    expect(h.onFile).toHaveBeenCalledTimes(count);
  } finally { await h.close(); }
  expect(unlisten).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenCalledWith("unwatch_local_changes", {generation});
});
it("reports persistent read errors with bounded retries and suppresses repeated deletion notices", async () => {
  const h = harness(); await h.mount();
  try {
    h.onFile.mockRejectedValue(new Error("permission denied"));
    await h.event(); await tick(2000);
    expect(h.onError).toHaveBeenCalledTimes(1);
    const count = h.onFile.mock.calls.length;
    await tick(60_000); expect(h.onFile).toHaveBeenCalledTimes(count);
    h.onFile.mockResolvedValue();
    vi.mocked(invoke).mockImplementation(async (command, args) => command === "local_path_stamps"
      ? ((args as {paths: string[]}).paths).map(path => ({path, stamp: null, error: null})) : {warnings: []});
    await h.event(); await tick(); await h.event(); await tick();
    expect(h.onFile).toHaveBeenCalledTimes(count+1);
    expect(h.onFile).toHaveBeenLastCalledWith("/notes", "note.md", "File was deleted or moved.");
  } finally { await h.close(); }
});
