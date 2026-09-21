import type { Bookmark } from "./model";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown, { type TaskToggle } from "./Markdown";
import type { ReadPage } from "./readPages";

// Keep only nearby Markdown mounted. Measured placeholders preserve scroll
// position when a chunk leaves the viewport; parsing stays in the worker.
export default memo(function ReadChunk({ bookmarks, page, index, forced, onToggleTask }: {
  bookmarks?: Bookmark[]; page: ReadPage; index: number; forced: boolean; onToggleTask?: TaskToggle;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(index === 0);
  const [height, setHeight] = useState(1200);
  const measuredHeight = useRef(1200);
  const visible = nearby || forced;
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), {
      root: node.closest(".read-pane"), rootMargin: "1000px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = root.current;
    if (!visible || !node) return;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      const pane = node.closest<HTMLElement>(".read-pane");
      const previous = measuredHeight.current;
      // A newly mounted chunk above the viewport must not move the passage
      // being read when its estimated height becomes an actual measurement.
      if (pane && bounds.top + previous <= pane.getBoundingClientRect().top) {
        pane.scrollTop += bounds.height - previous;
      }
      measuredHeight.current = bounds.height;
      setHeight(bounds.height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, page]);
  return <div ref={root} className="read-chunk" data-read-chunk={index}
    style={visible ? undefined : { height }} aria-hidden={visible ? undefined : true}>
    {visible && <Markdown bookmarks={bookmarks} tree={page.tree} onToggleTask={onToggleTask} />}
  </div>;
});
