// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import CreateMenu from "./CreateMenu";

it("navigates creation choices, dismisses with Escape or outside clicks, and restores focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const onFile = vi.fn(), onFolder = vi.fn();
  try {
    await act(async () => root.render(<CreateMenu label="Create in Cloud" onFile={onFile} onFolder={onFolder}/>));
    const trigger = host.querySelector("button")!;
    await act(async () => trigger.click());
    expect(onFile).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("New file");
    const menu = document.querySelector('[role="menu"]')!;
    await act(async () => menu.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowDown",bubbles:true})));
    expect(document.activeElement?.textContent).toBe("New folder");
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(onFolder).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true})));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", {bubbles:true})));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
