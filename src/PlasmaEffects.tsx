import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";

const targets = "button:not(:disabled), a, summary, select, input, .bookmark-card";
type Edge = { x: number; y: number; width: number; height: number; radius?: number; selected?: boolean };
type SelectedLine = { kind: "reader"; element: Element; row: number } | { kind: "editor"; element: HTMLElement };

/** A fixed violet-blue rim emits energy dots inward, clipped to each box. */
export default function PlasmaEffects({ active, dirty, lineHighlight }: { active: boolean; dirty: boolean; lineHighlight: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const selectedLine = useRef<SelectedLine | null>(null);
  useEffect(() => {
    const layer = canvas.current;
    if (!active || !layer) return;
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    // Cache two tiny light sprites; particles animate without allocating gradients.
    const sparks = ["171,140,255", "118,173,255"].map((color) => {
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 24;
      const light = sprite.getContext("2d")!;
      const glow = light.createRadialGradient(12, 12, 0, 12, 12, 12);
      glow.addColorStop(0, "rgba(239,231,255,0.95)");
      glow.addColorStop(0.18, `rgba(${color},0.85)`);
      glow.addColorStop(0.38, `rgba(${color},0.22)`);
      glow.addColorStop(1, `rgba(${color},0)`);
      light.fillStyle = glow;
      light.fillRect(0, 0, 24, 24);
      return sprite;
    });
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let hover: Element | null = null;
    let focus: Element | null = null;
    let frame = 0;
    let last = 0;
    let width = innerWidth;
    let height = innerHeight;
    const size = () => {
      width = innerWidth;
      height = innerHeight;
      const scale = Math.min(devicePixelRatio || 1, 2);
      layer.width = Math.round(width * scale);
      layer.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const rows = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines: { left: number; right: number; top: number; bottom: number }[] = [];
      // Text-node ranges avoid including the enclosing paragraph's whole box.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const line = lines.find((l) => Math.abs(l.top - rect.top) < 5);
          if (line) {
            line.left = Math.min(line.left, rect.left);
            line.right = Math.max(line.right, rect.right);
            line.bottom = Math.max(line.bottom, rect.bottom);
          } else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        }
      }
      return lines.sort((a, b) => a.top - b.top);
    };
    const visible = (element: Element) => {
      if (!element.isConnected || !element.getClientRects().length) return false;
      const modal = document.querySelector(".overlay");
      if (modal && !modal.contains(element)) return false;
      const r = element.getBoundingClientRect();
      if (r.bottom < 0 || r.top > height || r.right < 0 || r.left > width) return false;
      // Do not draw through a scroll container's clipped edge.
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) {
          const p = parent.getBoundingClientRect();
          if (r.bottom <= p.top || r.top >= p.bottom) return false;
        }
      }
      return true;
    };
    const drawEdge = (edge: Edge, time: number, seed: number) => {
      const { x, y, width: w, height: h } = edge;
      const radius = Math.min(edge.radius ?? 7, w / 2, h / 2);
      const horizontal = w - radius * 2;
      const vertical = h - radius * 2;
      const arc = Math.PI * radius / 2;
      const perimeter = 2 * (horizontal + vertical) + 4 * arc;
      // Emit from fixed points on the real border, including its rounded corners.
      const point = (distance: number) => {
        let d = distance % perimeter;
        if (d < horizontal) return { x: x + radius + d, y, nx: 0, ny: -1 };
        d -= horizontal;
        if (d < arc) {
          const a = -Math.PI / 2 + d / radius;
          return { x: x + w - radius + Math.cos(a) * radius, y: y + radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) };
        }
        d -= arc;
        if (d < vertical) return { x: x + w, y: y + radius + d, nx: 1, ny: 0 };
        d -= vertical;
        if (d < arc) {
          const a = d / radius;
          return { x: x + w - radius + Math.cos(a) * radius, y: y + h - radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) };
        }
        d -= arc;
        if (d < horizontal) return { x: x + w - radius - d, y: y + h, nx: 0, ny: 1 };
        d -= horizontal;
        if (d < arc) {
          const a = Math.PI / 2 + d / radius;
          return { x: x + radius + Math.cos(a) * radius, y: y + h - radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) };
        }
        d -= arc;
        if (d < vertical) return { x, y: y + h - radius - d, nx: -1, ny: 0 };
        d -= vertical;
        const a = Math.PI + d / radius;
        return { x: x + radius + Math.cos(a) * radius, y: y + radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) };
      };
      if (w <= 2 || h <= 2) return;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, radius - 0.5));
      ctx.clip();
      if (edge.selected) {
        ctx.fillStyle = "rgba(151,143,235,0.035)";
        ctx.fill();
      }
      ctx.globalCompositeOperation = "screen";
      // The outline stays still. Only its light softly breathes; all bloom is inside.
      const rim = ctx.createLinearGradient(x, y, x + w, y + h);
      rim.addColorStop(0, "rgb(156,144,252)");
      rim.addColorStop(0.45, "rgb(174,127,246)");
      rim.addColorStop(1, "rgb(106,161,255)");
      ctx.strokeStyle = rim;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w - 2, h - 2, Math.max(0, radius - 1));
      const breath = 0.93 + Math.sin(time * 0.9 + seed) * 0.07;
      for (const [lineWidth, opacity] of [[9, 0.035], [5, 0.07], [2.5, 0.13], [0.9, 0.58]]) {
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = opacity * breath;
        ctx.stroke();
      }
      const count = Math.max(5, Math.min(64, Math.ceil(perimeter / 20)));
      const depth = Math.min(19, Math.min(w, h) * 0.25);
      for (let i = 0; i < count; i++) {
        // Stable, uneven spacing and lifetimes prevent synchronized rows of dots.
        const jitter = Math.sin(i * 91.7 + seed) * 0.35;
        const p = point(((i + 0.5 + jitter) / count) * perimeter);
        const phase = (i * 0.61803398875 + seed) % 1;
        const duration = 2.2 + (Math.sin(i * 7.3) + 1) * 0.8;
        const age = (time / duration + phase) % 1;
        const fade = Math.min(1, age * 9) * Math.pow(1 - age, 1.4);
        const inward = 1.4 + age * depth;
        const drift = Math.sin(i * 2.1 + age * 2) * age * Math.min(3, depth * 0.2);
        const px = p.x - p.nx * inward - p.ny * drift;
        const py = p.y - p.ny * inward + p.nx * drift;
        const size = 2.5 + (Math.sin(i * 13.1) + 1) * 0.75;
        ctx.globalAlpha = fade * (edge.selected ? 0.78 : 0.9);
        ctx.drawImage(sparks[i % 2], px - size, py - size, size * 2, size * 2);
      }
      ctx.restore();
    };

    const paint = (now: number) => {
      frame = 0;
      if (!motion.matches && now - last < 32) {
        frame = requestAnimationFrame(paint);
        return;
      }
      last = now;
      ctx.clearRect(0, 0, width, height);
      const edges: Edge[] = [];
      const elements = new Set<Element>();
      if (hover) elements.add(hover);
      if (focus) elements.add(focus);
      const emblem = document.querySelector(".brand-emblem");
      if (emblem) elements.add(emblem);
      const save = dirty ? document.querySelector('[data-unsaved="true"]') : null;
      if (save) elements.add(save);
      for (const element of elements) {
        if (!visible(element)) continue;
        const r = element.getBoundingClientRect();
        edges.push({ x: r.left, y: r.top, width: r.width, height: r.height,
          radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 });
      }
      const selected = selectedLine.current;
      if (lineHighlight && selected && visible(selected.element.closest(".read-pane") ?? selected.element)) {
        const pane = selected.element.closest(".read-pane, .cm-scroller")?.getBoundingClientRect();
        let line: { left: number; right: number; top: number; bottom: number } | undefined;
        if (selected.kind === "reader") {
          const row = rows(selected.element)[selected.row];
          const block = selected.element.getBoundingClientRect();
          if (row) line = { ...row, left: block.left, right: block.right };
          const selection = window.getSelection();
          const reader = selected.element.closest(".read-pane");
          if (selection && !selection.isCollapsed && selection.rangeCount &&
              reader?.contains(selection.anchorNode) && reader.contains(selection.focusNode)) {
            const range = selection.getRangeAt(0);
            const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
            if (rects.length) {
              const start = range.startContainer.parentElement?.closest("[data-line]")?.getBoundingClientRect();
              const end = range.endContainer.parentElement?.closest("[data-line]")?.getBoundingClientRect();
              line = rects.reduce((bounds, rect) => ({
                left: Math.min(bounds.left, rect.left),
                right: Math.max(bounds.right, rect.right),
                top: Math.min(bounds.top, rect.top),
                bottom: Math.max(bounds.bottom, rect.bottom),
              }), {
                left: Math.min(block.left, start?.left ?? block.left, end?.left ?? block.left),
                right: Math.max(block.right, start?.right ?? block.right, end?.right ?? block.right),
                top: Infinity,
                bottom: -Infinity,
              });
            }
          }
        } else {
          const view = EditorView.findFromDOM(selected.element);
          if (view) {
            const { from, to, empty } = view.state.selection.main;
            // A selection ending at the next line's start excludes that line.
            const end = !empty && view.state.doc.lineAt(to).from === to ? to - 1 : to;
            const startCoords = view.coordsAtPos(from, 1);
            const endCoords = view.coordsAtPos(end, empty ? 1 : -1);
            const block = selected.element.getBoundingClientRect();
            const style = getComputedStyle(selected.element);
            line = {
              top: startCoords?.top ?? view.documentTop + view.lineBlockAt(from).top,
              bottom: endCoords?.bottom ?? view.documentTop + view.lineBlockAt(end).bottom,
              left: block.left + parseFloat(style.paddingLeft),
              right: block.right - parseFloat(style.paddingRight),
            };
            if (!empty) {
              // Follow the drawn selection, including line spacing and blank lines.
              for (const segment of view.dom.querySelectorAll(".cm-selectionBackground")) {
                const rect = segment.getBoundingClientRect();
                line.left = Math.min(line.left, rect.left);
                line.right = Math.max(line.right, rect.right);
                line.top = Math.min(line.top, rect.top);
                line.bottom = Math.max(line.bottom, rect.bottom);
              }
            }
          }
        }
        if (line && pane && line.bottom > pane.top && line.top < pane.bottom) {
          const left = Math.max(pane.left + 1, line.left - 6);
          const right = Math.min(pane.right - 7, line.right + 6);
          const top = Math.max(pane.top + 1, line.top - 3);
          const bottom = Math.min(pane.bottom - 1, line.bottom + 3);
          if (right > left && bottom > top) edges.push({ x: left, y: top,
            width: right - left, height: bottom - top, radius: 5, selected: true });
        }
      }
      edges.forEach((edge, i) => drawEdge(edge, motion.matches ? 0 : now / 1000, i * 2.4));
      if (!motion.matches) frame = requestAnimationFrame(paint);
    };
    const refresh = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const target = (element: EventTarget | null) => {
      if (!(element instanceof Element)) return null;
      // Composite controls share one frame around their full outer boundary.
      return element.closest(".bookmark-card, .palette-input") ?? element.closest(targets);
    };
    const over = (event: PointerEvent) => { hover = target(event.target); refresh(); };
    const out = (event: PointerEvent) => { hover = target(event.relatedTarget); refresh(); };
    const focused = (event: FocusEvent) => {
      focus = event.target instanceof Element && event.target.matches(":focus-visible") ? target(event.target) : null;
      refresh();
    };
    const blurred = () => { focus = null; refresh(); };
    const selectionChanged = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      const content = element?.closest<HTMLElement>(".cm-content");
      if (content) selectedLine.current = { kind: "editor", element: content };
      else if (selection && !selection.isCollapsed) {
        const block = element?.closest(".read-pane [data-line]");
        if (block) selectedLine.current = { kind: "reader", element: block, row: 0 };
      }
      refresh();
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("a, button, input")) return;
      const content = event.target.closest<HTMLElement>(".cm-content");
      if (content) {
        selectedLine.current = { kind: "editor", element: content };
        refresh();
        return;
      }
      const element = event.target.closest(".read-pane [data-line]");
      if (!element || window.getSelection()?.toString()) return;
      const lines = rows(element);
      const row = lines.findIndex((line) => event.clientY >= line.top && event.clientY <= line.bottom);
      selectedLine.current = row < 0 ? null : { kind: "reader", element, row };
      refresh();
    };
    const resize = () => { selectedLine.current = null; size(); refresh(); };
    hover = target(Array.from(document.querySelectorAll(":hover")).at(-1) ?? null);
    focus = document.activeElement?.matches(":focus-visible") ? target(document.activeElement) : null;
    size();
    refresh();
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focused);
    document.addEventListener("focusout", blurred);
    document.addEventListener("click", click);
    document.addEventListener("scroll", refresh, true);
    document.addEventListener("input", refresh);
    document.addEventListener("keyup", refresh);
    document.addEventListener("selectionchange", selectionChanged);
    window.addEventListener("resize", resize);
    motion.addEventListener("change", refresh);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focused);
      document.removeEventListener("focusout", blurred);
      document.removeEventListener("click", click);
      document.removeEventListener("scroll", refresh, true);
      document.removeEventListener("input", refresh);
      document.removeEventListener("keyup", refresh);
      document.removeEventListener("selectionchange", selectionChanged);
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", refresh);
    };
  }, [active, dirty, lineHighlight]);
  return <canvas ref={canvas} className="plasma-effects" aria-hidden="true" />;
}
