// Read-only previews can replace pages/chunks asynchronously. CSS highlights
// follow their text without inserting nodes into React-owned Markdown.
export function highlightReadPreview(scope: HTMLElement, text: string, query: string, from: number) {
  if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return () => {};
  const hits = CSS.highlights.get("note-find") ?? new Highlight();
  const current = CSS.highlights.get("note-find-current") ?? new Highlight();
  current.priority = 1;
  CSS.highlights.set("note-find", hits);
  CSS.highlights.set("note-find-current", current);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const activeLine = text.slice(0, from).split("\n").length;
  let owned: Range[] = [];
  const clear = () => { for (const range of owned) { hits.delete(range); current.delete(range); } owned = []; };
  const update = () => {
    clear();
    if (!query) return;
    const blocks = [...scope.querySelectorAll<HTMLElement>("[data-line]")];
    const lines = [...new Set(blocks.map(block => Number(block.dataset.line)))].sort((a, b) => a - b);
    const ends = new Map(lines.map((line, index) => [line, lines[index + 1] ?? Infinity]));
    for (const block of blocks) {
      // Keep inline bold/link boundaries, excluding nested blocks and controls.
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest("[data-line]") === block && !node.parentElement.closest("button")) nodes.push(node as Text);
      }
      const content = nodes.map(node => node.data).join("");
      const matches = [...content.matchAll(new RegExp(escaped, "gi"))];
      const line = Number(block.dataset.line);
      const start = lineStarts[line - 1] ?? 0;
      const nextLine = ends.get(line) ?? Infinity;
      const containsActive = activeLine >= line && activeLine < nextLine;
      const ordinal = containsActive ? [...text.slice(start, Math.max(start, from)).matchAll(new RegExp(escaped, "gi"))].length : -1;
      matches.forEach((match, index) => {
        const range = document.createRange();
        let offset = 0;
        for (const node of nodes) {
          const end = offset + node.length;
          if (match.index >= offset && match.index < end) range.setStart(node, match.index - offset);
          if (match.index + match[0].length > offset && match.index + match[0].length <= end) range.setEnd(node, match.index + match[0].length - offset);
          offset = end;
        }
        hits.add(range); owned.push(range);
        if (containsActive && index === ordinal) current.add(range);
      });
    }
  };
  update();
  const observer = new MutationObserver(update);
  observer.observe(scope, { childList: true, subtree: true, characterData: true });
  return () => { observer.disconnect(); clear(); };
}
