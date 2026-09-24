import { afterEach, expect, it, vi } from "vitest";
const { invoke, open } = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock("./resetLocalState", () => ({ invoke, localResetInProgress: () => false }));
vi.mock("./platform", () => ({ desktop: true, native: true, mobile: false }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
import { chooseWorkspaces, openFolderWindow, mergeDirectory, openWorkspace, loadedDirectoryEntries, refreshDirectory } from "./storage";
const root = { root: "/large", name: "Large", files: [{ path: "top.md", name: "top.md" }], directories: ["nested", "denied"], directoryPages: { "": 300 } };
afterEach(() => vi.resetAllMocks());
it("opens only the root and explicitly expanded branches, keeping directory errors local", async () => {
  invoke.mockImplementation(async (command, args) => {
    if (command === "open_workspace") return structuredClone(root);
    if (args.path === "denied") throw new Error("Permission denied");
    return { files: [{ path: "nested/deep.md", name: "deep.md" }], directories: [], warnings: [], nextOffset: null };
  });
  const folder = await openWorkspace(root.root, ["nested", "denied"]);
  expect(invoke.mock.calls).toEqual([
    ["open_workspace", { root: root.root }],
    ["list_directory", { root: root.root, path: "nested", offset: 0 }],
    ["list_directory", { root: root.root, path: "denied", offset: 0 }],
  ]);
  expect(folder.files.map(f => f.path)).toEqual(["top.md", "nested/deep.md"]);
  expect(folder.directoryErrors?.denied).toContain("Permission denied");
  expect(folder.error).toBeUndefined();
});
it("merges paged files without duplicates and clears the final page cursor", () => {
  const folder = mergeDirectory(root, "", { files: [...root.files, { path: "other.md", name: "other.md" }], directories: ["nested", "more"], warnings: [], nextOffset: null }, true);
  expect(folder.files).toHaveLength(2);
  expect(folder.directories).toEqual(["nested", "denied", "more"]);
  expect(folder.directoryPages).toEqual({});
});
it("uses a single-folder picker and leaves cancelled selections empty", async () => {
  open.mockResolvedValue(null);
  expect(await chooseWorkspaces()).toEqual([]);
  expect(open).toHaveBeenCalledWith({ directory: true, multiple: false, title: "Open Folder" });
  expect(invoke).not.toHaveBeenCalled();
});

it("opens a folder in a new native window without rewriting the current session", async () => {
  invoke.mockResolvedValue(undefined);
  await openFolderWindow("/large");
  expect(invoke.mock.calls).toEqual([["new_window", { root: "/large" }]]);
});
it("refreshes the full loaded prefix once, including entries hidden by text-file filtering", async () => {
  const first = mergeDirectory(root, "", { files: [], directories: [], warnings: [], nextOffset: 300, scanned: 300 });
  const loaded = mergeDirectory(first, "", { files: [{path: "last.md", name: "last.md"}], directories: [], warnings: [], nextOffset: null, scanned: 520 }, true);
  expect(loadedDirectoryEntries(loaded, "")).toBe(520);
  expect(loaded.directoryPages).toEqual({});
  invoke.mockResolvedValue({files: [], directories: [], warnings: [], nextOffset: null, scanned: 519});
  await refreshDirectory(loaded.root, "", loadedDirectoryEntries(loaded, ""));
  expect(invoke.mock.calls).toEqual([["refresh_directory", {root: "/large", path: "", loaded: 520}]]);
});
