import type { EditorMode } from "./folders";

function modeKey(path: string) {
  const name = path.split(/[\\/]/).at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : "extensionless";
  return `nova:file-mode:${extension}:v1`;
}

export function readFileMode(path: string, fallback: EditorMode = "edit"): EditorMode {
  let mode = fallback;
  try {
    const stored = localStorage.getItem(modeKey(path));
    if (stored === "source" || stored === "edit" || stored === "read") mode = stored;
  } catch { /* Storage may be unavailable; retain a usable default. */ }
  return mode === "edit" && !/\.(md|markdown|mdx)$/i.test(path) ? "source" : mode;
}

export function saveFileMode(path: string, mode: EditorMode) {
  localStorage.setItem(modeKey(path), mode);
}
