// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LocalChangeRetry } from "./localFileReload";
import { invoke } from "./resetLocalState";
import { useLocalChanges, type LocalWatch } from "./useLocalChanges";
vi.mock("./platform", () => ({ desktop: true }));
vi.mock("./resetLocalState", () => ({ invoke: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it("checks only specified paths, reloads changes once, retries failures, and skips busy work", async () => {
  vi.useFakeTimers();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  let stamp = "one", busy = false;
  let targets: LocalWatch[] = [{ root: "/notes", files: ["note.md"], directories: ["", "expanded"] }];
  vi.mocked(invoke).mockImplementation(async () => [
    { path: "note.md", stamp, error: null }, { path: "", stamp: "directory", error: null },
  ]);
  const onFile = vi.fn(async () => {}), onDirectory = vi.fn(async () => {}), onError = vi.fn();
  function Harness() { useLocalChanges(true, {targets: () => targets, busy: () => busy, onFile, onDirectory, onError}); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness/>));
    expect(invoke).toHaveBeenCalledWith("local_path_stamps", {root: "/notes", paths: ["note.md", "", "expanded"]});
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onDirectory).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onFile).toHaveBeenCalledTimes(1);
    stamp = "two"; busy = true;
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onFile).toHaveBeenCalledTimes(1);
    busy = false;
    onFile.mockRejectedValueOnce(new Error("temporary read error"));
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onFile).toHaveBeenCalledTimes(3);
    stamp = "three";
    onFile.mockRejectedValueOnce(new LocalChangeRetry("retry after save"));
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(onFile).toHaveBeenCalledTimes(5);
    targets = [];
    const count = vi.mocked(invoke).mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(invoke).toHaveBeenCalledTimes(count);
  } finally { await act(async () => root.unmount()); }
});
it("reports deletion once and stops after unmount", async () => {
  vi.useFakeTimers();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(invoke).mockResolvedValue([{path: "missing.md", stamp: null, error: null}]);
  const onFile = vi.fn(async () => {});
  function Harness() { useLocalChanges(true, { targets: () => [{root: "/notes", files: ["missing.md"], directories: []}], busy: () => false, onFile, onDirectory: async () => {}, onError: vi.fn() }); return null; }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness/>));
  await act(async () => vi.advanceTimersByTimeAsync(9000));
  expect(onFile).toHaveBeenCalledExactlyOnceWith("/notes", "missing.md", "File was deleted or moved.");
  await act(async () => root.unmount());
  const count = vi.mocked(invoke).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(invoke).toHaveBeenCalledTimes(count);
});
