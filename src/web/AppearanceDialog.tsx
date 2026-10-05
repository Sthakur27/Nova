import { useEffect, useId, useRef } from "react";
import { Settings2, X } from "lucide-react";

export default function AppearanceDialog({ wide, onWideChange, onClose }: {
  wide: boolean; onWideChange: (wide: boolean) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    closeButton.current?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="rename-dialog web-cloud-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><Settings2 size={22}/><h2 id={title}>Appearance</h2><button ref={closeButton} aria-label="Close appearance" onClick={onClose}><X size={18}/></button></header>
    <p className="web-cloud-help">Writing width</p>
    <div className="web-cloud-actions" role="group" aria-label="Writing width">
      <button aria-pressed={!wide} onClick={() => onWideChange(false)}>Focused</button>
      <button aria-pressed={wide} onClick={() => onWideChange(true)}>Wide</button>
    </div>
  </dialog>;
}
