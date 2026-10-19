import { useEffect, useRef, useState } from "react";

export type CloudFileReview = {
  name: string; localText: string; localRevision: string; remoteText: string; remoteRevision: string;
  remoteName: string; driveId: string; account: string; parent: string;
};
export default function CloudFileDialog({ name, status, review, sync, replace, archive, recoveries, onClose }: {
  name: string; status?: string; review: () => Promise<CloudFileReview>; sync: () => Promise<void>;
  replace: (copy: CloudFileReview, direction: "pull" | "push") => Promise<void>;
  recoveries?: () => Promise<{ name: string; text: string }[]>;
  archive?: (copy: CloudFileReview) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [recovered, setRecovered] = useState<{ name: string; text: string }[]>([]);
  const [copy, setCopy] = useState<CloudFileReview>();
  const [direction, setDirection] = useState<"pull" | "push" | "delete">();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!; element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (error) { setError(String(error)); setCopy(undefined); setDirection(undefined); }
    finally { running.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="settings-dialog web-cloud-dialog cloud-file-dialog" aria-labelledby="cloud-file-title"
    onCancel={event => { event.preventDefault(); if (!running.current) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <h2 id="cloud-file-title">Cloud · Advanced</h2><p><strong>{name}</strong></p>
    <p>{status || "Device changes save locally first. Sync checks this file against Google Drive."}</p>
    <div className="cloud-space-actions">
      <button disabled={busy} onClick={() => void run(async () => { setCopy(undefined); setDirection(undefined); await sync(); setMessage("File checked. Any conflict or error is shown below or beside the note."); })}>Sync this file now</button>
      <button disabled={busy} onClick={() => void run(async () => { setCopy(await review()); if (recoveries) setRecovered(await recoveries()); setDirection(undefined); })}>Review copies / sync details</button>
    </div>
    {copy && <>
      <p>Drive file: {copy.driveId}</p>
      <div className="cloud-copy-review"><details><summary>This device · {copy.name}</summary><pre>{copy.localText}</pre></details>
        <details><summary>Google Drive · {copy.remoteName}</summary><pre>{copy.remoteText}</pre></details></div>
      <div className="cloud-space-actions">
        <button disabled={busy} onClick={() => setDirection("pull")}>Replace device copy with Drive…</button>
        <button disabled={busy} onClick={() => setDirection("push")}>Replace Drive copy with this version…</button>
        {archive && <button disabled={busy} onClick={() => setDirection("delete")}>Move to .deleted…</button>}
      </div>
    </>}
    {copy && direction && <section aria-label="Confirm Cloud file action">
      <p>{direction === "delete" ? `Move “${name}” to this Cloud space’s .deleted folder in Google Drive? Clean copies disappear from connected devices on their next sync. Unsynced edits are retained for recovery.`
        : `Replace ${direction === "pull" ? "this device’s text with the reviewed Drive text" : "the Drive text with this device’s reviewed text"} for “${name}”? The replaced text will be retained as a recovery copy on this device. The file stays in its current folder.`}</p>
      <button disabled={busy} onClick={() => setDirection(undefined)}>Cancel replacement</button>
      <button disabled={busy} onClick={() => void run(async () => {
        if (direction === "delete") { await archive!(copy); onClose(); }
        else { await replace(copy, direction); setCopy(undefined); setDirection(undefined); setMessage("Replacement completed."); if (recoveries) setRecovered(await recoveries()); }
      })}>{direction === "delete" ? "Move to .deleted" : "Confirm replacement"}</button>
    </section>}
    {recovered.map((item, index) => <section key={index}><details><summary>Recovery copy {index + 1} · {item.name}</summary><pre>{item.text}</pre></details><button onClick={() => void run(async () => { await navigator.clipboard.writeText(item.text); setMessage("Recovery text copied."); })}>Copy recovery text</button><button onClick={() => {
      const url = URL.createObjectURL(new Blob([item.text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `Recovered ${item.name}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    }}>Export recovery copy</button></section>)}
    {busy && <p role="status">Checking this file with Drive…</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    <footer className="settings-footer"><button disabled={busy} onClick={onClose}>Done</button></footer>
  </dialog>;
}
