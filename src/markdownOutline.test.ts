import { expect, it } from "vitest";
import { headingOutline } from "./markdownOutline";

it("recognizes ATX, setext, nested and duplicate headings at exact source offsets", () => {
  const text = "# First\r\n\r\nSecond\r\n------\r\n\r\n> ### Nested\r\n\r\n# First\r\n";
  expect(headingOutline(text)).toEqual([
    { title: "First", level: 1, from: 0, line: 1 },
    { title: "Second", level: 2, from: text.indexOf("Second"), line: 3 },
    { title: "Nested", level: 3, from: text.indexOf("###"), line: 6 },
    { title: "First", level: 1, from: text.lastIndexOf("# First"), line: 8 },
  ]);
});

it("excludes code, HTML blocks, escaped markers and thematic breaks", () => {
  expect(headingOutline("```md\n# Fence\n```\n\n    # Indented\n\n\\# Escaped\n\n---\n\n<div>\n# HTML\n</div>\n\n# Real").map(h => h.title)).toEqual(["Real"]);
});

it("renders inline labels without formatting syntax or link destinations", () => {
  expect(headingOutline("## **Bold** *emphasis* `code` [link](https://example.com) ![diagram](image.png) &amp; ~~gone~~ ##\n\n#").map(h => h.title))
    .toEqual(["Bold emphasis code link diagram & gone", "Untitled heading"]);
});
