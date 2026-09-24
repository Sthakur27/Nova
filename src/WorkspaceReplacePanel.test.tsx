// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import WorkspaceReplacePanel from "./WorkspaceReplacePanel";
import { defaultSearchOptions } from "./searchOptions";
import { applyWorkspaceReplacement, previewWorkspaceReplace } from "./workspaceReplace";
vi.mock("./workspaceReplace", () => ({
  replacementKey: (file: {root: string; path: string}) => JSON.stringify([file.root, file.path]),
  applyWorkspaceReplacement: vi.fn(), previewWorkspaceReplace: vi.fn(),
}));
it("applies only checked preview rows and invalidates the preview when query changes", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const files = ["a.md", "b.md"].map(path => ({root: "/local", path, before: "cat", after: "dog", revision: "old", changes: [{from: 0, to: 3, insert: "dog"}]}));
  vi.mocked(previewWorkspaceReplace).mockResolvedValue({files, warnings: []});
  vi.mocked(applyWorkspaceReplacement).mockResolvedValue();
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const folders = [{root: "/local", name: "Local", files: []}], blocked = () => [];
  const render = (query: string) => root.render(<WorkspaceReplacePanel folders={folders} query={query} options={defaultSearchOptions} blocked={blocked}/>);
  try {
    await act(async () => render("cat"));
    await act(async () => (host.querySelectorAll("button")[0] as HTMLButtonElement).click());
    expect(host.querySelectorAll("article")).toHaveLength(2);
    await act(async () => (host.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click());
    await act(async () => (host.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(applyWorkspaceReplacement).toHaveBeenCalledExactlyOnceWith(files[0], blocked);
    expect(host.textContent).toContain("Replaced in 1 file");
    await act(async () => (host.querySelectorAll("button")[0] as HTMLButtonElement).click());
    await act(async () => render("different"));
    expect(host.querySelectorAll("article")).toHaveLength(0);
    expect((host.querySelectorAll("button")[1] as HTMLButtonElement).disabled).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it("stops queued writes when closed while a save is pending", async () => {
  vi.clearAllMocks();
  const files = ["a.md", "b.md", "c.md", "d.md"].map(path => ({root: "/local", path, before: "cat", after: "dog", revision: "old", changes: [{from: 0, to: 3, insert: "dog"}]}));
  vi.mocked(previewWorkspaceReplace).mockResolvedValue({files, warnings: []});
  vi.mocked(applyWorkspaceReplacement).mockRejectedValueOnce(new Error("Changed externally"));
  let release!: () => void;
  vi.mocked(applyWorkspaceReplacement).mockImplementationOnce(() => Promise.reject(new Error("Changed externally")))
    .mockImplementationOnce(() => new Promise<void>(resolve => {release = resolve;}));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<WorkspaceReplacePanel folders={[]} query="cat" options={defaultSearchOptions} blocked={() => []}/>));
    await act(async () => (host.querySelectorAll("button")[0] as HTMLButtonElement).click());
    await act(async () => (host.querySelectorAll("button")[1] as HTMLButtonElement).click());
    // Both failed files are retained; close while the third pending write is still running.
    await act(async () => root.unmount());
    await act(async () => release());
    expect(applyWorkspaceReplacement).toHaveBeenCalledTimes(3);
  } finally { host.remove(); }
});
it("keeps failed files reviewable and reports partial success", async () => {
  vi.resetAllMocks();
  const files = ["a.md", "b.md"].map(path => ({root: "/local", path, before: "cat", after: "dog", revision: "old", changes: [{from: 0, to: 3, insert: "dog"}]}));
  vi.mocked(previewWorkspaceReplace).mockResolvedValue({files, warnings: []});
  vi.mocked(applyWorkspaceReplacement).mockResolvedValueOnce().mockRejectedValueOnce(new Error("Changed externally"));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<WorkspaceReplacePanel folders={[]} query="cat" options={defaultSearchOptions} blocked={() => []}/>));
    await act(async () => (host.querySelectorAll("button")[0] as HTMLButtonElement).click());
    await act(async () => (host.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(host.textContent).toContain("Replaced in 1 file");
    expect(host.textContent).toContain("b.md: Error: Changed externally");
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.querySelector("article")?.textContent).toContain("b.md");
    expect((host.querySelectorAll("button")[1] as HTMLButtonElement).disabled).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it("stops queued writes when the sidebar switches back to Files", async () => {
  vi.resetAllMocks();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const files = ["first.md", "second.md"].map(path => ({root: "/temporary", path, before: "cat", after: "dog", revision: "old", changes: [{from:0,to:3,insert:"dog"}]}));
  vi.mocked(previewWorkspaceReplace).mockResolvedValue({files,warnings:[]});
  let finish!: () => void;
  vi.mocked(applyWorkspaceReplacement).mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
  const host = document.createElement("div"), root = createRoot(host);
  const render = (active: boolean) => root.render(<WorkspaceReplacePanel folders={[]} query="cat" options={defaultSearchOptions} blocked={() => []} active={active}/>);
  try {
    await act(async () => render(true));
    await act(async () => host.querySelectorAll("button")[0].click());
    await act(async () => host.querySelectorAll("button")[1].click());
    await act(async () => render(false));
    await act(async () => finish());
    expect(applyWorkspaceReplacement).toHaveBeenCalledTimes(1);
    await act(async () => render(true));
    expect(host.querySelectorAll("article")).toHaveLength(0);
  } finally { await act(async () => root.unmount()); }
});
