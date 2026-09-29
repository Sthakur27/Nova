// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import OpenWindowMenu from "./OpenWindowMenu";

it("navigates window destinations, dismisses with Escape or outside clicks, and restores focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const onLocal = vi.fn(), onCloud = vi.fn();
  try {
    await act(async () => root.render(<OpenWindowMenu onLocal={onLocal} onCloud={onCloud}/>));
    const trigger = host.querySelector("button")!;
    await act(async () => trigger.click());
    expect(onLocal).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("Open Local Folder…");
    const menu = document.querySelector('[role="menu"]')!;
    await act(async () => menu.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowDown",bubbles:true})));
    expect(document.activeElement?.textContent).toBe("Open Cloud-only Window");
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(onCloud).toHaveBeenCalledOnce();
    expect(onLocal).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true})));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", {bubbles:true})));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(onLocal).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});

it("opens recent folders, keeps long lists scrollable, and clears only folder history", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  const folder = { root: "/notes", name: "Notes", tabs: [], active: null, mode: "edit" as const };
  const onRecent = vi.fn(), onLocal = vi.fn(), onCloud = vi.fn();
  const render = (folders: typeof folder[]) => <OpenWindowMenu folders={folders} onLocal={onLocal} onCloud={onCloud} onRecent={onRecent} onClear={() => root.render(render([]))}/>;
  try {
    await act(async () => root.render(render([folder])));
    const trigger = host.querySelector("button")!;
    await act(async () => trigger.click());
    const menu = document.querySelector('[role="menu"]')!;
    await act(async () => menu.dispatchEvent(new Event("scroll")));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('button[title="/notes"]')!.click());
    expect(onRecent).toHaveBeenCalledWith(folder);
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => document.querySelector<HTMLButtonElement>('.recent-clear')!.click());
    await act(async () => trigger.click());
    expect(document.querySelector('.recent-clear')).toBeNull();
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Open Local Folder…");
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Open Cloud-only Window");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
