import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Nodes, Root, Definition } from "mdast";
import type { JSONContent } from "@tiptap/core";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { diffChars } from "diff";
import remarkNestedNumbers from "./remarkNestedNumbers";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkNestedNumbers);
export function markdownTree(source: string): Root {
  const tree = parser.parse(source);
  // CommonMark groups adjacent tasks and bullets into one list, even across a
  // blank line. Keep the rich editor's distinct containers on reload/undo so
  // task rows never inherit the indentation of an ordinary bullet list.
  function splitLists(node: Nodes): Nodes[] {
    if ("children" in node) node.children = node.children.flatMap(splitLists) as typeof node.children;
    if (node.type !== "list" || node.ordered) return [node];
    const runs: typeof node[] = [];
    for (const item of node.children) {
      const previous = runs.at(-1);
      const isTask = typeof item.checked === "boolean";
      if (previous && (typeof previous.children[0].checked === "boolean") === isTask) {
        previous.children.push(item);
        if (previous.position && item.position) previous.position.end = item.position.end;
      } else {
        runs.push({ ...node, children: [item], position: item.position ? { ...item.position } : undefined });
      }
    }
    return runs;
  }
  splitLists(tree);
  return tree;
}

export function parseDocument(source: string) {
  const tree = markdownTree(source);
  const definitions = new Map<string, Definition>();
  for (const node of tree.children) if (node.type === "definition") definitions.set(node.identifier, node);
  const inline = (nodes: Nodes[]): JSONContent[] => nodes.flatMap(node => {
    if (node.type === "text") return node.value ? [{ type: "text", text: node.value.replace(/\r?\n/g, " ") }] : [];
    if (node.type === "break") return [{ type: "hardBreak" }];
    if (node.type === "inlineCode") return [{ type: "text", text: node.value, marks: [{ type: "code" }] }];
    if (node.type === "image" || node.type === "imageReference") {
      const ref = node.type === "imageReference" ? definitions.get(node.identifier) : node;
      return [{ type: "image", attrs: { src: ref?.url ?? "", alt: node.alt, title: ref?.title } }];
    }
    if ("children" in node) {
      const content = inline(node.children);
      const types: Record<string, string> = { strong: "bold", emphasis: "italic", delete: "strike", link: "link", linkReference: "link" };
      const type = types[node.type];
      const link = node.type === "linkReference" ? definitions.get(node.identifier) : node.type === "link" ? node : undefined;
      return type ? content.map(child => ({ ...child, marks: [...(child.marks ?? []), { type, ...(link ? { attrs: { href: link.url, title: link.title } } : {}) }] })) : content;
    }
    return [];
  });
  const block = (node: Nodes): JSONContent => {
    switch (node.type) {
      case "paragraph": return { type: "paragraph", content: inline(node.children) };
      case "heading": return { type: "heading", attrs: { level: node.depth }, content: inline(node.children) };
      case "blockquote": return { type: "blockquote", content: node.children.map(block) };
      case "code": return { type: "codeBlock", attrs: { language: node.lang }, content: node.value ? [{ type: "text", text: node.value }] : [] };
      case "thematicBreak": return { type: "horizontalRule" };
      case "list": {
        const tasks = node.children.every(item => typeof item.checked === "boolean");
        return { type: tasks ? "taskList" : node.ordered ? "orderedList" : "bulletList", attrs: node.ordered ? { start: node.start ?? 1 } : undefined,
          content: node.children.map(item => ({ type: typeof item.checked === "boolean" ? "taskItem" : "listItem", attrs: typeof item.checked === "boolean" ? { checked: item.checked } : undefined, content: item.children.map(block) })) };
      }
      case "table": return { type: "table", content: node.children.map((row, i) => ({ type: "tableRow", content: row.children.map((cell, col) => ({ type: i === 0 ? "tableHeader" : "tableCell", attrs: { align: node.align?.[col] ?? null }, content: [{ type: "paragraph", content: inline(cell.children) }] })) })) };
      default: return { type: "rawMarkdown", attrs: { source: source.slice(node.position?.start.offset, node.position?.end.offset) } };
    }
  };
  // Unsupported constructs remain intact, including when editing nearby blocks.
  function supported(node: Nodes): boolean {
    if (["html", "footnoteReference", "footnoteDefinition", "definition"].includes(node.type)) return false;
    return !("children" in node) || node.children.every(supported);
  }
  const parts = tree.children.map((node, i) => ({
    node: supported(node) ? block(node) : { type: "rawMarkdown", attrs: { source: source.slice(node.position?.start.offset, node.position?.end.offset) } },
    raw: source.slice(node.position?.start.offset, node.position?.end.offset),
    gap: source.slice(node.position?.end.offset, tree.children[i + 1]?.position?.start.offset ?? source.length),
  }));
  return { content: { type: "doc", content: parts.length ? parts.map(p => p.node) : [{ type: "paragraph" }] } as JSONContent,
    parts, prefix: source.slice(0, tree.children[0]?.position?.start.offset ?? source.length) };
}

