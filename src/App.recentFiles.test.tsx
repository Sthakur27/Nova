// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "./App";
import { EditorView } from "@codemirror/view";
import { RECENT_FILES_KEY } from "./recentFileHistory";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
it("reopens recent notes, persists history, excludes other folders, and does not repopulate cleared history on edits", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  localStorage.clear();
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify([{ root: "demo", path: "Scratchpad.txt" }, { root: "/closed", path: "Private.md" }]));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  try {
    await act(async () => root.render(<App />));
    await act(async () => button("Recent files").click());
    expect(host.querySelector('.recent-files')?.textContent).toContain("Scratchpad.txt");
    expect(host.querySelector('.recent-files')?.textContent).not.toContain("Private.md");
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.recent-file-open')].find(b => b.textContent?.startsWith("Scratchpad.txt"))!.click());
    expect(host.querySelector('.note-tab.active')?.textContent).toContain("Scratchpad.txt");
    expect(JSON.parse(localStorage.getItem(RECENT_FILES_KEY)!)[0]).toEqual({ root: "demo", path: "Scratchpad.txt" });
    await act(async () => root.render(null));
    await act(async () => root.render(<App />));
    await act(async () => button("Recent files").click());
    expect(host.querySelector('.recent-files')?.textContent).toContain("Scratchpad.txt");
    await act(async () => host.querySelector<HTMLButtonElement>('.recent-files header button')!.click());
    expect(host.querySelector('.recent-files')?.textContent).toContain("Open a note");
    expect(JSON.parse(localStorage.getItem(RECENT_FILES_KEY)!)).toEqual([{ root: "/closed", path: "Private.md" }]);
    await act(async () => EditorView.findFromDOM(host.querySelector(".cm-editor")!)!.dispatch({ changes: { from: 0, insert: "An edit" } }));
    expect(host.querySelectorAll('.recent-file-open')).toHaveLength(0);
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals();
  }
});
