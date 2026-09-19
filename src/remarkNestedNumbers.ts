import type { Nodes, Root } from "mdast";
import type { Plugin } from "unified";

// CommonMark only lets an ordered list interrupt a paragraph at 1. The editor
// can produce nested items starting at other numbers when users indent a list.
// Recognize those inside existing list items, without relaxing ordinary prose
// or code. Equal-length parser input keeps all source/bookmark positions intact.
const remarkNestedNumbers: Plugin<[], Root> = function () {
  const parse = this.parser!;
  this.parser = (source, file) => {
    const original = parse(source, file) as Root;
    const replacements = new Map<number, string>();
    function find(node: Nodes, parent?: Nodes) {
      if (node.type === "paragraph" && parent?.type === "listItem") {
        const column = node.position?.start.column ?? 1;
        for (const child of node.children) {
          if (child.type !== "text" || !child.position) continue;
          const start = child.position.start.offset!;
          const end = child.position.end.offset!;
          const raw = source.slice(start, end);
          for (const match of raw.matchAll(/\n( +)(\d{1,9})([.)])[ \t]+/g)) {
            if (match[1].length < column - 1 || match[1].length > column + 2 || Number(match[2]) === 1) continue;
            const offset = start + match.index! + 1 + match[1].length;
            replacements.set(offset, `1${match[3]}${" ".repeat(match[2].length - 1)}`);
          }
        }
      }
      if ("children" in node) for (const child of node.children) find(child, node);
    }
    find(original);
    if (!replacements.size) return original;
    let normalized = source;
    for (const [offset, digits] of replacements)
      normalized = normalized.slice(0, offset) + digits + normalized.slice(offset + digits.length);
    const tree = parse(normalized, file) as Root;
    function restore(node: Nodes) {
      if (node.type === "list" && node.ordered && node.position) {
        const digits = /^\d+/.exec(source.slice(node.position.start.offset));
        if (digits) node.start = Number(digits[0]);
      }
      if ("children" in node) for (const child of node.children) restore(child);
    }
    restore(tree);
    return tree;
  };
};

export default remarkNestedNumbers;
