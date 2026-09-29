import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, FolderOpen } from "lucide-react";
import { recentMenuPosition } from "./recentMenuPosition";
import type { RecentFolder } from "./localFolders";

export default function OpenWindowMenu({ onLocal, onCloud, folders = [], onRecent, onClear }: {
  onLocal: () => void; onCloud: () => void; folders?: RecentFolder[];
  onRecent?: (folder: RecentFolder) => void; onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = open;
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
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("blur", close);
    };
  }, [visible]);
  return <>
    <button ref={trigger} className="icon-button" aria-label="Open window" title="Open folder or Cloud window · Recent folders"
      aria-haspopup="menu" aria-expanded={visible} aria-controls={visible ? id : undefined} onClick={() => setOpen(value => !value)}>
      <FolderOpen size={18} aria-hidden="true"/>
    </button>
    {visible && createPortal(<div ref={menu} id={id} className="recent-folders-menu open-window-menu" role="menu" aria-label="Open window" style={position}
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
      <button role="menuitem" onClick={() => { dismiss(); onLocal(); }}><FolderOpen size={15}/>Open Local Folder…</button>
      <button role="menuitem" onClick={() => { dismiss(); onCloud(); }}><Cloud size={15}/>Open Cloud-only Window</button>
      {!!folders.length && <>
        <hr role="separator"/>
        <span className="recent-label">Recent folders</span>
        {folders.map(folder => <button role="menuitem" key={folder.root} title={folder.root} onClick={() => { dismiss(); onRecent?.(folder); }}>
          <span><strong>{folder.name}</strong><small>{folder.root}</small></span>
        </button>)}
        {onClear && <button role="menuitem" className="recent-clear" onClick={() => { dismiss(); onClear(); }}>Clear recent folders</button>}
      </>}
    </div>, document.body)}
  </>;
}
