import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

export default function ViewOptions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <div className="view-options" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    }}>
    <button ref={trigger} className="text-width-trigger" aria-expanded={open} aria-controls={open ? id : undefined}
      onMouseDown={event => { if (open) event.preventDefault(); }} onClick={() => setOpen(value => !value)}>
      <SlidersHorizontal size={16} aria-hidden="true" /> View
    </button>
    {open && <div id={id} className="view-options-panel" role="group" aria-label="View options">{children}</div>}
  </div>;
}
