// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import Palette from "./Palette";
import { searchPreferencesKey } from "./useSearchPreferences";

beforeEach(() => localStorage.clear());

it("updates live results with matching controls and keeps collapsed exclusions active", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const click = async (label: string) => act(async () => {
    (host.querySelector(`[aria-label="${label}"]`) ?? [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label)))!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const type = async (input: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const count = () => host.querySelectorAll('[role="option"]').length;
  try {
    await act(async () => root.render(<Palette folders={[{ root: "demo", name: "Notes", files: [{ path: "draft.md", name: "draft.md" }] }]}
      activeNote={{ root: "demo", path: "draft.md", bookmarks: [] }} getActiveText={() => "Cat cat cats cot"}
      scope="current" onScopeChange={() => {}} onNavigateCurrent={() => {}} onClose={() => {}} onOpen={() => {}} />));
    await click("Text");
    const input = host.querySelector("input")!;
    await type(input, "cat"); expect(count()).toBe(3);
    await click("Match case"); expect(count()).toBe(2);
    await click("Match whole word"); expect(count()).toBe(1);
    await click("Use regular expression");
    await type(input, "c[ao]t"); expect(count()).toBe(2);
    await type(input, "["); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Invalid regular expression");
    await type(input, "cat");
    await click("Advanced search");
    await type(host.querySelectorAll("input")[2], "*.md"); expect(count()).toBe(0);
    await click("Advanced search"); expect(count()).toBe(0);
    expect(host.textContent).toContain("Filters active");
    expect(host.querySelector('[aria-expanded="false"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("restores workspace preferences on reopen and keeps other workspaces independent", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = async (roots: string[], initialFilter: "All" | "Files" = "All") => act(async () => root.render(
    <Palette folders={roots.map(folder => ({ root: folder, name: folder, files: [{ path: "note.md", name: "note.md" }] }))}
      initialFilter={initialFilter} activeNote={null} getActiveText={() => ""} scope="everywhere"
      onScopeChange={() => {}} onNavigateCurrent={() => {}} onClose={() => {}} onOpen={() => {}} />,
  ));
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const click = async (element: HTMLElement) => act(async () => element.click());
  const type = async (input: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const assertRestored = () => {
    for (const label of ["Match case", "Match whole word", "Use regular expression"])
      expect(button(label).getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[aria-expanded="true"]')).not.toBeNull();
    expect(host.querySelectorAll("input")[1].value).toBe("*.md");
    expect(host.querySelectorAll("input")[2].value).toBe("archive/**");
  };
  try {
    await render(["/a", "/b"]);
    await click(host.querySelector('[aria-controls="palette-advanced-fields"]')!);
    await type(host.querySelectorAll("input")[1], "*.md");
    await type(host.querySelectorAll("input")[2], "archive/**");
    for (const label of ["Match case", "Match whole word", "Use regular expression"]) await click(button(label));
    await act(async () => root.render(null));
    // A different entry point and folder order still use the same preferences.
    await render(["/b", "/a"], "Files");
    assertRestored();
    // Changing workspaces while mounted must not copy the old settings over.
    await render(["/other"]);
    expect(button("Match case").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector('[aria-expanded="false"]')).not.toBeNull();
    await click(host.querySelector('[aria-controls="palette-advanced-fields"]')!);
    await type(host.querySelectorAll("input")[2], "*.txt");
    await render(["/a", "/b"]);
    assertRestored();
    // Explicitly clearing filters must also persist, including collapsed state.
    await type(host.querySelectorAll("input")[2], "");
    await click(host.querySelector('[aria-controls="palette-advanced-fields"]')!);
    await act(async () => root.render(null));
    await render(["/a", "/b"]);
    expect(host.querySelector('[aria-expanded="false"]')).not.toBeNull();
    await click(host.querySelector('[aria-controls="palette-advanced-fields"]')!);
    expect(host.querySelectorAll("input")[2].value).toBe("");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it.each(["{broken", JSON.stringify({ options: { caseSensitive: "false", include: 123, exclude: "*.log" }, advanced: true })])(
  "recovers safely from malformed saved preferences: %s", async (stored) => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.setItem(searchPreferencesKey(["/a"]), stored);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Palette folders={[{ root: "/a", name: "A", files: [] }]}
        activeNote={null} getActiveText={() => ""} scope="everywhere" onScopeChange={() => {}}
        onNavigateCurrent={() => {}} onClose={() => {}} onOpen={() => {}} />));
      expect(host.querySelector('[aria-label="Match case"]')?.getAttribute("aria-pressed")).toBe("false");
      if (stored.startsWith("{\"")) {
        expect(host.querySelectorAll("input")[1].value).toBe("");
        expect(host.querySelectorAll("input")[2].value).toBe("*.log");
      }
    } finally { await act(async () => root.unmount()); host.remove(); }
  },
);
