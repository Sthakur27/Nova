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

it.each(["files", "passages"] as const)("shows only expanded Cloud %s without headings and preserves mixed-window preferences", async view => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const key = `nova:bookmarks-${view}-cloud-collapsed:v1`;
  localStorage.setItem(key, "on");
  const host = document.createElement("div"), root = createRoot(host);
  const items = [{name:"Cloud item",cloud:true},{name:"Local item",cloud:false}];
  const render = (cloudOnly: boolean, values = items) => <BookmarkSections cloudOnly={cloudOnly} view={view} items={values}
    isCloud={item => item.cloud} renderItem={item => <p key={item.name}>{item.name}</p>} emptyMessage="Nothing here yet."/>;
  try {
    await act(async () => root.render(render(false)));
    expect(host.querySelector<HTMLElement>(".bookmark-section-content")!.hidden).toBe(true);
    await act(async () => root.render(render(true)));
    expect(host.querySelector(".bookmark-section-toggle")).toBeNull();
    expect(host.querySelector("section")).toBeNull();
    expect(host.querySelector("[hidden]")).toBeNull();
    expect(host.textContent).toBe("Cloud item");
    expect(localStorage.getItem(key)).toBe("on");
    await act(async () => root.render(render(true, [items[1]])));
    expect(host.textContent).toBe("Nothing here yet.");
    await act(async () => root.render(render(false)));
    expect(host.querySelectorAll(".bookmark-section-toggle")).toHaveLength(2);
    expect(host.querySelector<HTMLElement>(".bookmark-section-content")!.hidden).toBe(true);
  } finally {
    await act(async () => root.unmount()); localStorage.clear(); vi.unstubAllGlobals();
  }
});
