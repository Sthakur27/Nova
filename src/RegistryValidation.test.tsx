// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import RegistryValidation from "./RegistryValidation";
import { invoke } from "./resetLocalState";
vi.mock("./resetLocalState", () => ({invoke: vi.fn()}));
it("shows inline validation in the editor and clears errors after fixing the text without saving", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  const host = document.createElement("div"), root = createRoot(host);
  vi.mocked(invoke).mockRejectedValueOnce("Invalid JSON: line 1 column 2").mockResolvedValue(null);
  try {
    await act(async () => root.render(<RegistryValidation root="/notes" text="{" revision="original"/>));
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(host.textContent).toContain("Cannot save: Invalid JSON");
    expect(invoke).toHaveBeenCalledWith("validate_registry_document", {root: "/notes", text: "{", revision: "original"});
    await act(async () => root.render(<RegistryValidation root="/notes" text="{}" revision="original"/>));
    expect(host.textContent).toContain("Validating");
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(host.textContent).toContain(".nova is valid");
    expect(host.querySelector("dialog")).toBeNull();
    expect(vi.mocked(invoke).mock.calls.every(([command]) => command === "validate_registry_document")).toBe(true);
  } finally { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
