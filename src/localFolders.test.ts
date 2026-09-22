import { expect, it } from "vitest";
import { parsePreferences } from "./folders";
import { folderWindowPreferences, migrateLocalFolders, rememberFolder, parseRecents } from "./localFolders";
import { initialPane } from "./paneLayout";
import { tabId } from "./tabs";
import type { Workspace } from "./model";
const a: Workspace = { root: "/a", name: "Notes", files: [], expandedDirectories: ["nested"] };
const b: Workspace = { root: "/b", name: "Notes", files: [] };
const cloud: Workspace = { root: "/cloud", name: "Cloud", cloudSpace: { id: "cloud", name: "Cloud", account: "me" }, files: [] };
const tabs = [{ root: a.root, path: "nested/a.md", pinned: true }, { root: b.root, path: "b.md", pinned: false }, { root: cloud.root, path: "cloud.md", pinned: true }];
it("migrates a multi-root session to one local folder without losing inactive tabs or Cloud", () => {
  const preferences = { folders: [a, b, cloud], active: tabs[1], tabs, mode: "source" as const };
  const result = migrateLocalFolders(preferences, [a, b, cloud]);
  expect(result.folders.map(f => f.root)).toEqual([b.root, cloud.root]);
  expect(result.recents.find(r => r.root === a.root)).toMatchObject({ tabs: [tabs[0]], expandedDirectories: ["nested"], active: "nested/a.md" });
  expect(result.recents.find(r => r.root === b.root)?.tabs).toEqual([tabs[1]]);
  expect(result.recents.some(r => r.root === cloud.root)).toBe(false);
});
it("retains the active unavailable local folder so its failure can be retried", () => {
  const unavailable = { ...a, error: "Permission denied" };
  expect(migrateLocalFolders({ folders: [a, b], active: tabs[0], mode: "edit" }, [unavailable, b]).folders).toEqual([unavailable]);
});
it("round-trips a folder's tabs, active file, expanded branches and pane layout", () => {
  const layout = { ...initialPane(), tabs: [tabId(tabs[0])], selected: tabId(tabs[0]) };
  const recents = rememberFolder([], a, tabs, tabs[0], "source", layout);
  const preferences = parsePreferences(JSON.parse(JSON.stringify({ folders: [b], recents, active: null, mode: "read" })));
  expect(preferences?.recents?.[0]).toMatchObject({ root: a.root, tabs: [tabs[0]], active: tabs[0].path, mode: "source", expandedDirectories: ["nested"], panes: layout });
});
it("deduplicates recents by full path and keeps the newest session", () => {
  const recents = rememberFolder(rememberFolder([], a, tabs, tabs[0], "edit"), b, tabs, tabs[1], "read");
  const refreshed = rememberFolder(recents, a, [], null, "source");
  expect(refreshed.map(r => r.root)).toEqual([a.root, b.root]);
  expect(refreshed[0].tabs).toEqual([]);
  expect(refreshed[0].active).toBeNull();
});
it("rejects malformed recent entries and tabs from other roots", () => {
  expect(parseRecents([null, { root: 42 }, { ...a, tabs }, { ...a, tabs: [] }])).toMatchObject([{ root: a.root, tabs: [tabs[0]] }]);
});

it("seeds a new window with only the requested local folder and its tabs", () => {
  const saved = { folders: [a, cloud], tabs: [tabs[0], tabs[2]], active: tabs[0], mode: "source" as const,
    recents: rememberFolder([], b, tabs, tabs[1], "read") };
  const before = JSON.stringify(saved);
  const next = folderWindowPreferences(saved, b.root);
  expect(next.folders.map(folder => folder.root)).toEqual([cloud.root, b.root]);
  expect(next.tabs).toEqual([tabs[1]]);
  expect(next.active).toEqual({ root: b.root, path: tabs[1].path });
  expect(next.mode).toBe("read");
  expect(JSON.stringify(saved)).toBe(before);
});
it("opens a never-seen folder without inheriting another window's tabs", () => {
  const next = folderWindowPreferences({ folders: [a], tabs: [tabs[0]], active: tabs[0], mode: "source" }, "/new folder");
  expect(next.folders).toEqual([{ root: "/new folder", name: "new folder", collapsed: false }]);
  expect(next.tabs).toEqual([]);
  expect(next.active).toBeNull();
});
