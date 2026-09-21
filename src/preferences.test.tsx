import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { usePreference } from "./preferences";
import { DEFAULT_EXTENSION } from "./fileExtensions";
import { DEFAULT_GALAXY_PERFORMANCE, galaxyPerformanceModes, type GalaxyPerformance } from "./galaxyPerformance";

function ExtensionPreference() {
  const [extension] = usePreference<string>("default-extension", DEFAULT_EXTENSION);
  return <span>{extension}</span>;
}
afterEach(() => vi.unstubAllGlobals());
it("uses Markdown initially and restores a custom extension on a fresh mount", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
  expect(renderToStaticMarkup(<ExtensionPreference />)).toBe("<span>.md</span>");
  values.set("nova:default-extension:v1", ".custom");
  expect(renderToStaticMarkup(<ExtensionPreference />)).toBe("<span>.custom</span>");
});

function GalaxyPreference() {
  const [mode] = usePreference<GalaxyPerformance>("galaxy-performance", DEFAULT_GALAXY_PERFORMANCE, galaxyPerformanceModes);
  return <span>{mode}</span>;
}
it("defaults Galaxy performance to high and restores valid saved modes", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
  expect(renderToStaticMarkup(<GalaxyPreference />)).toBe("<span>high</span>");
  values.set("nova:galaxy-performance:v1", "saver");
  expect(renderToStaticMarkup(<GalaxyPreference />)).toBe("<span>saver</span>");
  values.set("nova:galaxy-performance:v1", "invalid");
  expect(renderToStaticMarkup(<GalaxyPreference />)).toBe("<span>high</span>");
});
