import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, History } from "lucide-react";
import type { RecentFolder } from "./localFolders";

export function recentMenuPosition(anchor: Pick<DOMRect, "right" | "top" | "bottom">, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const left = Math.max(8, Math.min(anchor.right - width, viewportWidth - width - 8));
  const below = anchor.bottom + 6;
  const preferred = below + height <= viewportHeight - 8 ? below : anchor.top - height - 6;
  return { left, top: Math.max(8, Math.min(preferred, viewportHeight - height - 8)) };
}

export default function RecentFolders({ folders, onOpen, onClear, onCloud }: {
  folders: RecentFolder[];
  onOpen?: (folder: RecentFolder) => void;
  onClear?: () => void;
  onCloud?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = open && (folders.length > 0 || !!onCloud);
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!visible || !trigger.current || !menu.current) return;
    const box = menu.current.getBoundingClientRect();
    setPosition(recentMenuPosition(trigger.current.getBoundingClientRect(), box.width, box.height, window.innerWidth, window.innerHeight));
    menu.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [visible, folders.length]);
  useEffect(() => {
    if (!visible) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    // Scrolling the menu itself must not dismiss it.
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [visible]);
  if (!folders.length && !onCloud) return null;
  return <>
    <button ref={trigger} className="icon-button recent-folders-trigger" aria-label="Open Recent" title="Open Recent"
      aria-haspopup="menu" aria-expanded={visible} aria-controls={visible ? id : undefined} onClick={() => setOpen(value => !value)}>
      <History size={15} aria-hidden="true"/>
    </button>
    {visible && createPortal(<div ref={menu} id={id} className="recent-folders-menu" role="menu" aria-label="Recent folders" style={position}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); dismiss(); }
        if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); }
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}>
      {onCloud && <button role="menuitem" onClick={() => { dismiss(); onCloud(); }}><Cloud size={15} aria-hidden="true"/>Open Cloud-only Window</button>}
      {!!folders.length && <>
      {onCloud && <hr role="separator"/>}
      <span className="recent-label">Recent local folders</span>
      {folders.map(folder => <button role="menuitem" key={folder.root} title={folder.root} onClick={() => { dismiss(); onOpen?.(folder); }}>
        <span><strong>{folder.name}</strong><small>{folder.root}</small></span>
      </button>)}
      {onClear && <button role="menuitem" className="recent-clear" onClick={() => { dismiss(); onClear(); }}>Clear Recents</button>}
      </>}
    </div>, document.body)}
  </>;
}
