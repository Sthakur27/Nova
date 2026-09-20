import type { EditorMode } from "./folders";
import { supportsDocumentView } from "./documentLimits";
export const isMarkdownFile = (path: string) => /\.(md|markdown|mdx)$/i.test(path);
export const paneMode = (mode: EditorMode, path: string): EditorMode => mode === "edit" && !isMarkdownFile(path) ? "source" : mode;
export type PaneView = { path: string; mode: EditorMode; length: number };

/** Plain text has one editing view; it is compatible with both Markdown editing modes. */
export function paneToolbar(views: PaneView[]) {
  const markdown = views.filter(view => isMarkdownFile(view.path));
  return {
    hasMarkdown: markdown.length > 0,
    hasFormatting: markdown.some(view => view.mode !== "read"),
    hasLineNumbers: views.some(view => view.mode !== "read" && !(isMarkdownFile(view.path) && view.mode === "edit" && supportsDocumentView(view.length))),
    read: views.length > 0 && views.every(view => view.mode === "read"),
    edit: views.length > 0 && views.every(view => view.mode !== "read" && (!isMarkdownFile(view.path) || view.mode === "edit")),
    source: markdown.length > 0 && views.every(view => view.mode !== "read" && (!isMarkdownFile(view.path) || view.mode === "source")),
  };
}
