import { beforeEach, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./platform", () => ({ native: true, mobile: true, desktop: false }));
import { chooseWorkspaces, loadExplorer, saveExplorer, readNote, saveNote } from "./storage";

beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
});
it("boots into real on-device notes rather than sample notes", async () => {
  invoke.mockResolvedValue(null);
  expect(await loadExplorer()).toEqual({ folders: [{ root: "mobile", name: "On this device", collapsed: false }], active: null, tabs: [], mode: "edit" });
  expect(invoke).toHaveBeenCalledWith("load_explorer");
});
it("restores stable mobile tab identities and discards foreign roots", async () => {
  invoke.mockResolvedValue({ folders: [{ root: "mobile", name: "On this device" }, { root: "/old/container", name: "Old" }], active: { root: "mobile", path: "Ideas.md" }, tabs: [{ root: "mobile", path: "Ideas.md", pinned: true }, { root: "/old/container", path: "Old.md", pinned: true }], mode: "read" });
  const restored = await loadExplorer();
  expect(restored?.active).toEqual({ root: "mobile", path: "Ideas.md" });
  expect(restored?.tabs).toEqual([{ root: "mobile", path: "Ideas.md", pinned: true }]);
  await saveExplorer(restored!);
  expect(invoke).toHaveBeenLastCalledWith("save_explorer", { preferences: restored });
});
it("opens native storage without a desktop folder picker and saves through Rust", async () => {
  const folder = { root: "mobile", name: "On this device", files: [] };
  invoke.mockResolvedValue(folder);
  expect(await chooseWorkspaces()).toEqual([folder]);
  expect(invoke).toHaveBeenLastCalledWith("open_workspace", { root: "mobile" });
  invoke.mockResolvedValue({ text: "hello", revision: "before", bookmarks: [] });
  await readNote("mobile", "Ideas.md");
  expect(invoke).toHaveBeenLastCalledWith("read_note", { root: "mobile", path: "Ideas.md" });
  invoke.mockResolvedValue("after");
  await saveNote("mobile", "Ideas.md", "updated", "before");
  expect(invoke).toHaveBeenLastCalledWith("save_note", { root: "mobile", path: "Ideas.md", text: "updated", revision: "before" });
});
