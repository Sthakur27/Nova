import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkNestedNumbers from "./remarkNestedNumbers";
import remarkTaskOffsets from "./remarkTaskOffsets";
import { memo, useMemo, type ComponentProps } from "react";
import type { Root, Element } from "hast";
import type { Bookmark } from "./model";
const tags = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "table",
] as const;
const components = Object.fromEntries(
  tags.map((Tag) => [
    Tag,
    ({
      node,
      ...props
    }: ComponentProps<"p"> & {
      node?: { position?: { start: { line: number } } };
    }) => <Tag {...(props as object)} data-line={node?.position?.start.line} />,
  ]),
);
export type TaskToggle = (offset: number, checked: boolean) => void;
export default memo(function Markdown({ text = "", tree, onToggleTask, bookmarks }: { text?: string; tree?: Root; onToggleTask?: TaskToggle; bookmarks?: Bookmark[] }) {
  // Keep ReactMarkdown’s HTML escaping and safe URL handling for worker output.
  const plugins = useMemo(() => [
    ...(tree ? [() => () => structuredClone(tree)] : []),
    () => (root: Root) => {
      if (!bookmarks?.length) return;
      const blocks: Element[] = [];
      const visit = (node: Root | Element) => {
        if (node.type === "element" && ([...tags, "div"] as string[]).includes(node.tagName)) blocks.push(node);
        for (const child of node.children) if (child.type === "element") visit(child);
      };
      visit(root);
      blocks.reverse();
      for (const mark of bookmarks) {
        if (mark.unresolved || mark.to <= mark.from) continue;
        // Later descendants win, so nested lists mark the actual item.
        const block = blocks.find(node => {
          const start = node.position?.start.offset, end = node.position?.end.offset;
          return start !== undefined && end !== undefined ? start <= mark.from && mark.from < end
            : Number(node.properties["data-line"]) === mark.line;
        });
        if (block) {
          block.properties.className = [...(Array.isArray(block.properties.className) ? block.properties.className : []), "document-bookmarked"];
          block.properties.title = `Bookmarked: ${mark.name}`;
        }
      }
    },
  ], [tree, bookmarks]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkNestedNumbers, remarkTaskOffsets]}
      rehypePlugins={plugins}
      components={{
        ...components,
        input: ({ node: _node, ...props }) => <input {...props} disabled={!onToggleTask}
          aria-label={props.checked ? "Mark task incomplete" : "Mark task complete"}
          onChange={event => {
            const value = event.currentTarget.closest("[data-task-offset]")?.getAttribute("data-task-offset");
            if (value != null) onToggleTask?.(Number(value), event.currentTarget.checked);
          }} />,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        img: ({ alt }) => (
          <span className="image-placeholder">
            Image: {alt || "attachment"} (image preview is not enabled yet)
          </span>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
});
