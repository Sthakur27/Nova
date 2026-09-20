// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useDriveConnection, type DriveConnection } from "./useDriveConnection";
vi.mock("./platform", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
it("tracks browser sign-in, blocks duplicate requests, and updates connected account and disconnect", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const off = { connected: false, configured: true, email: null };
  vi.mocked(invoke).mockResolvedValueOnce(off);
  let drive!: DriveConnection;
  function Harness() { drive = useDriveConnection(); return null; }
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    expect(drive.checking).toBe(false);
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let request!: Promise<void>;
    await act(async () => { request = drive.connect(); void drive.connect(); });
    expect(drive.busy).toBe(true);
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === "drive_connect")).toHaveLength(1);
    await act(async () => { finish({ ...off, connected: true, email: "test@example.com" }); await request; });
    expect(drive.status.email).toBe("test@example.com");
    expect(drive.busy).toBe(false);
    vi.mocked(invoke).mockResolvedValueOnce(off);
    await act(async () => { await drive.disconnect(); });
    expect(drive.status.connected).toBe(false);
    vi.mocked(invoke).mockRejectedValueOnce("Google sign-in cancelled.");
    await act(async () => { await drive.connect(); });
    expect(drive.error).toContain("cancelled");
    expect(drive.busy).toBe(false);
  } finally { await act(async () => root.unmount()); }
});
