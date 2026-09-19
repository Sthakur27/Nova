import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
export default memo(function Markdown({ text = "", tree }: { text?: string; tree?: Root }) {
  // Keep ReactMarkdown’s HTML escaping and safe URL handling for worker output.
  const plugins = useMemo(() => tree ? [() => () => structuredClone(tree)] : [], [tree]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={plugins}
      components={{
        ...components,
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
