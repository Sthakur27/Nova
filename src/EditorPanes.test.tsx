// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import EditorPanes from "./EditorPanes";
import { initialPane, movePaneTab, reconcilePanes, type PaneNode } from "./paneLayout";

it("keeps existing editors mounted when nesting splits and routes group focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container), mounted = vi.fn(), unmounted = vi.fn(), activate = vi.fn(() => true), resize = vi.fn();
  function Document({ id }: { id: string }) {
    const [text, setText] = useState(id);
    useEffect(() => { mounted(id); return () => unmounted(id); }, [id]);
    return <input aria-label={id} value={text} onChange={event => setText(event.target.value)} />;
  }
  const render = (layout: PaneNode) => <EditorPanes layout={layout} active="main" compact={false} onActivate={activate} onResize={resize}
    renderTabs={pane => <div>{pane.tabs.join(",")}</div>} renderDocument={pane => <Document id={pane.id} />} />;
  let layout = reconcilePanes(initialPane(), ["a", "b", "c"], "main");
  try {
    await act(async () => root.render(render(layout)));
    const original = container.querySelector('input[aria-label="main"]');
    layout = movePaneTab(layout, "b", "main", "right", null, "second");
    await act(async () => root.render(render(layout)));
    layout = movePaneTab(layout, "c", "main", "bottom", null, "third");
    await act(async () => root.render(render(layout)));
    expect(container.querySelector('input[aria-label="main"]')).toBe(original);
    expect(mounted.mock.calls.map(([id]) => id)).toEqual(["main", "second", "third"]);
    expect(unmounted).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="second"]')!.focus());
    expect(activate).toHaveBeenCalledWith("second");
    const separator = container.querySelector('[role="separator"]')!;
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(resize).toHaveBeenCalledWith("split-third", .55);
    layout = reconcilePanes(layout, ["a", "b"], "main");
    await act(async () => root.render(render(layout)));
    expect(container.querySelector('input[aria-label="main"]')).toBe(original);
    expect(unmounted).toHaveBeenCalledExactlyOnceWith("third");
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
