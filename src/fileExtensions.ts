export const DEFAULT_EXTENSION = ".md";

export const commonExtensions = [
  [".md", "Markdown"],
  [".txt", "Plain text"],
  [".json", "JSON"],
  [".yaml", "YAML"],
  [".csv", "CSV"],
  [".html", "HTML"],
  [".css", "CSS"],
  [".js", "JavaScript"],
  [".ts", "TypeScript"],
  [".py", "Python"],
  [".xml", "XML"],
] as const;

export function normalizeExtension(value: string): string {
  const extension = value.trim().replace(/^\./, "");
  if (!extension || extension.length > 64 || /[\s/\\:*?"<>|\x00-\x1f\x7f]/.test(extension) ||
      extension.split(".").some(part => !part))
    throw new Error("Enter an extension such as .txt, .md, or .json without spaces or filename separators.");
  return `.${extension}`;
}

export function isUntitled(path: string): boolean {
  return /^Untitled(?: [2-9]\d*| 1\d+)?\..+$/.test(path.split("/").at(-1) ?? "");
}
