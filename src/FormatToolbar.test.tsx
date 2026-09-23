// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FormatToolbar from "./FormatToolbar";

it("exposes separate inline and block code controls with active and disabled states", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const mount = document.createElement("div");
  const root = createRoot(mount);
  const onFormat = vi.fn();
  const props = { onFormat, style: "paragraph" as const, onUndo: vi.fn(), onRedo: vi.fn() };
  try {
    await act(async () => root.render(<FormatToolbar {...props} active={["codeBlock"]} />));
    const block = mount.querySelector<HTMLButtonElement>('button[aria-label="Code block"]')!;
    expect(block.getAttribute("aria-pressed")).toBe("true");
    expect(mount.querySelector('button[aria-label="Inline code"]')?.getAttribute("aria-pressed")).toBe("false");
    await act(async () => block.click());
    expect(onFormat).toHaveBeenCalledWith("codeBlock");
    await act(async () => root.render(<FormatToolbar {...props} formattingDisabled />));
    expect(block.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
