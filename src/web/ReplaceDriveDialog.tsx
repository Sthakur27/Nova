import { useEffect, useId, useRef, useState } from "react";

export default function ReplaceDriveDialog({ name, onConfirm, onClose }: {
  name: string; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const title = useId();
  const busy = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!; element.showModal(); cancel.current?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="rename-dialog web-cloud-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <h2 id={title}>Replace the Drive copy?</h2>
    <p>Your version of <strong>{name}</strong> will replace the reviewed Drive version when sync connects. A recovery copy of that Drive version will stay on this device.</p>
    <p className="web-cloud-help">If Drive changes again, Nova will ask you to review it again.</p>
    {error && <p className="web-error" role="alert">{error}</p>}
    <div className="web-cloud-actions">
      <button ref={cancel} disabled={pending} onClick={onClose}>Cancel</button>
      <button disabled={pending} onClick={() => {
        if (busy.current) return;
        busy.current = true; setPending(true);
        void onConfirm().then(onClose).catch(error => setError(String(error))).finally(() => { busy.current = false; setPending(false); });
      }}>{pending ? "Preparing…" : "Replace Drive with my version"}</button>
    </div>
  </dialog>;
}
