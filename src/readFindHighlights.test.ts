// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { highlightReadPreview } from "./readFindHighlights";

it("highlights across inline markup, updates replaced pages, and preserves other panels", async () => {
  const highlights = new Map<string, Set<Range>>();
  vi.stubGlobal("CSS", { highlights });
  vi.stubGlobal("Highlight", class extends Set<Range> {});
  const left = document.createElement("div"), right = document.createElement("div");
  left.innerHTML = '<p data-line="1"><strong>nee</strong>dle and needle</p>';
  right.innerHTML = '<p data-line="1">needle</p>';
  const clearLeft = highlightReadPreview(left, "needle and needle", "needle", 11);
  const clearRight = highlightReadPreview(right, "needle", "needle", 0);
  try {
    expect([...highlights.get("note-find")!].map(range => range.toString())).toEqual(["needle", "needle", "needle"]);
    const selected = [...highlights.get("note-find-current")!];
    expect(selected).toHaveLength(2);
    expect(selected[0].startOffset).toBe(8);
    left.innerHTML = '<p data-line="2">needle</p>';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(highlights.get("note-find")!.size).toBe(2);
    clearLeft();
    expect([...highlights.get("note-find")!].map(range => range.toString())).toEqual(["needle"]);
    expect(right.innerHTML).toBe('<p data-line="1">needle</p>');
  } finally {
    clearLeft(); clearRight(); vi.unstubAllGlobals();
  }
});
