// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useTooltips } from "./useTooltips";
import { usePreference } from "./preferences";

it("persists the switch and suppresses dynamic native and portal hints, restoring current titles", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  function Harness() {
    const [enabled, setEnabled] = usePreference<boolean>("tooltips", true);
    useTooltips(enabled);
    return <button aria-label="Show tooltips" role="switch" aria-checked={enabled}
      onClick={() => setEnabled(!enabled)}>Toggle</button>;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const control = document.createElement("button");
  control.title = "Open terminal";
  control.setAttribute("aria-label", "Terminal");
  document.body.append(control);
  const portal = document.createElement("span");
  portal.setAttribute("role", "tooltip");
  document.body.append(portal);
  try {
    await act(async () => root.render(<Harness />));
    expect(control.title).toBe("Open terminal");
    await act(async () => host.querySelector("button")!.click());
    expect(control.hasAttribute("title")).toBe(false);
    expect(control.getAttribute("aria-label")).toBe("Terminal");
    expect(portal.matches('body[data-tooltips="hidden"] [role="tooltip"]')).toBe(true);
    expect(localStorage.getItem("nova:tooltips:v1")).toBe("off");
    await act(async () => {
      control.title = "Temporary";
      control.title = "Close terminal";
      const dynamic = document.createElement("a");
      dynamic.title = "Note link";
      control.append(dynamic);
    });
    expect(control.hasAttribute("title")).toBe(false);
    expect(control.firstElementChild!.hasAttribute("title")).toBe(false);
    await act(async () => root.render(null));
    expect(control.title).toBe("Close terminal");
    await act(async () => root.render(<Harness />));
    expect(host.querySelector("button")!.getAttribute("aria-checked")).toBe("false");
    expect(control.hasAttribute("title")).toBe(false);
    await act(async () => host.querySelector("button")!.click());
    expect(control.title).toBe("Close terminal");
    expect(control.firstElementChild!.getAttribute("title")).toBe("Note link");
    expect(document.body.dataset.tooltips).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove(); control.remove(); portal.remove(); localStorage.clear();
  }
});
