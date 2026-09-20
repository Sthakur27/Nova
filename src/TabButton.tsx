import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";

export default function TabButton({ tooltip, children, ...props }: ComponentProps<"button"> & { tooltip: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!visible || !button.current || !bubble.current) return;
    const anchor = button.current.getBoundingClientRect();
    const bounds = bubble.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8)),
      top: anchor.bottom + bounds.height + 10 <= window.innerHeight - 8
        ? anchor.bottom + 10 : Math.max(8, anchor.top - bounds.height - 10),
    });
    const dismiss = () => setVisible(false);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [visible, tooltip]);

  return <>
    <button {...props} ref={button} aria-describedby={visible ? id : undefined}
      onPointerEnter={event => { if (event.pointerType !== "touch") setVisible(true); props.onPointerEnter?.(event); }}
      onPointerLeave={event => { setVisible(false); props.onPointerLeave?.(event); }}
      onPointerDown={event => { setVisible(false); props.onPointerDown?.(event); }}
      onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setVisible(true); props.onFocus?.(event); }}
      onBlur={event => { setVisible(false); props.onBlur?.(event); }}>
      {children}
    </button>
    {visible && createPortal(<span ref={bubble} id={id} role="tooltip"
      className="focus-tooltip tab-path-tooltip" style={position}>{tooltip}</span>, document.body)}
  </>;
}
