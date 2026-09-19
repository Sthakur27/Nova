import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReadPages, pageForLine } from "./readPages";
import Markdown from "./Markdown";

it("renders indented numbered items on separate lines in both read paths", () => {
  const text = "- test\n- test\n- test\n    - test\n1. test\n    2. **two**\n    3. test\n    4. test";
  const direct = renderToStaticMarkup(<Markdown text={text} />);
  const paged = renderToStaticMarkup(<Markdown tree={buildReadPages(text, true)[0].tree} />);
  expect(direct).toBe(paged);
  expect(direct.match(/<li /g)).toHaveLength(8);
  expect(direct).toContain('<ol start="2">');
  expect(direct).toContain('<li data-line="6"><strong>two</strong></li>');
  expect(direct).toContain('<li data-line="8">test</li>');
});

it("preserves multi-digit nested starts and leaves prose and code alone", () => {
  const text = "1. parent\n    12. child\n    13. next\n\nProse\n2026. a year\n\n```\n1. parent\n    2. code\n```\n\n1. `inline\n    2. code`\n\n1. parent\n\n       2. indented code";
  const direct = renderToStaticMarkup(<Markdown text={text} />);
  expect(direct).toBe(renderToStaticMarkup(<Markdown tree={buildReadPages(text, true)[0].tree} />));
  expect(direct).toContain('<ol start="12">');
  expect(direct).toContain('Prose\n2026. a year');
  expect(direct).toContain('1. parent\n    2. code');
  expect(direct).toContain('<code>inline  2. code</code>');
  expect(direct).toContain('2. indented code');
});

it("reads Markdown beyond the former limit without losing the ending", () => {
  const text = "# Section\n\nA paragraph with **formatting**.\n\n".repeat(13_000) + "Final sentence.";
  expect(text.length).toBeGreaterThan(500_000);
  const pages = buildReadPages(text, true);
  expect(pages.length).toBeGreaterThan(10);
  const last = renderToStaticMarkup(<Markdown tree={pages.at(-1)!.tree} />);
  expect(last).toContain("Final sentence.");
  expect(last).toContain("<strong>formatting</strong>");
  expect(pageForLine(pages, text.split("\n").length)).toBe(pages.length - 1);
});

it("resolves references across pages and preserves source positions", () => {
  const text = "[link][destination]\n\n" + "A paragraph.\n\n".repeat(2500) + "[destination]: https://example.com\n";
  const pages = buildReadPages(text, true);
  const first = renderToStaticMarkup(<Markdown tree={pages[0].tree} />);
  expect(first).toContain('href="https://example.com"');
  expect(first).toContain('data-line="1"');
  expect(pages[1].line).toBeGreaterThan(1);
});

it("keeps a fenced code block intact even when it exceeds the page target", () => {
  const code = "const example = 1;\n".repeat(2000);
  const pages = buildReadPages("Intro\n\n```js\n" + code + "```\n\nEnd", true);
  const blocks = pages.flatMap(p => p.tree.children).filter(n => n.type === "element" && n.tagName === "pre");
  expect(blocks).toHaveLength(1);
  expect(renderToStaticMarkup(<Markdown tree={pages[1].tree} />)).toContain(code);
});

it("paginates plain text with absolute line numbers and literal content", () => {
  const lines = Array.from({length: 12_000}, (_, i) => `${i}: <script>hello</script> ${"x".repeat(40)}`);
  const pages = buildReadPages(lines.join("\n"), false);
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.flatMap(p => p.tree.children)).toHaveLength(lines.length);
  expect(pages.at(-1)!.endLine).toBe(lines.length);
  const rendered = renderToStaticMarkup(<Markdown tree={pages[1].tree} />);
  expect(rendered).toContain(`data-line="${pages[1].line}"`);
  expect(rendered).toContain("&lt;script&gt;");
});

it("retains safe URL and raw HTML handling for worker-generated trees", () => {
  const page = buildReadPages('[bad](javascript:alert%281%29)\n\n<script>alert(1)</script>', true)[0];
  const html = renderToStaticMarkup(<Markdown tree={page.tree} />);
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});

it("handles empty documents and lines outside the available range", () => {
  for (const markdown of [true, false]) {
    const pages = buildReadPages("", markdown);
    expect(pages).toHaveLength(1);
    expect(pageForLine(pages, 999)).toBe(0);
    expect(pageForLine(pages, 0)).toBe(0);
  }
});
