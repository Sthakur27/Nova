import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { overflowClip } from "./overflowClip";
import { DEFAULT_GALAXY_PERFORMANCE, type GalaxyPerformance } from "./galaxyPerformance";

const SUPERNOVA_DURATION = 3000;
const INTERACTION_DURATION = 700;
const targets = "button:not(:disabled), a, summary, select, input, .bookmark-card, .note-tab, .file-row, .root-header";
type Edge = { x: number; y: number; width: number; height: number; radius?: number; selected?: boolean; burst?: number; clip?: ReturnType<typeof overflowClip> };
type SelectedLine = { kind: "reader"; element: Element; row: number } | { kind: "editor"; element: HTMLElement };

/** A fixed violet-blue rim emits energy dots inward, clipped to each box. */
export default function PlasmaEffects({ active, dirty, lineHighlight, supernova = 0, performanceMode = DEFAULT_GALAXY_PERFORMANCE }: { performanceMode?: GalaxyPerformance; active: boolean; dirty: boolean; lineHighlight: boolean; supernova?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const selectedLine = useRef<SelectedLine | null>(null);
  useEffect(() => {
    const layer = canvas.current;
    if ((!active && !supernova) || !layer) return;
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
    let frameTimer: number | undefined;
    let last = -Infinity;
    let animateUntil = 0;
    let geometryDirty = true;
    const frameInterval = 1000 / (performanceMode === "high" ? 60 : 24);
    let keepAnimatingInteraction = false;
    let cachedEdges: Edge[] = [];
    let cachedShells: Edge[] = [];
    let painted: Edge[] = [];
    const transitions = new Map<EventTarget, Set<string>>();
    const observed = new Set<Element>();
    let width = innerWidth;
    let height = innerHeight;
    const size = () => {
      width = innerWidth;
      height = innerHeight;
      const scale = Math.min(devicePixelRatio || 1, 2);
      layer.width = Math.round(width * scale);
      layer.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      painted = [];
      geometryDirty = true;
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
      // Opacity-hidden controls still have layout boxes, but must not leave a
      // standalone rim on the canvas (including when an ancestor fades out).
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false;
      }
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
      if (edge.clip) {
        const { left, top, right, bottom } = edge.clip;
        ctx.beginPath();
        ctx.rect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
        ctx.clip();
      }
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
      const burst = edge.burst;
      const strength = burst === undefined ? 1 : burst;
      const supernovaMotion = burst !== undefined && !motion.matches;
      const breath = burst === undefined ? 0.93 + Math.sin(time * 0.9 + seed) * 0.07 : strength;
      const rimLayers = supernovaMotion
        ? [[180, 0.025], [100, 0.045], [48, 0.09], [22, 0.18], [8, 0.45], [2.5, 1]]
        : [[9, 0.035], [5, 0.07], [2.5, 0.13], [0.9, 0.58]];
      for (const [lineWidth, opacity] of rimLayers) {
        ctx.lineWidth = lineWidth * (burst !== undefined && !supernovaMotion ? 2.5 : 1);
        ctx.globalAlpha = opacity * breath;
        ctx.stroke();
      }
      const count = Math.max(5, Math.min(supernovaMotion ? 240 : burst === undefined ? 32 : 120, Math.ceil(perimeter / (supernovaMotion ? 10 : 16))));
      const depth = Math.min(supernovaMotion ? 240 : burst === undefined ? 19 : 52, Math.min(w, h) * 0.35);
      for (let i = 0; i < count; i++) {
        // Stable, uneven spacing and lifetimes prevent synchronized rows of dots.
        const jitter = Math.sin(i * 91.7 + seed) * 0.35;
        const p = point(((i + 0.5 + jitter) / count) * perimeter);
        const phase = (i * 0.61803398875 + seed) % 1;
        const duration = 2.2 + (Math.sin(i * 7.3) + 1) * 0.8;
        const age = (time / (burst === undefined ? duration : 0.6) + phase) % 1;
        const fade = Math.min(1, age * 9) * Math.pow(1 - age, 1.4);
        const inward = 1.4 + age * depth;
        const drift = Math.sin(i * 2.1 + age * 2) * age * Math.min(supernovaMotion ? 14 : 3, depth * 0.2);
        const px = p.x - p.nx * inward - p.ny * drift;
        const py = p.y - p.ny * inward + p.nx * drift;
        const size = (2.5 + (Math.sin(i * 13.1) + 1) * 0.75) * (supernovaMotion ? 1.8 : 1);
        if (supernovaMotion) {
          // Short comet tails point back toward the edge the sparks launched from.
          const tail = Math.min(inward - 1, 12 + age * 24);
          ctx.beginPath();
          ctx.moveTo(px + p.nx * tail, py + p.ny * tail);
          ctx.lineTo(px, py);
          ctx.strokeStyle = i % 2 ? "#a6d7ff" : "#dcc3ff";
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = fade * strength * 0.5;
          ctx.stroke();
        }
        ctx.globalAlpha = Math.min(1, fade * (supernovaMotion ? 2 : edge.selected ? 0.78 : 0.9) * strength);
        ctx.drawImage(sparks[i % 2], px - size, py - size, size * 2, size * 2);
      }
      ctx.restore();
    };

    const measure = () => {
      for (const element of transitions.keys()) {
        if (element instanceof Element && !element.isConnected) transitions.delete(element);
      }
      const edges: Edge[] = [];
      const elements = new Set<Element>();
      const addControl = (element: Element) => {
        const group = element.closest(".root-menu > div")
          ? null
          : element.closest(".note-tab, .file-row, .root-header");
        // Keep the full row rim, with a second rim for its secondary controls.
        elements.add(group ?? element);
        if (group && element.matches(".tab-close, .file-star, .file-edit, .root-menu > summary")) elements.add(element);
      };
      if (active && hover?.matches(":hover")) addControl(hover);
      if (active && focus?.matches(":focus-visible")) addControl(focus);
      const interactiveElements = new Set(elements);
      keepAnimatingInteraction = false;
      const emblem = document.querySelector(".brand-emblem");
      if (active && emblem) elements.add(emblem);
      const save = active && dirty ? document.querySelector('[data-unsaved="true"]') : null;
      if (save) elements.add(save);
      for (const element of elements) {
        if (!visible(element)) continue;
        const r = element.getBoundingClientRect();
        const clip = overflowClip(element, width, height);
        if (r.right <= clip.left || r.left >= clip.right || r.bottom <= clip.top || r.top >= clip.bottom) continue;
        if (interactiveElements.has(element)) keepAnimatingInteraction = true;
        edges.push({ x: r.left, y: r.top, width: r.width, height: r.height,
          clip,
          radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 });
      }
      const selected = selectedLine.current;
      if (active && lineHighlight && selected && visible(selected.element.closest(".read-pane") ?? selected.element)) {
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
      cachedEdges = edges;
      cachedShells = [];
      if (supernova > 0 && performance.now() < supernova + SUPERNOVA_DURATION) {
        document.querySelectorAll(".app-shell").forEach(element => {
          elements.add(element);
          if (!visible(element)) return;
          const r = element.getBoundingClientRect();
          cachedShells.push({ x: r.left, y: r.top, width: r.width, height: r.height,
            radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 });
        });
      }
      // Watch targets and their layout containers, not the entire document's
      // boxes. Mutation/scroll events also catch movement without a size change.
      if (selected?.element.isConnected) elements.add(selected.element);
      const nextObserved = new Set<Element>([document.documentElement]);
      for (const element of elements) {
        for (let node: Element | null = element; node; node = node.parentElement) nextObserved.add(node);
      }
      for (const element of observed) if (!nextObserved.has(element)) resizeObserver.unobserve(element);
      for (const element of nextObserved) if (!observed.has(element)) resizeObserver.observe(element);
      observed.clear();
      nextObserved.forEach(element => observed.add(element));
      geometryDirty = false;
    };
    const clearEdge = (edge: Edge) => {
      // Every effect is clipped inside its own border. Clear old and new bounds
      // before drawing any edges, so moving/overlapping glows cannot leave trails.
      const left = Math.max(0, edge.clip?.left ?? 0, Math.floor(edge.x) - 1);
      const top = Math.max(0, edge.clip?.top ?? 0, Math.floor(edge.y) - 1);
      const right = Math.min(width, edge.clip?.right ?? width, Math.ceil(edge.x + edge.width) + 1);
      const bottom = Math.min(height, edge.clip?.bottom ?? height, Math.ceil(edge.y + edge.height) + 1);
      if (right > left && bottom > top) ctx.clearRect(left, top, right - left, bottom - top);
    };
    const paint = (now: number) => {
      frame = 0;
      if (!motion.matches && now - last < frameInterval - 0.5) { redraw(); return; }
      last = now;
      if (geometryDirty || transitions.size) measure();
      const elapsed = now - supernova;
      const bursting = supernova > 0 && elapsed < SUPERNOVA_DURATION;
      const edges = cachedEdges;
      const current = bursting ? [...edges, ...cachedShells] : edges;
      new Set([...painted, ...current]).forEach(clearEdge);
      painted = current;
      edges.forEach((edge, i) => drawEdge(edge, motion.matches ? 0 : now / 1000, i * 2.4));
      if (bursting) {
        // Light up only the outer app boundary, then settle over three seconds.
        const intensity = motion.matches ? 0.6 : Math.min(1, elapsed / 45) * Math.pow(1 - elapsed / SUPERNOVA_DURATION, 0.45);
        cachedShells.forEach((edge, i) => {
          drawEdge({ ...edge, burst: intensity }, motion.matches ? 0 : elapsed / 1000, i * 2.4);
        });
      }
      // High performance keeps visible hover/keyboard-focus effects alive.
      // Saver settles to a static glow; window focus alone never runs forever.
      const interacting = now < animateUntil || (performanceMode === "high" && keepAnimatingInteraction);
      if (!motion.matches && ((active && interacting) || bursting || transitions.size > 0)) redraw();
    };
    const redraw = () => {
      if (frame || frameTimer !== undefined) return;
      // Saver sleeps between frames; High performance follows display refresh
      // for smoother motion, with paint enforcing its 60 FPS ceiling.
      const wait = motion.matches || performanceMode === "high" ? 0 : Math.max(0, frameInterval - (performance.now() - last));
      if (wait > 0) {
        frameTimer = window.setTimeout(() => {
          frameTimer = undefined;
          frame = requestAnimationFrame(paint);
        }, Math.ceil(wait));
      } else frame = requestAnimationFrame(paint);
    };
    const invalidate = () => { geometryDirty = true; redraw(); };
    const refresh = () => {
      geometryDirty = true;
      animateUntil = performance.now() + INTERACTION_DURATION;
      redraw();
    };
    const target = (element: EventTarget | null) => {
      if (!(element instanceof Element)) return null;
      // Section labels stay quiet while their action buttons retain hover effects.
      if (element.closest(".explorer-section-label, .nova-find")) return null;
      // The title is editable text; its hover rim follows the line preference too.
      if (!lineHighlight && element.closest(".file-heading")) return null;
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
    const resizeObserver = new ResizeObserver(invalidate);
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.target !== layer)) invalidate();
    });
    const transition = (event: TransitionEvent) => {
      if (!event.target) return;
      if (event.type === "transitionrun") {
        const properties = transitions.get(event.target) ?? new Set<string>();
        properties.add(event.propertyName);
        transitions.set(event.target, properties);
      } else {
        const properties = transitions.get(event.target);
        properties?.delete(event.propertyName);
        if (!properties?.size) transitions.delete(event.target);
      }
      invalidate();
    };
    hover = target(Array.from(document.querySelectorAll(":hover")).at(-1) ?? null);
    focus = document.activeElement?.matches(":focus-visible") ? target(document.activeElement) : null;
    size();
    refresh();
    mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    document.addEventListener("transitionrun", transition);
    document.addEventListener("transitionend", transition);
    document.addEventListener("transitioncancel", transition);
    // Reduced motion gets a steady rim, then a single redraw to clear it.
    const burstEnd = supernova > 0 ? window.setTimeout(redraw, Math.max(0, supernova + SUPERNOVA_DURATION - performance.now())) : undefined;
    document.addEventListener("pointerdown", refresh);
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
      mutations.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("transitionrun", transition);
      document.removeEventListener("transitionend", transition);
      document.removeEventListener("transitioncancel", transition);
      cancelAnimationFrame(frame);
      window.clearTimeout(frameTimer);
      window.clearTimeout(burstEnd);
      ctx.clearRect(0, 0, width, height);
      document.removeEventListener("pointerdown", refresh);
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
  }, [active, dirty, lineHighlight, supernova, performanceMode]);
  return <canvas ref={canvas} className="plasma-effects" aria-hidden="true" />;
}
