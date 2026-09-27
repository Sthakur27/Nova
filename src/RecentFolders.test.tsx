// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import RecentFolders, { recentMenuPosition } from "./RecentFolders";

it("keeps menus within the viewport near either edge", () => {
  expect(recentMenuPosition({ right: 170, top: 520, bottom: 544 }, 320, 240, 800, 600)).toEqual({ left: 8, top: 274 });
  expect(recentMenuPosition({ right: 900, top: 10, bottom: 34 }, 320, 240, 800, 600)).toEqual({ left: 472, top: 40 });
  expect(recentMenuPosition({ right: 170, top: 10, bottom: 34 }, 304, 240, 320, 256)).toEqual({ left: 8, top: 8 });
});
it("hides empty recents, escapes sidebar clipping, and restores focus on Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  host.style.overflow = "hidden";
  document.body.append(host);
  const onOpen = vi.fn(), onClear = vi.fn();
  const folder = { root: "/notes", name: "Notes", active: null, tabs: [], mode: "edit" as const };
  try {
    await act(async () => root.render(<RecentFolders folders={[]} />));
    expect(host.querySelector('button')).toBeNull();
    await act(async () => root.render(<RecentFolders folders={[folder]} onOpen={onOpen} onClear={onClear} />));
    const trigger = host.querySelector<HTMLButtonElement>('button')!;
    await act(async () => trigger.click());
    const menu = document.querySelector<HTMLDivElement>('[role="menu"][aria-label="Recent folders"]')!;
    expect(menu.parentElement).toBe(document.body);
    expect(host.contains(menu)).toBe(false);
    expect(document.activeElement).toBe(menu.querySelector('button'));
    await act(async () => menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[aria-label="Recent folders"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => document.querySelector<HTMLButtonElement>('button[title="/notes"]')!.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(folder);
    expect(document.querySelector('[aria-label="Recent folders"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => document.querySelector<HTMLButtonElement>('.recent-clear')!.click());
    expect(onClear).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("keeps Cloud available before and after clearing recent local folders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const onCloud = vi.fn();
  const folder = { root: "/notes", name: "Notes", active: null, tabs: [], mode: "edit" as const };
  const render = (folders: typeof folder[]) => <RecentFolders folders={folders} onCloud={onCloud} onClear={() => root.render(render([]))}/>;
  try {
    await act(async () => root.render(render([folder])));
    const trigger = host.querySelector("button")!;
    await act(async () => trigger.click());
    expect(document.activeElement?.textContent).toBe("Open Cloud-only Window");
    expect(document.querySelector('[role="separator"]')).not.toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('.recent-clear')!.click());
    await act(async () => trigger.click());
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    expect(document.querySelector('.recent-clear')).toBeNull();
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(onCloud).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
