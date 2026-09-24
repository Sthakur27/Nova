// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WorkspaceSearch from "./WorkspaceSearch";
import { searchNotes, cancelSearch } from "./storage";
import { previewWorkspaceReplace, applyWorkspaceReplacement } from "./workspaceReplace";
vi.mock("./storage", () => ({ searchNotes: vi.fn(), cancelSearch: vi.fn() }));
vi.mock("./workspaceReplace", () => ({ previewWorkspaceReplace: vi.fn(), applyWorkspaceReplacement: vi.fn(), replacementKey: (file: {root: string; path: string}) => JSON.stringify([file.root, file.path]) }));
const folders = [{root: "/temporary", name: "Temporary", files: []}];
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function edit(input: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", {bubbles: true})); });
}
it("groups saved-file results, opens the matching line, preserves query on refocus, and forwards filters into reviewed replacement", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const onOpen = vi.fn(), onClose = vi.fn(), blocked = () => [{root: "/temporary", path: "draft.md"}];
  vi.mocked(searchNotes).mockResolvedValue({hits: [{root: "/temporary", path: "note.md", line: 2, snippet: "needle"}, {root: "/temporary", path: "note.md", line: 4, snippet: "needle again"}], bookmarks: [], warnings: []});
  vi.mocked(previewWorkspaceReplace).mockResolvedValue({files: [{root: "/temporary", path: "note.md", before: "needle", after: "changed", revision: "reviewed", changes: [{from:0,to:6,insert:"changed"}]}], warnings: []});
  vi.mocked(applyWorkspaceReplacement).mockResolvedValue();
  const render = (id: number) => root.render(<WorkspaceSearch folders={folders} active request={{id,replace:false}} blocked={blocked} onOpen={onOpen} onClose={onClose}/>);
  try {
    await act(async () => render(1));
    const input = host.querySelector<HTMLInputElement>('[aria-label="Find across files"]')!;
    expect(document.activeElement).toBe(input);
    await edit(input, "needle"); await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(host.querySelectorAll(".workspace-search-results details")).toHaveLength(1);
    await act(async () => host.querySelector<HTMLButtonElement>(".workspace-search-results button")!.click());
    expect(onOpen).toHaveBeenCalledWith("/temporary", "note.md", 2);
    await act(async () => render(2)); expect(input.value).toBe("needle");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="workspace-search-filters"]')!.click());
    await edit(host.querySelector<HTMLInputElement>('[placeholder="*.md, notes/**"]')!, "note.md");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Toggle replacement"]')!.click());
    await edit(host.querySelector<HTMLInputElement>('.workspace-replace input:not([type="checkbox"])')!, "changed");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Preview replacements")!.click());
    expect(previewWorkspaceReplace).toHaveBeenCalledWith(folders, "needle", "changed", expect.objectContaining({include: "note.md"}), blocked);
    expect(applyWorkspaceReplacement).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Review before and after");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Replace in 1 selected file")!.click());
    expect(applyWorkspaceReplacement).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({revision: "reviewed"}), blocked);
    expect(host.textContent).toContain("Replaced in 1 file.");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})));
    expect(onClose).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it("ignores stale search responses and does not search with invalid regex or while hidden", async () => {
  const host = document.createElement("div"); const root = createRoot(host);
  let finish!: (result: Awaited<ReturnType<typeof searchNotes>>) => void;
  vi.mocked(searchNotes).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({hits: [],bookmarks: [],warnings: []});
  const request = {id: 1, replace: false, query: "old"};
  const render = (active: boolean) => root.render(<WorkspaceSearch folders={folders} active={active} request={request} blocked={() => []} onOpen={() => {}} onClose={() => {}}/>);
  try {
    await act(async () => render(true)); await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await edit(host.querySelector<HTMLInputElement>('[aria-label="Find across files"]')!, "new");
    await act(async () => { finish({hits: [{root:"/temporary",path:"stale.md",line:1,snippet:"old"}],bookmarks:[],warnings:[]}); await vi.advanceTimersByTimeAsync(200); });
    expect(host.textContent).not.toContain("stale.md"); expect(cancelSearch).toHaveBeenCalledWith(false);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Use regular expression"]')!.click());
    await edit(host.querySelector<HTMLInputElement>('[aria-label="Find across files"]')!, "[");
    const count = vi.mocked(searchNotes).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("Invalid regular expression");
    await act(async () => render(false)); await edit(host.querySelector<HTMLInputElement>('[aria-label="Find across files"]')!, "hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(searchNotes).toHaveBeenCalledTimes(count);
  } finally { await act(async () => root.unmount()); }
});
