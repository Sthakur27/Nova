import { useEffect, useId, useRef, useState } from "react";
import { Cloud } from "lucide-react";

export default function ReconnectDialog({ busy, disabled, error, reconnect, onClose }: {
  busy: boolean; disabled?: boolean; error?: string; reconnect: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), button = useRef<HTMLButtonElement>(null);
  const title = useId(), description = useId();
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!; element.showModal(); button.current?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="settings-dialog reconnect-dialog" aria-labelledby={title} aria-describedby={description}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <Cloud size={36} aria-hidden="true" />
    <h2 id={title}>Reconnect Google Drive</h2>
    <p id={description}>Sync is paused. Your downloaded notes and edits stay on this device. Reconnect to sync changes across your devices.</p>
    <div className="reconnect-actions">
      <button ref={button} className="reconnect-primary" disabled={busy || disabled} onClick={() => { setAttempted(true); reconnect(); }}>{busy ? "Waiting for Google…" : "Reconnect"}</button>
      <button onClick={onClose}>Continue without syncing</button>
    </div>
    <p className="reconnect-help">If you continue without syncing, we’ll remind you in an hour while Nova is open and online.</p>
    {attempted && error && !busy && <p role="alert">{error}</p>}
  </dialog>;
}
