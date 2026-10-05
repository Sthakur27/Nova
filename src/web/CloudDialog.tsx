import { useEffect, useId, useRef, type ReactNode } from "react";
import { Cloud, X } from "lucide-react";

export default function CloudDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
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
    <header><Cloud size={22}/><h2 id={title}>Google Drive</h2><button ref={closeButton} aria-label="Close Google Drive settings" onClick={onClose}><X size={18}/></button></header>
    {children}
    <p className="web-cloud-help">Downloaded notes stay on this device when you disconnect. Reconnect to upload pending edits.</p>
    <p className="web-cloud-help">Sync runs while Nova is open. Export important pending edits before clearing browser data.</p>
  </dialog>;
}
