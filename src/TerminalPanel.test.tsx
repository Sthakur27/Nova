// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import TerminalPanel from "./TerminalPanel";

vi.mock("./TerminalView", () => ({ default: () => <div data-testid="shell" /> }));

it("keeps terminal controls in the status bar and removes the collapsed tray", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const host = document.createElement("main");
  const status = document.createElement("footer");
  document.body.append(host, status);
  const root = createRoot(host);
  const change = vi.fn();
  const changeBottomPanel = vi.fn();
  const render = (open: boolean, bottomPanelOpen = true) => root.render(<TerminalPanel open={open} root="/notes" controlsContainer={status}
    bottomPanelOpen={bottomPanelOpen} onBottomPanelOpenChange={changeBottomPanel}
    onOpenChange={change} onStorageError={() => {}} />);
  try {
    await act(async () => render(true));
    expect(host.querySelector('[aria-label="Collapse bottom panel"]')).not.toBeNull();
    expect(status.querySelector('[aria-label="Collapse terminal panel"]')).not.toBeNull();
    const shell = host.querySelector('[data-testid="shell"]');
    expect(shell).not.toBeNull();
    await act(async () => status.querySelector<HTMLButtonElement>('[aria-label="Collapse terminal panel"]')!.click());
    expect(change).toHaveBeenLastCalledWith(false);
    expect(changeBottomPanel).not.toHaveBeenCalled();
    await act(async () => render(false));
    expect(host.querySelector<HTMLElement>("#terminal-panel")!.style.height).toBe("0px");
    expect(host.querySelector<HTMLElement>("#terminal-body")!.hidden).toBe(true);
    expect(host.querySelector('[data-testid="shell"]')).toBe(shell);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Collapse bottom panel"]')!.click());
    expect(changeBottomPanel).toHaveBeenLastCalledWith(false);
    expect(change).toHaveBeenCalledTimes(1);
    await act(async () => render(false, false));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Expand bottom panel"]')!.click());
    expect(changeBottomPanel).toHaveBeenLastCalledWith(true);
    await act(async () => render(false));
    await act(async () => status.querySelector<HTMLButtonElement>('[aria-label="Expand terminal panel"]')!.click());
    expect(change).toHaveBeenLastCalledWith(true);
    await act(async () => render(true));
    expect(host.querySelector<HTMLElement>("#terminal-body")!.hidden).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove(); status.remove(); vi.unstubAllGlobals();
  }
});

it("preserves each shell while switching and collapsing, and closes only the requested tab", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const host = document.createElement("main");
  document.body.append(host);
  const root = createRoot(host);
  const render = (open = true, folder = "/notes") => root.render(<TerminalPanel open={open} root={folder}
    controlsContainer={null} onOpenChange={() => {}} onStorageError={() => {}} />);
  const click = async (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
  try {
    await act(async () => render());
    const first = host.querySelector('#terminal-session-1 [data-testid="shell"]');
    await click('[aria-label="New terminal tab"]');
    const second = host.querySelector('#terminal-session-2 [data-testid="shell"]');
    expect(first).not.toBeNull(); expect(second).not.toBeNull();
    expect(host.querySelector<HTMLElement>('#terminal-session-1')!.hidden).toBe(true);
    expect(host.querySelector('#terminal-tab-2')!.getAttribute('aria-selected')).toBe('true');
    await click('#terminal-tab-1');
    expect(host.querySelector('#terminal-session-1 [data-testid="shell"]')).toBe(first);
    expect(host.querySelector('#terminal-session-2 [data-testid="shell"]')).toBe(second);
    await act(async () => render(false));
    await act(async () => render(true, "/other-folder"));
    expect(host.querySelector('#terminal-session-1 [data-testid="shell"]')).toBe(first);
    expect(host.querySelector('#terminal-tab-1')!.getAttribute('title')).toBe('/notes');
    await click('[aria-label="New terminal tab"]');
    expect(host.querySelector('#terminal-tab-3')!.getAttribute('title')).toBe('/other-folder');
    await click('[aria-label="Close terminal 2"]');
    expect(host.querySelector('#terminal-session-2')).toBeNull();
    expect(host.querySelector('#terminal-tab-3')!.getAttribute('aria-selected')).toBe('true');
    await click('[aria-label="Close terminal 3"]');
    expect(host.querySelector('#terminal-tab-1')!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('#terminal-session-1 [data-testid="shell"]')).toBe(first);
    await click('[aria-label="Close terminal 1"]');
    expect(host.textContent).toContain('No terminals open.');
    await click('[aria-label="New terminal tab"]');
    expect(host.querySelector('#terminal-tab-4')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove(); vi.unstubAllGlobals();
  }
});

it("waits until the terminal is first opened before mounting a shell", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const host = document.createElement("main"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<TerminalPanel started={false} open={false} root="demo" controlsContainer={null} onOpenChange={() => {}} onStorageError={() => {}} />));
    expect(host.querySelector('[data-testid="shell"]')).toBeNull();
    await act(async () => root.render(<TerminalPanel started open root="/notes" controlsContainer={null} onOpenChange={() => {}} onStorageError={() => {}} />));
    expect(host.querySelectorAll('[data-testid="shell"]')).toHaveLength(1);
    expect(host.querySelector('#terminal-tab-1')!.getAttribute('title')).toBe('/notes');
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
