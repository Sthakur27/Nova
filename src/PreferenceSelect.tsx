import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function PreferenceSelect<T extends string>({ id, value, onChange, toolbar = false, label, options, labels }: {
  id?: string;
  toolbar?: boolean;
  value: T;
  onChange: (value: T) => void;
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  if (toolbar) return <div className="text-width-control" ref={root}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    }}>
    <button ref={trigger} className="text-width-trigger" aria-label={`${label}: ${labels[value]}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onMouseDown={(event) => {
        // WebKit can blur the menu to the page instead of focusing the button.
        // Keep focus in the control until click toggles it, so blur cannot reopen it.
        if (open && event.button === 0) event.preventDefault();
      }}
      onClick={() => {
        if (open) trigger.current?.focus();
        setOpen((current) => !current);
      }} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
      }}>
      {label} <ChevronDown size={13} aria-hidden="true" />
    </button>
    {open && <div className="text-width-menu" id={menuId} role="menu" aria-label={label}
      onKeyDown={(event) => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (current + 1) % items.length
          : event.key === "ArrowUp" ? (current + items.length - 1) % items.length
          : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); items[next].focus(); }
      }}>
      {options.map((width) => <button key={width} role="menuitemradio" aria-checked={value === width}
        tabIndex={value === width ? 0 : -1} onClick={() => { onChange(width); setOpen(false); trigger.current?.focus(); }}>
        <span>{labels[width]}</span>{value === width && <Check size={14} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
  return <select id={id} aria-label={label} value={value}
    onChange={(event) => onChange(event.target.value as T)}>
    {options.map((option) => <option key={option} value={option}>{labels[option]}</option>)}
  </select>;
}
