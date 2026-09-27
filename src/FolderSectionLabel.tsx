import { useLayoutEffect, useRef, useState } from "react";

/** Measure the full name independently of the displayed fallback. */
export default function FolderSectionLabel({ name }: { name: string }) {
  const container = useRef<HTMLSpanElement>(null), measure = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const update = () => {
      if (container.current && measure.current) setFits(measure.current.getBoundingClientRect().width <= container.current.getBoundingClientRect().width);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container.current!);
    observer.observe(measure.current!);
    return () => observer.disconnect();
  }, [name]);
  return <span ref={container} className="folder-section-label">
    <span ref={measure} className="folder-section-measure" aria-hidden="true">{name}</span>
    <span>{fits ? name : "Local"}</span>
  </span>;
}
