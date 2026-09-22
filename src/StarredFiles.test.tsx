// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import StarredFiles from "./StarredFiles";
import type { Workspace } from "./model";

it("navigates stars in unopened directories and distinguishes the same path across roots", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const host = document.createElement("div"), root = createRoot(host);
  const local: Workspace = { root: "/local", name: "Local", files: [], starred: ["deep/note.md"] };
  const cloud: Workspace = { root: "/cloud", name: "Cloud", cloudSpace: { id: "cloud", name: "Cloud", account: "account" }, files: [], starred: ["deep/note.md"] };
  const onOpen = vi.fn(), onStar = vi.fn();
  try {
    await act(async () => root.render(<StarredFiles folders={[local, cloud]} activeRoot={cloud.root}
      activePath="deep/note.md" onOpen={onOpen} onStar={onStar} />));
    const buttons = host.querySelectorAll<HTMLButtonElement>(".starred-file-open");
    expect(buttons).toHaveLength(2);
    expect(buttons[1].hasAttribute("aria-current")).toBe(false);
    expect(buttons[0].getAttribute("aria-current")).toBe("page");
    await act(async () => buttons[1].click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(local, "deep/note.md");
    await act(async () => host.querySelectorAll<HTMLButtonElement>('[aria-label="Unstar deep/note.md"]')[0].click());
    expect(onStar).toHaveBeenCalledExactlyOnceWith(cloud, "deep/note.md", false);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      buttons[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    });
    expect(onOpen.mock.calls.slice(1)).toEqual([
      [local, "deep/note.md"],
      [local, "deep/note.md", true],
    ]);
    await act(async () => buttons[1].click());
    expect(onOpen).toHaveBeenLastCalledWith(local, "deep/note.md");
    await act(async () => root.render(<StarredFiles folders={[{ ...local, starred: [], starsError: "Could not read stars" }]}
      activeRoot={local.root} activePath="" onOpen={onOpen} onStar={onStar} />));
    expect(host.querySelector(".empty-bookmarks")?.textContent).toContain("breadcrumb bar");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Could not read stars");
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
