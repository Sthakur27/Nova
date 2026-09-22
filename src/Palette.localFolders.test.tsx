// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { defaultSearchOptions } from "./searchOptions";
import Palette from "./Palette";
import { searchFiles, cancelSearch } from "./storage";
vi.mock("./storage", () => ({ searchNotes: vi.fn(), searchFiles: vi.fn(), cancelSearch: vi.fn() }));
it("finds files in unopened directories and cancels the traversal on close", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(searchFiles).mockResolvedValue({ files: [{ root: "/large", path: "unopened/needle.md", name: "needle.md" }], warnings: [] });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onOpen = vi.fn();
  const folder = { root: "/large", name: "Large", files: [], directories: ["unopened"] };
  try {
    await act(async () => root.render(<Palette folders={[folder]} initialFilter="Files" activeNote={null} getActiveText={() => ""} scope="everywhere" onScopeChange={() => {}} onNavigateCurrent={() => {}} onClose={() => {}} onOpen={onOpen} />));
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "needle");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
    expect(searchFiles).toHaveBeenCalledWith([folder], "needle", defaultSearchOptions);
    const option = host.querySelector<HTMLButtonElement>('[role="option"]')!;
    expect(option.textContent).toContain("unopened/needle.md");
    await act(async () => option.click());
    expect(onOpen).toHaveBeenCalledWith("/large", "unopened/needle.md", undefined, undefined);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
  expect(cancelSearch).toHaveBeenCalledWith(true);
});

it("keeps hidden search results opt-in and remembers the advanced search checkbox", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear();
  const host = document.createElement("div"), root = createRoot(host);
  const folder = {root:"/hidden-test",name:"Notes",files:["plain.txt", ".env", ".config/note.txt", ".nova"].map(path=>({path,name:path}))};
  const render = () => <Palette folders={[folder]} initialFilter="Files" activeNote={null} getActiveText={()=>""} scope="everywhere" onScopeChange={()=>{}} onNavigateCurrent={()=>{}} onClose={()=>{}} onOpen={()=>{}}/>;
  try {
    await act(async()=>root.render(render()));
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1);
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-controls="palette-advanced-fields"]')!.click());
    await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(4);
    await act(async()=>root.render(null));
    await act(async()=>root.render(render()));
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(4);
    await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1);
  } finally { await act(async()=>root.unmount()); localStorage.clear(); vi.unstubAllGlobals(); }
});
