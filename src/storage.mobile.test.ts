import { beforeEach, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./platform", () => ({ native: true, mobile: true, desktop: false }));
import { chooseWorkspaces, loadExplorer, saveExplorer, readNote, saveNote } from "./storage";

beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
});
it("starts empty until Cloud setup discovers workspaces", async () => {
  invoke.mockResolvedValue(null);
  expect(await loadExplorer()).toEqual({ folders: [], active: null, tabs: [], mode: "edit" });
  expect(invoke).toHaveBeenCalledWith("load_explorer", undefined);
});
it("restores stable mobile tab identities and discards foreign roots", async () => {
  invoke.mockResolvedValue({ folders: [{ root: "mobile-sync/test", name: "Notes" }, { root: "/old/container", name: "Old" }], active: { root: "mobile-sync/test", path: "Ideas.md" }, tabs: [{ root: "mobile-sync/test", path: "Ideas.md", pinned: true }, { root: "/old/container", path: "Old.md", pinned: true }], mode: "read" });
  const restored = await loadExplorer();
  expect(restored?.active).toEqual({ root: "mobile-sync/test", path: "Ideas.md" });
  expect(restored?.tabs).toEqual([{ root: "mobile-sync/test", path: "Ideas.md", pinned: true }]);
  await saveExplorer(restored!);
  expect(invoke).toHaveBeenLastCalledWith("save_explorer", { preferences: restored });
});
it("rejects the local picker on mobile and saves Cloud copies through Rust", async () => {
  await expect(chooseWorkspaces()).rejects.toThrow("Mobile uses Cloud spaces");
  invoke.mockResolvedValue({ text: "hello", revision: "before", bookmarks: [] });
  await readNote("mobile-sync/test", "Ideas.md");
  expect(invoke).toHaveBeenLastCalledWith("read_note", { root: "mobile-sync/test", path: "Ideas.md" });
  invoke.mockResolvedValue("after");
  await saveNote("mobile-sync/test", "Ideas.md", "updated", "before");
  expect(invoke).toHaveBeenLastCalledWith("save_note", { root: "mobile-sync/test", path: "Ideas.md", text: "updated", revision: "before" });
});
it("preserves restored workspace folders and tabs across launches", async () => {
  const folder = {root:"mobile-sync/Work - abc",name:"Work",collapsed:false};
  const active = {root:folder.root,path:"Personal.txt"};
  invoke.mockResolvedValue({folders:[folder],active,tabs:[{...active,pinned:true}],mode:"edit"});
  const saved = await loadExplorer();
  expect(saved?.folders).toContainEqual(folder);
  expect(saved?.active).toEqual(active);
  expect(saved?.tabs).toContainEqual({...active,pinned:true});
});
