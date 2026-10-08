// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ native: true }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => runtime.native }));
afterEach(() => {
  delete window.__NOVA_NATIVE_PLATFORM__;
  runtime.native = true;
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(["ios", "android"] as const)("uses the %s shell even with desktop-built assets", async target => {
  vi.stubGlobal("__NOVA_TARGET__", "desktop");
  window.__NOVA_NATIVE_PLATFORM__ = target;
  const platform = await import("./platform");
  expect(platform.mobile).toBe(true);
  expect(platform.desktop).toBe(false);
  expect(platform.supportsFrosted).toBe(false);
  expect(platform.driveSupported).toBe(target === "ios");
});

it("retains the iOS build target for older shells", async () => {
  vi.stubGlobal("__NOVA_TARGET__", "ios");
  const platform = await import("./platform");
  expect(platform.mobile).toBe(true);
  expect(platform.driveSupported).toBe(true);
});

it("keeps desktop native behavior when no mobile shell is present", async () => {
  vi.stubGlobal("__NOVA_TARGET__", "desktop");
  const platform = await import("./platform");
  expect(platform.desktop).toBe(true);
  expect(platform.mobile).toBe(false);
  expect(platform.driveSupported).toBe(true);
});

it("does not enable native commands in a browser preview", async () => {
  runtime.native = false;
  vi.stubGlobal("__NOVA_TARGET__", "ios");
  const platform = await import("./platform");
  expect(platform.mobile).toBe(false);
  expect(platform.desktop).toBe(false);
  expect(platform.driveSupported).toBe(false);
});
