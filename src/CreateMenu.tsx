import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Folder, Plus } from "lucide-react";
import { recentMenuPosition } from "./recentMenuPosition";

export default function CreateMenu({ label, disabled, onFile, onFolder }: {
  label: string; disabled?: boolean; onFile: () => void; onFolder?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = open && !disabled;
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!visible || !trigger.current || !menu.current) return;
    const box = menu.current.getBoundingClientRect();
    setPosition(recentMenuPosition(trigger.current.getBoundingClientRect(), box.width, box.height, window.innerWidth, window.innerHeight));
    menu.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
    };
  }, [visible]);
  return <>
    <button ref={trigger} className="icon-button explorer-create" aria-label={label} title={`${label} — New file or folder`} disabled={disabled}
      aria-haspopup="menu" aria-expanded={visible} aria-controls={visible ? id : undefined} onClick={() => setOpen(value => !value)}>
      <Plus size={15} aria-hidden="true"/>
    </button>
    {visible && createPortal(<div ref={menu} id={id} className="recent-folders-menu create-menu" role="menu" aria-label={label} style={position}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); dismiss(); }
        if (event.key === "Tab") dismiss();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}>
      <button role="menuitem" onClick={() => { dismiss(); onFile(); }}><FileText size={14}/>New file</button>
      <button role="menuitem" disabled={!onFolder} onClick={() => { dismiss(); onFolder?.(); }}><Folder size={14}/>New folder</button>
    </div>, document.body)}
  </>;
}
