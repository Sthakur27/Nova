import type { Nodes, Root } from "mdast";
import type { Plugin } from "unified";

/** Carry the exact source character to the read-only checkbox UI. */
const remarkTaskOffsets: Plugin<[], Root> = () => (tree, file) => {
  const source = String(file);
  function visit(node: Nodes) {
    if (node.type === "listItem" && typeof node.checked === "boolean" && node.position) {
      const offset = node.position.start.offset!;
      const match = /^(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\]/.exec(source.slice(offset));
      if (match) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, "data-task-offset": offset + match[0].length - 2 } };
    }
    if ("children" in node) node.children.forEach(visit);
  }
  visit(tree);
};
export default remarkTaskOffsets;
