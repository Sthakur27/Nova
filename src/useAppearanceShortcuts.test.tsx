// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAppearanceShortcuts } from "./useAppearanceShortcuts";

afterEach(() => { vi.unstubAllGlobals(); });

it.each([true, false])("cycles supported modes without editing or losing focus (Mac: %s)", async mac => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let enabled = true;
  function Harness() {
    const [background, onBackground] = useState<"on" | "off" | "frosted">("on");
    const [frosted, onFrosted] = useState(false);
    const [galaxy, onGalaxy] = useState(false);
    useAppearanceShortcuts({ enabled, mac, supportsFrosted: mac, background, frosted, onBackground, onFrosted, onGalaxy });
    return <><textarea defaultValue="unchanged note" /><output data-background={background} data-frosted={frosted} data-galaxy={galaxy} /></>;
  }
  const press = async (key: string, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key, metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true, ...extra });
    await act(async () => document.activeElement!.dispatchEvent(event));
    return event;
  };
  try {
    await act(async () => root.render(<Harness />));
    const input = host.querySelector("textarea")!; input.focus(); input.setSelectionRange(3, 6);
    const editorBinding = vi.fn(); input.addEventListener("keydown", editorBinding);
    const output = host.querySelector("output")!;
    expect((await press("e")).defaultPrevented).toBe(true);
    expect(output.dataset.background).toBe("off");
    expect(output.dataset.galaxy).toBe("true");
    expect(editorBinding).not.toHaveBeenCalled();
    expect((await press("e", { repeat: true })).defaultPrevented).toBe(true);
    expect(output.dataset.background).toBe("off");
    await press("e"); expect(output.dataset.background).toBe(mac ? "frosted" : "on");
    if (mac) { await press("e"); expect(output.dataset.background).toBe("on"); }
    expect((await press("l")).defaultPrevented).toBe(mac);
    expect(output.dataset.frosted).toBe(String(mac));
    if (mac) {
      await press("l"); expect(output.dataset.frosted).toBe("false");
    }
    for (const extra of [{ shiftKey: true }, { altKey: true }, { isComposing: true },
      { metaKey: !mac, ctrlKey: mac }, { metaKey: true, ctrlKey: true }, { metaKey: false, ctrlKey: false }]) {
      expect((await press("e", extra)).defaultPrevented).toBe(false);
    }
    const dialog = document.createElement("dialog"); dialog.open = true; document.body.append(dialog);
    expect((await press("e")).defaultPrevented).toBe(false); dialog.remove();
    enabled = false; await act(async () => root.render(<Harness />));
    expect((await press("e")).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("unchanged note");
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 6]);
    await act(async () => root.unmount());
    expect((await press("e")).defaultPrevented).toBe(false);
  } finally { host.remove(); }
});
