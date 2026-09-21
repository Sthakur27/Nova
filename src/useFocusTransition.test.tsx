// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useFocusTransition } from "./useFocusTransition";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(enabled: boolean, reduced = false) {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let run!: ReturnType<typeof useFocusTransition>;
  function Harness() {
    run = useFocusTransition(enabled);
    return <div className="app-shell" />;
  }
  await act(async () => root.render(<Harness />));
  return { run, host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

it.each([[false, false], [true, true]])("updates immediately when enabled=%s and reduced motion=%s", async (enabled, reduced) => {
  const app = await setup(enabled, reduced);
  const update = vi.fn();
  try {
    app.run(true, update);
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.novaFocusFlight).toBeUndefined();
  } finally { await app.close(); }
});

it("cancels an interrupted capture without letting its cleanup erase the newer transition", async () => {
  const app = await setup(true);
  const captures: { update: () => void; finish: () => void; skip: ReturnType<typeof vi.fn> }[] = [];
  const original = document.startViewTransition;
  document.startViewTransition = vi.fn((update: () => void) => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const skip = vi.fn();
    captures.push({ update, finish, skip });
    return { ready: Promise.resolve(), finished, skipTransition: skip };
  }) as unknown as typeof document.startViewTransition;
  try {
    const oldUpdate = vi.fn();
    const newUpdate = vi.fn();
    app.run(true, oldUpdate);
    app.run(false, newUpdate);
    expect(captures[0].skip).toHaveBeenCalledOnce();
    captures[0].update();
    captures[1].update();
    expect(oldUpdate).not.toHaveBeenCalled();
    expect(newUpdate).toHaveBeenCalledOnce();
    await act(async () => captures[0].finish());
    expect(document.documentElement.dataset.novaFocusFlight).toBe("exit");
    await act(async () => captures[1].finish());
    expect(document.documentElement.dataset.novaFocusFlight).toBeUndefined();
    expect(app.host.querySelector(".app-shell")?.hasAttribute("data-focus-flight")).toBe(false);
  } finally { document.startViewTransition = original; await app.close(); }
});

it("still updates focus on webviews without view transitions", async () => {
  const app = await setup(true);
  const update = vi.fn();
  try {
    await act(async () => app.run(true, update));
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.novaFocusFlight).toBeUndefined();
  } finally { await app.close(); }
});
