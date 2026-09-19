import type { Root, RootContent } from "hast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";

const PAGE_SIZE = 24_000;
export type ReadPage = { tree: Root; line: number; endLine: number };

// Parse the entire document so references, tables and footnotes retain their
// meaning. Pagination happens only after Markdown has become a syntax tree.
export function buildReadPages(text: string, markdown: boolean): ReadPage[] {
  if (!markdown) {
    const pages: ReadPage[] = [];
    let children: RootContent[] = [];
    let size = 0;
    let startLine = 1;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      children.push({ type: "element", tagName: "div", properties: { "data-line": i + 1 }, children: [{ type: "text", value: lines[i] || "\u00a0" }] });
      size += lines[i].length + 1;
      if (size >= PAGE_SIZE || children.length >= 300 || i === lines.length - 1) {
        pages.push({ line: startLine, endLine: i + 1, tree: { type: "root", children } });
        children = [];
        size = 0;
        startLine = i + 2;
      }
    }
    return pages;
  }
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: true });
  const tree = processor.runSync(processor.parse(text)) as Root;
  const pages: ReadPage[] = [];
  let children: RootContent[] = [];
  let size = 0;
  let line = 1;
  let endLine = 1;
  for (const child of tree.children) {
    const length = child.position ? (child.position.end.offset ?? 0) - (child.position.start.offset ?? 0) : 1;
    if (children.length && (size + length > PAGE_SIZE || children.length >= 150)) {
      pages.push({ tree: { type: "root", children }, line, endLine });
      children = [];
      size = 0;
    }
    if (!children.length) line = child.position?.start.line ?? endLine;
    children.push(child);
    size += length;
    endLine = child.position?.end.line ?? endLine;
  }
  if (children.length || !pages.length) pages.push({ tree: { type: "root", children }, line, endLine });
  return pages;
}

export function pageForLine(pages: ReadPage[], line: number): number {
  const containing = pages.findIndex(page => page.line <= line && page.endLine >= line);
  if (containing >= 0) return containing;
  for (let i = pages.length - 1; i >= 0; i--) if (pages[i].line <= line) return i;
  return 0;
}
