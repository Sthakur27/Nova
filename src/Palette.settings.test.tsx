// @vitest-environment jsdom
import { act, useState } from "react";
import SettingDialog from "./SettingDialog";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Palette from "./Palette";
import { searchNotes } from "./storage";
import { settingChoices, toggleSetting } from "./settingCommands";

vi.mock("./storage", () => ({ searchNotes: vi.fn(async () => ({ hits: [], bookmarks: [], warnings: [] })) }));

it("keeps files first, isolates settings, and runs the keyboard-selected preference", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const setWidth = vi.fn(), setNumbers = vi.fn(), close = vi.fn(), open = vi.fn();
  const getActiveText = vi.fn(() => { throw new Error("Settings must not read the editor"); });
  try {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    function Harness() {
      const [width, changeWidth] = useState("default");
      const [numbers, changeNumbers] = useState(true);
      const [active, setActive] = useState<string | null>(null);
      const [palette, setPalette] = useState(true);
      const commands = [
        ...settingChoices("width", "Text width", width, ["default", "wide"], value => { changeWidth(value); setWidth(value); }),
        toggleSetting("numbers", "Line numbers", numbers, value => { changeNumbers(value); setNumbers(value); }),
      ];
      const configuration = commands.find(command => command.id === active)?.configuration;
      return <>
        {palette && <Palette
          folders={[{ root: "/notes", name: "Notes", files: [{ name: "Text width.md", path: "Text width.md" }] }]}
          commands={commands.map(command => ({ ...command, run: () => setActive(command.id) }))}
          activeNote={{ root: "/notes", path: "Text width.md", bookmarks: [] }}
          getActiveText={getActiveText} scope="current" onScopeChange={() => {}}
          onNavigateCurrent={open} onClose={() => { close(); setPalette(false); }} onOpen={open}
        />}
        {configuration && <SettingDialog configuration={configuration} storageError={false} onClose={() => setActive(null)} onOpenSettings={() => {}} />}
      </>;
    }
    await act(async () => root.render(<Harness />));
    const options = () => [...host.querySelectorAll('[role="option"]')];
    const input = host.querySelector("input")!;
    const key = async (key: string) => act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
    expect(options()).toHaveLength(1);
    expect(options()[0].textContent).toContain("Text width.md");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Settings"]')!.click());
    expect(options()).toHaveLength(2);
    expect(options().some(row => row.textContent?.includes("Text width.md"))).toBe(false);
    await key("Enter");
    expect(host.querySelector("h1")?.textContent).toBe("Text width");
    expect(host.querySelector("input")).toBeNull();
    const select = host.querySelector("select")!;
    expect(select.value).toBe("default");
    expect(document.activeElement).toBe(select);
    expect(setWidth).not.toHaveBeenCalled();
    await act(async () => { select.value = "wide"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(setWidth).toHaveBeenCalledWith("wide");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Current: Wide");
    expect(host.querySelector("dialog")).not.toBeNull();
    await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(host.querySelector("dialog")).toBeNull();
    expect(getActiveText).not.toHaveBeenCalled();
    expect(searchNotes).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("places matching settings after file matches and preserves keyboard order", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const run = vi.fn(), open = vi.fn();
  try {
    await act(async () => root.render(<Palette folders={[{ root: "/notes", name: "Notes", files: [{ name: "Width.md", path: "Width.md" }] }]}
      commands={[{ id: "width", label: "Text width", description: "Change width", run }]}
      activeNote={null} getActiveText={() => ""} scope="everywhere" onScopeChange={() => {}}
      onNavigateCurrent={() => {}} onClose={() => {}} onOpen={open} />));
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "width");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const options = [...host.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain("Width.md");
    expect(options[1].textContent).toContain("Text width");
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(open).toHaveBeenCalledWith("/notes", "Width.md", undefined, undefined);
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(run).toHaveBeenCalledOnce();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Files"]')!.click());
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps toggle configuration open, reports save failures, and links to all settings", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(), openSettings = vi.fn();
  function Harness() {
    const [value, setValue] = useState(true);
    const command = toggleSetting("numbers", "Line numbers", value, next => { setValue(next); change(next); });
    return <SettingDialog configuration={command.configuration!} storageError={true} onClose={() => {}} onOpenSettings={openSettings} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const select = host.querySelector("select")!;
    expect(select.value).toBe("on");
    await act(async () => { select.value = "off"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(change).toHaveBeenCalledWith(false);
    expect(select.value).toBe("off");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("could not be saved");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "All settings")!.click());
    expect(openSettings).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
