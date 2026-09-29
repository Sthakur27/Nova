import { expect, it } from "vitest";
import { parseRecentFiles, rememberFile, relocateRecentFile, visibleRecentFiles } from "./recentFileHistory";

const local = { root: "/notes", path: "Ideas.md" };
const cloud = { root: "/cloud", path: "Ideas.md" };
it("deduplicates by workspace and path and moves reopened files to the front", () => {
  expect(rememberFile([cloud, local], local)).toEqual([local, cloud]);
  expect(parseRecentFiles([null, {}, local, local, cloud, { root: "/notes", path: ".nova" }])).toEqual([local, cloud]);
  expect(parseRecentFiles(Array.from({ length: 210 }, (_, i) => ({ root: "/notes", path: `${i}.md` })))).toHaveLength(200);
});
it("includes loaded Cloud and Local roots without leaking closed local folders", () => {
  const closed = { root: "/closed", path: "Secret.md" };
  expect(visibleRecentFiles([closed, cloud, local], [{ root: "/notes" }, { root: "/cloud" }])).toEqual([cloud, local]);
  expect(visibleRecentFiles([closed, cloud, local], [{ root: "/cloud" }])).toEqual([cloud]);
});
it("tracks renames and cross-root moves without duplicating destinations or reordering other files", () => {
  const renamed = { ...local, path: "Renamed.md" };
  expect(relocateRecentFile([cloud, local], local, renamed)).toEqual([cloud, renamed]);
  expect(relocateRecentFile([local, cloud], local, cloud)).toEqual([cloud]);
});
