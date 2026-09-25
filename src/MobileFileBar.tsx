import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, FileText, Pencil, Plus, X } from "lucide-react";
import { tabId, type NoteTab } from "./tabs";

export default function MobileFileBar({ tabs, selected, onSelect, onNew, viewControls, onRename, onCloseTab }: {
  tabs: NoteTab[]; selected: string | null; onSelect: (tab: NoteTab) => void;
  viewControls?: ReactNode; onNew: () => void; onRename?: () => void; onCloseTab: (tab: NoteTab) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = tabs.find(tab => tabId(tab) === selected);
  return <div className="mobile-file-bar">
    <button className="mobile-file-picker" aria-label={`Open files${current ? `: ${current.path.split("/").at(-1)}` : ""}`}
      aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}>
      <FileText size={17} /><span>{current?.path.split("/").at(-1) ?? "Open files"}</span>
      <span className="mobile-file-count">{tabs.length}</span><ChevronDown size={16} />
    </button>
    {viewControls}
    {onRename && <button className="icon-button" aria-label="Rename current file" onClick={onRename}><Pencil size={17} /></button>}
    <button className="mobile-new-note" aria-label="New note" onClick={onNew}><Plus size={19} /><span>New</span></button>
    {open && <OpenFiles tabs={tabs} selected={selected} onSelect={tab => { setOpen(false); onSelect(tab); }}
      onCloseTab={tab => { setOpen(false); onCloseTab(tab); }} onClose={() => setOpen(false)} />}
  </div>;
}

function OpenFiles({ tabs, selected, onSelect, onCloseTab, onClose }: {
  tabs: NoteTab[]; selected: string | null; onSelect: (tab: NoteTab) => void;
  onCloseTab: (tab: NoteTab) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="mobile-files-dialog" aria-labelledby="open-files-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h2 id="open-files-title">Open files</h2><button className="icon-button" aria-label="Done" onClick={onClose}><X size={20} /></button></header>
    {tabs.length ? <ul>{tabs.map(tab => <li key={tabId(tab)}>
      <button className="mobile-file-choice" aria-current={selected === tabId(tab) ? "page" : undefined} onClick={() => onSelect(tab)}>
        <FileText size={18} /><span>{tab.path}</span>
      </button>
      <button className="icon-button" aria-label={`Close ${tab.path}`} onClick={() => onCloseTab(tab)}><X size={17} /></button>
    </li>)}</ul> : <p>No open files.</p>}
  </dialog>;
}
