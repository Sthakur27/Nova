// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import useWebLayout from "./useWebLayout";

it("keeps the editor mounted in focus and lets dialogs consume Escape first", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const { focused, mobile, setFocused } = useWebLayout();
    return <div data-focused={focused} data-mobile={mobile}><button onClick={() => setFocused(!focused)}>Focus</button><textarea defaultValue="Unsaved text"/></div>;
  }
  try {
    await act(async () => root.render(<Harness/>));
    const editor = host.querySelector("textarea");
    await act(async () => host.querySelector("button")!.click());
    expect(host.firstElementChild?.getAttribute("data-focused")).toBe("true");
    expect(host.querySelector("textarea")).toBe(editor);
    const modal = document.createElement("dialog"); modal.open = true; host.append(modal);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    expect(host.firstElementChild?.getAttribute("data-focused")).toBe("true");
    modal.remove();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    expect(host.firstElementChild?.getAttribute("data-focused")).toBe("false");
    expect(host.querySelector("textarea")).toBe(editor);
    expect(editor?.value).toBe("Unsaved text");
    media.matches = false;
    await act(async () => media.addEventListener.mock.calls[0][1]());
    expect(host.firstElementChild?.getAttribute("data-mobile")).toBe("false");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
