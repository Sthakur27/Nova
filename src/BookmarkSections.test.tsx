// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import BookmarkSections from "./BookmarkSections";

it("groups passages by location and remembers each collapse independently from starred files", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const host = document.createElement("div"), root = createRoot(host);
  const items = [{ name: "Local passage", cloud: false }, { name: "Cloud passage", cloud: true }];
  const render = (view: "passages" | "files", values = items) => <BookmarkSections key={view} view={view} items={values}
    isCloud={item => item.cloud} renderItem={item => <p key={item.name}>{item.name}</p>} emptyMessage="Nothing here yet." />;
  const toggles = () => host.querySelectorAll<HTMLButtonElement>(".bookmark-section-toggle");
  const contents = () => host.querySelectorAll<HTMLElement>(".bookmark-section-content");
  try {
    await act(async () => root.render(render("passages")));
    expect(contents()[0].textContent).toBe("Cloud passage");
    expect(contents()[1].textContent).toBe("Local passage");
    await act(async () => toggles()[0].click());
    expect(toggles()[0].getAttribute("aria-expanded")).toBe("false");
    expect(contents()[0].hidden).toBe(true);
    expect(contents()[1].hidden).toBe(false);
    expect(toggles()[0].getAttribute("aria-controls")).toBe(contents()[0].id);
    await act(async () => root.render(render("files")));
    expect(contents()[0].hidden).toBe(false);
    await act(async () => root.render(render("passages", [items[0]])));
    expect(contents()[0].hidden).toBe(true);
    await act(async () => toggles()[0].click());
    expect(contents()[0].textContent).toBe("Nothing here yet.");
    await act(async () => toggles()[1].click());
    expect(contents()[1].hidden).toBe(true);
    expect(contents()[0].hidden).toBe(false);
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
