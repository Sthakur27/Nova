// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Explorer from "./Explorer";
import type { Workspace } from "./model";

it("opens a file on the first mouse click and preserves keyboard activation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const folder: Workspace = {
    root: "/notes", name: "Notes", collapsed: false, files: [{ name: "a.md", path: "a.md" }],
  };
  const onOpen = vi.fn();
  const noop = () => {};
  try {
    await act(async () => root.render(<Explorer folders={[folder]} activeRoot="" activePath=""
      onOpen={onOpen} onRename={noop} onStar={noop} onFileAction={noop}
      onChange={noop} onRemove={noop} onRefresh={noop} onAdd={noop} externalDrag={false} />));
    const file = container.querySelector<HTMLButtonElement>(".file-open")!;
    await act(async () => { file.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); });
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(folder, "a.md");
    await act(async () => {
      file.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      file.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () => { file.click(); });
    expect(onOpen).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
