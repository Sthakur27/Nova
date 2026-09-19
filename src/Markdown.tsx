import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkNestedNumbers from "./remarkNestedNumbers";
import remarkTaskOffsets from "./remarkTaskOffsets";
import { memo, useMemo, type ComponentProps } from "react";
import type { Root } from "hast";
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
export default memo(function Markdown({ text = "", tree, onToggleTask }: { text?: string; tree?: Root; onToggleTask?: TaskToggle }) {
  // Keep ReactMarkdown’s HTML escaping and safe URL handling for worker output.
  const plugins = useMemo(() => tree ? [() => () => structuredClone(tree)] : [], [tree]);
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
