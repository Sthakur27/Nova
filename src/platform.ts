import { isTauri } from "@tauri-apps/api/core";

declare const __NOVA_TARGET__: string;
const target = typeof __NOVA_TARGET__ === "undefined" ? "desktop" : __NOVA_TARGET__;
export const native = isTauri();
export const mobile = native && (target === "ios" || target === "android");
export const desktop = native && !mobile;
// Windows blur affects the entire window and is unreliable on newer Windows 11 builds.
export const supportsFrosted = !mobile && !/win/i.test(navigator.platform);

export const driveSupported = desktop || (native && target === "ios");
