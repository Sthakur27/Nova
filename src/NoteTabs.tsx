import { useLayoutEffect, useRef, type ComponentProps } from "react";

export default function NoteTabs({ selected, hidden, ...props }: ComponentProps<"div"> & { selected: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const strip = ref.current;
    if (!strip || hidden) return;
    const reveal = () => {
      const tab = strip.querySelector<HTMLElement>('[aria-selected="true"]')?.closest<HTMLElement>("[data-tab-id]");
      if (!tab || !strip.clientWidth) return;
      const left = strip.getBoundingClientRect().left + strip.clientLeft;
      const right = left + strip.clientWidth;
      const bounds = tab.getBoundingClientRect();
      // Move only this strip, never the document or another scroll ancestor.
      // An oversized tab already covering the viewport needs no adjustment.
      if (bounds.left < left && bounds.right < right) strip.scrollLeft += bounds.left - left;
      else if (bounds.right > right && bounds.left > left) strip.scrollLeft += Math.min(bounds.right - right, bounds.left - left);
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [selected, hidden]);

  return <div {...props} ref={ref} hidden={hidden} className="note-tabs" role="tablist" aria-label="Open notes" />;
}
