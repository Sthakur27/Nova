import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function adjacentNote(ids: string[], selected: string, direction: -1 | 1) {
  const index = ids.indexOf(selected);
  return ids.length > 1 && index >= 0 ? ids[(index + direction + ids.length) % ids.length] : null;
}

type Gesture = {
  origin: string; previous: string; next: string; x: number; y: number; width: number;
  dx: number; lastX: number; lastTime: number; velocity: number;
  phase: "pending" | "dragging" | "settling" | "committing";
  target?: string;
};

/** Transforms visual neighbors; only a completed gesture can change the active editor. */
export default function MobileNoteCarousel({ enabled, ids, selected, onSelect, renderPreview, children }: {
  enabled: boolean; ids: string[]; selected: string;
  onSelect: (id: string) => Promise<boolean>;
  renderPreview: (id: string) => ReactNode;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef({ enabled, ids, selected, onSelect });
  latest.current = { enabled, ids, selected, onSelect };
  const [neighbors, setNeighbors] = useState<{ previous: string; next: string } | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const selectedKey = JSON.stringify(ids);

  useEffect(() => {
    const element = viewport.current!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let suppressClickUntil = 0;
    const translate = (x: number) => element.style.setProperty("--note-drag", `${x}px`);
    const reset = () => {
      generation++;
      clearTimeout(timer);
      gesture.current = null;
      element.dataset.motion = "idle";
      translate(0);
      setNeighbors(null);
    };
    resetRef.current = reset;
    const animate = (x: number, done: () => void) => {
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
      element.dataset.motion = "settling";
      element.style.setProperty("--note-settle-duration", `${duration}ms`);
      translate(x);
      clearTimeout(timer);
      timer = setTimeout(done, duration);
    };
    const cancel = () => {
      const current = gesture.current;
      if (current?.phase === "dragging") {
        current.phase = "settling";
        animate(0, reset);
      } else if (current?.phase === "pending") reset();
    };
    const start = (event: TouchEvent) => {
      const props = latest.current;
      if (gesture.current || !props.enabled || event.touches.length !== 1) { cancel(); return; }
      if ((event.target as Element).closest("dialog, .formatted-find, .cm-search")) return;
      const previous = adjacentNote(props.ids, props.selected, -1);
      const next = adjacentNote(props.ids, props.selected, 1);
      const width = element.getBoundingClientRect().width;
      if (!previous || !next || !width) return;
      suppressClickUntil = 0;
      const touch = event.touches[0];
      gesture.current = { origin: props.selected, previous, next, x: touch.clientX, y: touch.clientY,
        width, dx: 0, lastX: touch.clientX, lastTime: event.timeStamp, velocity: 0, phase: "pending" };
    };
    const move = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current || !["pending", "dragging"].includes(current.phase)) return;
      if (event.touches.length !== 1 || !event.cancelable) { cancel(); return; }
      const touch = event.touches[0];
      const dx = touch.clientX - current.x, dy = touch.clientY - current.y;
      if (current.phase === "pending") {
        // A long press belongs to text selection; a vertical gesture belongs to scrolling.
        if (event.timeStamp - current.lastTime > 350 || (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx))) { reset(); return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        current.phase = "dragging";
        element.dataset.motion = "dragging";
        setNeighbors({ previous: current.previous, next: current.next });
      }
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = performance.now() + 700;
      const elapsed = event.timeStamp - current.lastTime;
      if (elapsed > 0) current.velocity = (touch.clientX - current.lastX) / elapsed;
      current.lastX = touch.clientX; current.lastTime = event.timeStamp;
      current.dx = Math.max(-current.width, Math.min(current.width, dx));
      translate(current.dx);
    };
    const end = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current) return;
      if (current.phase === "pending") { reset(); return; }
      if (current.phase !== "dragging") return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = performance.now() + 700;
      const velocity = event.timeStamp - current.lastTime < 100 ? current.velocity : 0;
      const projected = current.dx + velocity * 160;
      const commit = Math.abs(current.dx) >= 18 && Math.sign(projected) === Math.sign(current.dx) && Math.abs(projected) > current.width * .28;
      if (!commit) { cancel(); return; }
      current.target = current.dx < 0 ? current.next : current.previous;
      current.phase = "settling";
      const version = generation;
      animate(current.dx < 0 ? -current.width : current.width, () => {
        if (version !== generation) return;
        current.phase = "committing";
        // Keep the incoming preview visible during draft preservation and file loading.
        void latest.current.onSelect(current.target!).then(opened => {
          if (version !== generation) return;
          if (!opened) animate(0, reset);
        }).catch(() => { if (version === generation) animate(0, reset); });
      });
    };
    const click = (event: MouseEvent) => {
      if ((gesture.current && gesture.current.phase !== "pending") || performance.now() < suppressClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    let width = element.getBoundingClientRect().width;
    const resize = new ResizeObserver(() => {
      const next = element.getBoundingClientRect().width;
      if (next !== width) { width = next; reset(); }
    });
    resize.observe(element);
    element.addEventListener("touchstart", start, { capture: true, passive: true });
    element.addEventListener("touchmove", move, { capture: true, passive: false });
    element.addEventListener("touchend", end, { capture: true, passive: false });
    element.addEventListener("touchcancel", cancel, { capture: true, passive: true });
    element.addEventListener("click", click, true);
    window.addEventListener("blur", reset);
    return () => {
      generation++; clearTimeout(timer); resize.disconnect();
      element.removeEventListener("touchstart", start, true);
      element.removeEventListener("touchmove", move, true);
      element.removeEventListener("touchend", end, true);
      element.removeEventListener("touchcancel", cancel, true);
      element.removeEventListener("click", click, true);
      window.removeEventListener("blur", reset);
    };
  }, []);

  useLayoutEffect(() => {
    const current = gesture.current;
    if (!current) return;
    if (!enabled || !ids.includes(current.previous) || !ids.includes(current.next)) { resetRef.current(); return; }
    if (selected !== current.origin) {
      if (current.phase === "committing" && selected === current.target) {
        // Give the newly selected editor one frame to mount behind its preview.
        const frame = requestAnimationFrame(() => resetRef.current());
        return () => cancelAnimationFrame(frame);
      }
      resetRef.current();
    }
  }, [enabled, selected, selectedKey]);

  const previous = neighbors?.previous ?? (enabled ? adjacentNote(ids, selected, -1) : null);
  const next = neighbors?.next ?? (enabled ? adjacentNote(ids, selected, 1) : null);
  return <div ref={viewport} className="mobile-note-carousel" data-enabled={enabled} data-motion="idle">
    {previous && <div className="note-carousel-neighbor note-carousel-previous" inert aria-hidden="true">{renderPreview(previous)}</div>}
    <div className="note-carousel-current">{children}</div>
    {next && <div className="note-carousel-neighbor note-carousel-next" inert aria-hidden="true">{renderPreview(next)}</div>}
  </div>;
}
