import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { usePreference } from "./preferences";

function ExtensionPreference() {
  const [extension] = usePreference<string>("default-extension", ".txt");
  return <span>{extension}</span>;
}
afterEach(() => vi.unstubAllGlobals());
it("uses txt initially and restores a custom extension on a fresh mount", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
  expect(renderToStaticMarkup(<ExtensionPreference />)).toBe("<span>.txt</span>");
  values.set("nova:default-extension:v1", ".custom");
  expect(renderToStaticMarkup(<ExtensionPreference />)).toBe("<span>.custom</span>");
});
