import { useEffect, useRef, type ReactNode } from "react";
import { initialScrollTop, trackScrollSpace } from "./scrollSpace";
import { mobile } from "./platform";

/** Wait for lazy reader content to grow before applying a saved position. */
export default function ReadPaneSurface({ children, scrollTop, onElement }: {
  children: ReactNode; scrollTop?: number; onElement: (element: HTMLDivElement | null) => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = surface.current!;
    let observer: ResizeObserver | undefined;
    const stop = () => observer?.disconnect();
    const position = () => {
      const top = scrollTop ?? initialScrollTop(element, mobile);
      element.scrollTop = top;
      if (element.scrollHeight - element.clientHeight >= top) stop();
    };
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(position);
      observer.observe(element);
      if (element.querySelector("article")) observer.observe(element.querySelector("article")!);
    }
    position();
    const stopTracking = trackScrollSpace(element, mobile);
    element.addEventListener("wheel", stop, { passive: true });
    element.addEventListener("pointerdown", stop);
    element.addEventListener("keydown", stop);
    return () => {
      stop(); stopTracking(); element.removeEventListener("wheel", stop); element.removeEventListener("pointerdown", stop); element.removeEventListener("keydown", stop);
    };
  }, []);
  return <div className="read-pane" ref={element => { surface.current = element; onElement(element); }}>{children}</div>;
}
