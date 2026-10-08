import { isTauri } from "@tauri-apps/api/core";

declare const __NOVA_TARGET__: string;
declare global {
  interface Window { __NOVA_NATIVE_PLATFORM__?: "ios" | "android" }
}
// Bundled assets can have been built outside the Tauri CLI (or reused by Xcode).
// The native shell is authoritative; viewport size only controls layout.
const shellTarget = typeof window === "undefined" ? undefined : window.__NOVA_NATIVE_PLATFORM__;
const target = shellTarget ?? (typeof __NOVA_TARGET__ === "undefined" ? "desktop" : __NOVA_TARGET__);
export const native = isTauri();
export const mobile = native && (target === "ios" || target === "android");
export const desktop = native && !mobile;
// Windows blur affects the entire window and is unreliable on newer Windows 11 builds.
export const supportsFrosted = !mobile && !/win/i.test(navigator.platform);

export const driveSupported = desktop || (native && target === "ios");
