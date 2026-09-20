import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import type { useAppUpdate } from "./useAppUpdate";

export default function AppUpdate({ updater }: { updater: ReturnType<typeof useAppUpdate> }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const { phase, version, error, progress } = updater;
  const available = phase === "available" || phase === "ready";
  const busy = phase === "checking" || phase === "downloading" || phase === "installing";
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    title.current?.focus();
    return () => { element.close(); previous?.focus(); };
  }, [open]);
  if (!version || phase === "idle" || phase === "checking" || phase === "current") return null;
  const label = phase === "ready" ? "Restart to update Nova" : `Nova ${version} available`;
  return <>
    <section aria-labelledby="settings-updates"><h2 id="settings-updates">Update available</h2>
      <div className="settings-row">
        <div><label>Nova {version}</label><p>{phase === "ready" ? "Downloaded and ready to install." : phase === "downloading" ? "Your update is downloading." : "A new version of Nova is available."}</p></div>
        <button className="settings-update-button" data-available={available} aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <ArrowDownToLine size={15} aria-hidden="true" />{phase === "ready" ? "Restart to update" : phase === "downloading" ? "View download" : "Update Nova"}
        </button>
      </div>
    </section>
    {open && <dialog ref={dialog} className="rename-dialog app-update-dialog" aria-labelledby="app-update-title"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); if (phase !== "installing") setOpen(false); }}
      onKeyDown={event => event.stopPropagation()}>
      <h2 id="app-update-title" ref={title} tabIndex={-1}>Nova updates</h2>
      <div role="status" aria-live="polite">
        {phase === "available" && <p>Nova {version} is available to download.</p>}
        {phase === "downloading" && <><p>Downloading Nova {version}{progress === undefined ? "…" : ` · ${progress}%`}</p><progress aria-label="Update download" max={100} value={progress} /></>}
        {phase === "ready" && <p>Nova {version} is ready. Restart to install the update. Your notes and recovery drafts will be preserved. Open terminal sessions will end.</p>}
        {phase === "installing" && <p>Preserving your work and restarting Nova…</p>}
      </div>
      {error && <p role="alert" className="app-update-error">{error}</p>}
      <div className="dialog-buttons">
        <button disabled={phase === "installing"} onClick={() => setOpen(false)}>{phase === "downloading" ? "Continue in background" : "Later"}</button>
        {phase === "ready" || phase === "installing" ? <button disabled={busy} onClick={() => void updater.restart()}><RefreshCw size={14} /> Restart to update</button>
          : <button disabled={busy} onClick={() => void updater.download()}>Download update</button>}
      </div>
    </dialog>}
  </>;
}
