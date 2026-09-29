// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RECENT_FILES_KEY, useRecentFiles } from "./recentFileHistory";

it("merges the latest stored history, handles other-window changes, and reports storage failures", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  localStorage.setItem(RECENT_FILES_KEY, "broken json");
  let history!: ReturnType<typeof useRecentFiles>;
  function Fixture() { history = useRecentFiles(); return null; }
  const root = createRoot(document.createElement("div"));
  const a = { root: "/a", path: "one.md" }, b = { root: "/b", path: "two.md" };
  try {
    await act(async () => root.render(<Fixture/>));
    expect(history.files).toEqual([]);
    await act(async () => history.remember(a));
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify([b, a]));
    await act(async () => history.remember(a));
    expect(history.files).toEqual([a, b]);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify([b]));
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: RECENT_FILES_KEY })));
    expect(history.files).toEqual([b]);
    await act(async () => history.remove(b));
    expect(history.files).toEqual([]);
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    await act(async () => history.remember(a));
    expect(history.error).toContain("could not be saved");
    expect(history.files).toEqual([]);
    failure.mockRestore();
    await act(async () => history.remember(a));
    expect(history.error).toBe("");
  } finally { await act(async () => root.unmount()); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
