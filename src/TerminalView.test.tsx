// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), dispose: vi.fn(), focus: vi.fn() }));
vi.mock("./storage", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke, Channel: class { onmessage = () => {}; } }));
vi.mock("@xterm/xterm", () => ({ Terminal: class {
  cols = 80; rows = 24;
  loadAddon() {} open() {} write() {} writeln() {}
  onData() { return { dispose() {} }; }
  focus = mocks.focus;
  dispose = mocks.dispose;
} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
import TerminalView from "./TerminalView";

it("keeps the shell alive across collapse and closes it even when unmounted during startup", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  let started!: () => void;
  mocks.invoke.mockImplementation((command: string) => command === "terminal_open" ? new Promise<void>(resolve => { started = resolve; }) : Promise.resolve());
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TerminalView root="/notes" open />));
    await act(async () => root.render(<TerminalView root="/notes" open={false} />));
    await act(async () => root.render(<TerminalView root="/notes" open />));
    expect(mocks.invoke.mock.calls.filter(([command]) => command === "terminal_open")).toHaveLength(1);
    expect(mocks.invoke).not.toHaveBeenCalledWith("terminal_close", expect.anything());
    await act(async () => root.unmount());
    await act(async () => started());
    const args = mocks.invoke.mock.calls.find(([command]) => command === "terminal_open")![1];
    expect(args.root).toBe("/notes");
    expect(mocks.invoke).toHaveBeenCalledWith("terminal_close", { id: args.id });
    expect(mocks.dispose).toHaveBeenCalledOnce();
  } finally { container.remove(); vi.unstubAllGlobals(); }
});
