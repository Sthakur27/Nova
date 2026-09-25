// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Settings from "./Settings";
import { invoke } from "@tauri-apps/api/core";
import { confirmCloudReset } from "./confirmCloudReset";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./confirmCloudReset", () => ({confirmCloudReset:vi.fn()}));
const noop = vi.fn();
const props: ComponentProps<typeof Settings> = {
  showReadMode:false,onShowReadMode:noop,
  tooltips:true,onTooltips:noop,
  onClose:noop, galaxyPerformance:"high",onGalaxyPerformance:noop,galaxy:false,onGalaxy:noop,lineHighlight:false,onLineHighlight:noop,
  lineNumbers:false,onLineNumbers:noop,wordWrap:true,onWordWrap:noop,spellcheck:false,onSpellcheck:noop,
  bookmarks:true,onBookmarks:noop,editorFont:"default",onEditorFont:noop,fontSize:"default",onFontSize:noop,
  lineSpacing:"default",onLineSpacing:noop,textWidth:"default",onTextWidth:noop,defaultExtension:".txt",onDefaultExtension:noop,storageError:false,
};
it("shows reset last only when enabled, confirms, locks controls, and surfaces failure", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let fail!: (error: Error) => void;
  const reset = vi.fn(() => new Promise<void>((_, reject) => { fail=reject; }));
  const button = () => [...host.querySelectorAll("button")].find(b => b.textContent?.startsWith("Reset from"))!;
  try {
    await act(async () => root.render(<Settings {...props}/>));
    expect(button()).toBeUndefined();
    await act(async () => root.render(<Settings {...props} onResetLocal={reset}/>));
    expect(host.querySelector("section:last-child")?.id).toBe("");
    expect(host.querySelector("section:last-child")?.getAttribute("aria-labelledby")).toBe("settings-reset");
    vi.mocked(confirmCloudReset).mockResolvedValue(false);
    await act(async () => button().click());
    expect(reset).not.toHaveBeenCalled();
    vi.mocked(confirmCloudReset).mockResolvedValue(true);
    await act(async () => button().click());
    expect(reset).toHaveBeenCalledOnce();
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", {cancelable:true})));
    expect(noop).not.toHaveBeenCalled();
    await act(async () => fail(new Error("Download failed; local notes kept")));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("local notes kept");
    expect(button().disabled).toBe(false);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("opens the header guide without an available update and allows retry after failure", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const host = document.createElement("div"), root = createRoot(host);
  const updater = { phase: "current" as const, version: "", error: "", progress: undefined, checkNow: vi.fn(), download: vi.fn(), restart: vi.fn() };
  vi.mocked(invoke).mockReset().mockRejectedValueOnce(new Error("No browser")).mockResolvedValue(undefined);
  try {
    await act(async () => root.render(<Settings {...props} updater={updater}/>));
    const help = host.querySelector<HTMLButtonElement>('header button[aria-label="Open README on GitHub"]')!;
    expect(help).not.toBeNull();
    await act(async () => help.click());
    expect(invoke).toHaveBeenCalledWith("open_readme");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not open the README");
    expect(help.disabled).toBe(false);
    await act(async () => help.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(updater.download).not.toHaveBeenCalled();
    expect(host.querySelector("dialog")).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it("offers the Read opt-in in both desktop and mobile settings", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const host = document.createElement("div"), root = createRoot(host);
  const onShowReadMode = vi.fn();
  try {
    for (const mobile of [false, true]) {
      await act(async () => root.render(<Settings {...props} onShowReadMode={onShowReadMode} onResetLocal={mobile ? async () => {} : undefined} />));
      const label = [...host.querySelectorAll("label")].find(label => label.textContent === "Show Read mode")!;
      const toggle = host.querySelector<HTMLButtonElement>(`[aria-labelledby="${label.id}"]`)!;
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      await act(async () => toggle.click());
      expect(onShowReadMode).toHaveBeenLastCalledWith(true);
      await act(async () => root.render(<Settings {...props} showReadMode onShowReadMode={onShowReadMode} />));
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      await act(async () => toggle.click());
      expect(onShowReadMode).toHaveBeenLastCalledWith(false);
    }
  } finally { await act(async () => root.unmount()); }
});
