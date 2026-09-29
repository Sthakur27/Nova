import type { EditorMode } from "./folders";
import { supportsDocumentView } from "./documentLimits";
export const isMarkdownFile = (path: string) => /\.(md|markdown|mdx)$/i.test(path);
export const paneMode = (mode: EditorMode, path: string): EditorMode => mode === "edit" && !isMarkdownFile(path) ? "source" : mode;
/** Large Markdown notes retain the chunked reader when rich editing is unavailable. */
export const readModeAvailable = (showReadMode: boolean, path: string, length: number) =>
  showReadMode || (isMarkdownFile(path) && !supportsDocumentView(length));
export const availablePaneMode = (mode: EditorMode, path: string, length: number, showReadMode: boolean): EditorMode =>
  paneMode(mode === "edit" && !supportsDocumentView(length) ? "source"
    : mode === "read" && !readModeAvailable(showReadMode, path, length) ? "edit" : mode, path);
export type PaneView = { path: string; mode: EditorMode; length: number };

/** Plain text has one editing view; it is compatible with both Markdown editing modes. */
export function paneToolbar(views: PaneView[]) {
  const markdown = views.filter(view => isMarkdownFile(view.path));
  const richMarkdown = markdown.filter(view => supportsDocumentView(view.length));
  const hasEdit = views.length > 0 && (markdown.length === 0 || richMarkdown.length > 0);
  return {
    hasMarkdown: markdown.length > 0,
    hasEdit,
    hasFormatting: markdown.some(view => view.mode !== "read"),
    hasLineNumbers: views.some(view => view.mode !== "read" && !(isMarkdownFile(view.path) && view.mode === "edit" && supportsDocumentView(view.length))),
    read: views.length > 0 && views.every(view => view.mode === "read"),
    edit: hasEdit && views.length > 0 && views.every(view => view.mode !== "read" && (!isMarkdownFile(view.path) || !supportsDocumentView(view.length) || view.mode === "edit")),
    source: markdown.length > 0 && views.every(view => view.mode !== "read" && (!isMarkdownFile(view.path) || !supportsDocumentView(view.length) || view.mode === "source")),
  };
}
