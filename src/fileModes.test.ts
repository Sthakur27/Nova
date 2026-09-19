import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileMode, saveFileMode } from "./fileModes";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("remembers choices across files and folders without mixing extensions", () => {
  saveFileMode("notes/one.md", "read");
  saveFileMode("notes/one.txt", "read");
  expect(readFileMode("elsewhere/TWO.MD")).toBe("read");
  expect(readFileMode("elsewhere/two.txt")).toBe("read");
  expect(readFileMode("notes/one.json")).toBe("source");
  saveFileMode("elsewhere/TWO.MD", "source");
  expect(readFileMode("notes/one.md")).toBe("source");
  expect(readFileMode("notes/one.txt")).toBe("read");
  saveFileMode("notes/one.md", "edit");
  expect(readFileMode("three.md")).toBe("edit");
});

it("uses supported defaults and restores the legacy mode when provided", () => {
  expect(readFileMode("one.md")).toBe("edit");
  expect(readFileMode("one.txt")).toBe("source");
  expect(readFileMode("one.md", "read")).toBe("read");
  localStorage.setItem("nova:file-mode:.md:v1", "invalid");
  expect(readFileMode("one.md")).toBe("edit");
});

it("handles extensionless names, dotted directories, and unavailable storage", () => {
  saveFileMode("folder.md/README", "read");
  expect(readFileMode("another/LICENSE")).toBe("read");
  expect(readFileMode("another/file.md")).toBe("edit");
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("unavailable"); } });
  expect(readFileMode("one.md")).toBe("edit");
});
