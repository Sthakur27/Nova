// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "./App";
import { RICH_DOCUMENT_LIMIT } from "./documentLimits";
import { saveFileMode } from "./fileModes";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

it.each([false, true])("shows only Source and Read for a large note with Read preference %s", async showReadMode => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  localStorage.clear();
  localStorage.setItem("nova:show-read-mode:v1", showReadMode ? "on" : "off");
  localStorage.setItem("nova-demo-v1:Getting started.md", "# Large note\n\n" + "A paragraph.\n\n".repeat(Math.ceil(RICH_DOCUMENT_LIMIT / 14)));
  saveFileMode("Getting started.md", "edit");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`.view-switch button[aria-label="${label}"]`);
  try {
    await act(async () => root.render(<App />));
    expect(button("Edit")).toBeNull();
    expect(button("Read")).not.toBeNull();
    expect(button("Source")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Source")?.title).toContain("500,000 characters");
    expect(host.querySelector(".cm-editor")).not.toBeNull();
    expect(host.querySelector<HTMLElement>(".document-pane")?.hidden).toBe(true);
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals();
  }
});
