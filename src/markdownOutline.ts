import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Nodes } from "mdast";

export type OutlineHeading = { title: string; level: number; from: number; line: number };
const parser = unified().use(remarkParse).use(remarkGfm);

function label(node: Nodes): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  if (node.type === "break") return " ";
  if ("children" in node) return node.children.map(label).join("");
  return "";
}

/** Source offsets remain distinct even for duplicate titles, nested blocks and CRLF. */
export function headingOutline(text: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const visit = (node: Nodes) => {
    if (node.type === "heading" && node.position?.start.offset !== undefined) {
      headings.push({ title: label(node).replace(/\s+/g, " ").trim() || "Untitled heading", level: node.depth,
        from: node.position.start.offset, line: node.position.start.line });
    }
    if ("children" in node) node.children.forEach(visit);
  };
  visit(parser.parse(text));
  return headings;
}
