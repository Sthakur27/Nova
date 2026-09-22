// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Explorer from "./Explorer";
import type { Workspace } from "./model";

it("opens on the first click, promotes on double-click, and preserves keyboard activation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const folder: Workspace = {
    root: "/notes", name: "Notes", collapsed: false, files: [{ name: "a.md", path: "a.md" }],
  };
  const onOpen = vi.fn();
  const noop = () => {};
  try {
    await act(async () => root.render(<Explorer folders={[folder]} activeRoot="" activePath=""
      onOpen={onOpen} onRename={noop} onStar={noop} onFileAction={noop}
      onChange={noop} onRemove={noop} onRefresh={noop} onAdd={noop} externalDrag={false} />));
    const file = container.querySelector<HTMLButtonElement>(".file-open")!;
    await act(async () => { file.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); });
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(folder, "a.md", undefined);
    await act(async () => {
      file.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      file.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith(folder, "a.md", true);
    await act(async () => { file.click(); });
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenLastCalledWith(folder, "a.md", undefined);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("keeps Local visible despite old collapsed preferences and only collapses Cloud", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const local: Workspace = {root:"/local",name:"Local folder",files:[],collapsed:false};
  const cloud: Workspace = {root:"/cloud",name:"Notes",files:[],collapsed:false,cloudSpace:{id:"drive-id",name:"Notes",account:"account"}};
  localStorage.setItem("nova:explorer-local-collapsed:v1", "on");
  const onNew=vi.fn(), onAdd=vi.fn(), noop=()=>{};
  const render = () => <Explorer folders={[local, cloud]} activeRoot={local.root} activePath="" onNew={onNew}
    onOpen={noop} onRename={noop} onStar={noop} onFileAction={noop} onChange={noop} onRemove={noop} onRefresh={noop} onAdd={onAdd} externalDrag={false}/>;
  try {
    await act(async()=>root.render(render()));
    expect([...host.querySelectorAll('.explorer-section')].map(node=>node.getAttribute('aria-label'))).toEqual(['Cloud notes','Local notes']);
    const toggles=host.querySelectorAll<HTMLButtonElement>('.explorer-section-toggle');
    await act(async()=>toggles[0].click());
    expect(host.querySelector<HTMLElement>('#explorer-cloud')!.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('#explorer-local')!.hidden).toBe(false);
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="New Cloud note"]')!.click());
    expect(onNew).toHaveBeenCalledExactlyOnceWith(cloud);
    expect(host.querySelector<HTMLElement>('#explorer-cloud')!.hidden).toBe(false);
    expect(toggles).toHaveLength(1);
    expect(host.querySelector('#explorer-local')?.previousElementSibling?.querySelector('h2 button')).toBeNull();
    expect(host.querySelector('[aria-label="Open Recent"]')).toBeNull();
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Open local folder in new window"]')!.click());
    expect(onAdd).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLElement>('#explorer-local')!.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>('#explorer-cloud')!.hidden).toBe(false);
  } finally { await act(async()=>root.unmount());host.remove();localStorage.clear();vi.unstubAllGlobals(); }
});

it("offers a direct Drive action only for Cloud files and restores focus after selecting it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const local: Workspace = { root: "/local", name: "Local", collapsed: false, files: [{ name: "local.md", path: "local.md" }] };
  const cloud: Workspace = { root: "/cloud", name: "Cloud", collapsed: false, closedDirectories: [], files: [{ name: "cloud.md", path: "nested/cloud.md" }], cloudSpace: { id: "space", name: "Cloud", account: "account" } };
  const onFileAction = vi.fn(), noop = () => {};
  try {
    await act(async () => root.render(<Explorer folders={[local, cloud]} activeRoot="" activePath=""
      onOpen={noop} onRename={noop} onStar={noop} onFileAction={onFileAction}
      onChange={noop} onRemove={noop} onRefresh={noop} onAdd={noop} externalDrag={false} />));
    const cloudFile = host.querySelector<HTMLButtonElement>('[data-folder-root="/cloud"] .file-open')!;
    await act(async () => cloudFile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    const action = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent === "Open in Google Drive")!;
    expect(action).toBeDefined();
    await act(async () => action.click());
    expect(onFileAction).toHaveBeenCalledExactlyOnceWith(cloud, "nested/cloud.md", "drive");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(cloudFile);
    await act(async () => host.querySelector('[data-folder-root="/local"] .file-open')!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    expect(document.querySelector('[role="menu"]')!.textContent).not.toContain("Open in Google Drive");
    expect(document.querySelector('[role="menu"]')!.textContent).toContain("Open in File Location");
  } finally { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); }
});

it("browses unloaded directories, paginates, shows actionable errors and exposes recent folders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const folder: Workspace = { root: "/large", name: "Large", collapsed: false, files: [], directories: ["nested", "denied"], expandedDirectories: ["denied"], directoryPages: { "": 300 }, directoryErrors: { denied: "Permission denied" }, starred: ["unopened/star.md"] };
  const recent = { root: "/other", name: "Other", tabs: [], active: null, mode: "edit" as const };
  const onToggleDirectory = vi.fn(), onLoadDirectory = vi.fn(), onRecent = vi.fn(), noop = () => {};
  const click = async (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
  try {
    await act(async () => root.render(<Explorer folders={[folder]} recents={[recent]} onRecent={onRecent} activeRoot={folder.root} activePath=""
      onOpen={noop} onRename={noop} onStar={noop} onFileAction={noop} onChange={noop} onRemove={noop} onRefresh={noop} onAdd={noop} externalDrag={false}
      onToggleDirectory={onToggleDirectory} onLoadDirectory={onLoadDirectory} />));
    expect(host.textContent).toContain("Permission denied");
    await click('.tree-row[aria-expanded="false"]');
    expect(onToggleDirectory).toHaveBeenCalledWith(folder.root, "nested");
    await click('.tree-load-more');
    expect(onLoadDirectory).toHaveBeenCalledWith(folder.root, "", true);
    await click('.folder-error button');
    expect(onLoadDirectory).toHaveBeenCalledWith(folder.root, "denied", undefined);
    await click('[aria-label="Open Recent"]');
    await act(async () => document.querySelector<HTMLButtonElement>('button[title="/other"]')!.click());
    expect(onRecent).toHaveBeenCalledWith(recent);
    expect(host.querySelector('.root-grip')?.hasAttribute('hidden')).toBe(true);
    await click('[aria-label="Show starred files only"]');
    expect(host.textContent).toContain("star.md");
  } finally { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); }
});