export function taskOffsets(source: string): number[] {
  const result: number[] = [];
  function walk(node: Nodes) {
    if (node.type === "listItem" && typeof node.checked === "boolean" && node.position) {
      const start = node.position.start.offset!;
      const match = /^(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\]/.exec(source.slice(start));
      if (match) result.push(start + match[0].length - 2);
    }
    if ("children" in node) node.children.forEach(walk);
  }
  walk(markdownTree(source));
  return result;
}

export function textChanges(before: string, after: string) {
  const changes: { from: number; to: number; insert: string }[] = [];
  let offset = 0;
  for (const part of diffChars(before, after)) {
    if (part.added) {
      const last = changes.at(-1);
      if (last?.to === offset) last.insert += part.value;
      else changes.push({ from: offset, to: offset, insert: part.value });
    } else if (part.removed) {
      changes.push({ from: offset, to: offset + part.value.length, insert: "" });
      offset += part.value.length;
    } else offset += part.value.length;
  }
  return changes;
}

// Align visible characters with Markdown offsets for bookmarks, cursor status,
// dictation, and restoring the selection when switching to/from Source.
export function documentPositions(doc: DocumentNode, source: string) {
  const positions: number[] = [];
  const offsets: number[] = [];
  const blocks = markdownTree(source).children;
  // Align each block independently. A whole-document character diff becomes
  // quadratic when thousands of Markdown markers disappear from visible text.
  doc.forEach((block, blockPos, index) => {
    const sourceBlock = blocks[index];
    const start = sourceBlock?.position?.start.offset ?? 0;
    const end = sourceBlock?.position?.end.offset ?? start;
    let text = "";
    const localPositions: number[] = [];
    const collect = (node: DocumentNode, pos: number) => {
      if (node.isTextblock) {
        if (text.length) { localPositions.push(pos); text += "\n"; }
        localPositions[text.length] = pos + 1;
      }
      if (node.isText) {
        for (let i = 0; i < node.text!.length; i++) localPositions[text.length + i] = pos + i;
        text += node.text;
        localPositions[text.length] = pos + node.text!.length;
      }
    };
    collect(block, blockPos);
    block.descendants((node, pos) => collect(node, blockPos + 1 + pos));
    if (!localPositions.length) return;
    const localOffsets: number[] = [];
    let visible = 0, raw = start;
    for (const part of diffChars(text, source.slice(start, end))) {
      if (part.added) raw += part.value.length;
      else if (part.removed) {
        for (let i = 0; i < part.value.length; i++) localOffsets[visible++] = raw;
      } else {
        for (let i = 0; i < part.value.length; i++) localOffsets[visible++] = raw++;
      }
      localOffsets[visible] = raw;
    }
    for (let i = 0; i < localPositions.length; i++) {
      positions.push(localPositions[i]);
      offsets.push(localOffsets[i] ?? end);
    }
  });
  return {
    toSource(pos: number) {
      let i = positions.findIndex(p => p >= pos);
      if (i < 0) i = positions.length - 1;
      return offsets[Math.max(0, i)] ?? 0;
    },
    toDocument(offset: number) {
      let i = offsets.findIndex(p => p >= offset);
      if (i < 0) i = offsets.length - 1;
      return positions[Math.max(0, i)] ?? 1;
    },
  };
}
