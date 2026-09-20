import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen } from "lucide-react";
import { openWorkspace } from "./storage";
type RemoteWorkspace = {id:string;name:string};
export default function DriveRestore({disabled,onRestored}:{disabled:boolean;onRestored:(root:string)=>Promise<void>}) {
  const [workspaces,setWorkspaces] = useState<RemoteWorkspace[] | null>(null);
  const [selected,setSelected] = useState("");
  const [parent,setParent] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [done,setDone] = useState("");
  async function discover() {
    setBusy(true);setError("");
    try { const entries = await invoke<RemoteWorkspace[]>("drive_workspaces");setWorkspaces(entries);setSelected(entries[0]?.id ?? ""); }
    catch(error) {setError(String(error));} finally {setBusy(false);}
  }
  async function choose() {
    const result = await open({directory:true,multiple:false,title:"Choose where Nova should store downloaded notes"});
    if (typeof result === "string") setParent(result);
  }
  async function restore() {
    setBusy(true);setError("");setDone("");
    try {
      await openWorkspace(parent);
      const root = await invoke<string>("drive_restore",{parent,workspaceId:selected});
      setDone(root); await onRestored(root);
    } catch(error) {setError(String(error));} finally {setBusy(false);}
  }
  return <section className="drive-restore" aria-labelledby="restore-title">
    <h2 id="restore-title">Set up this device</h2>
    <p>Keep using your local folders, or bring notes from another laptop.</p>
    <ol><li>Choose a workspace from your Drive <strong>.nova</strong> folder.</li><li>Choose where to store it on this laptop.</li><li>Nova downloads into a new subfolder and adds it to your navigation.</li></ol>
    <button disabled={disabled || busy} onClick={() => void discover()}><Download size={15}/>{busy ? "Working…" : workspaces ? "Refresh Drive workspaces" : "Bring notes to this device"}</button>
    {workspaces && <div className="restore-fields">
      {!workspaces.length ? <p>No workspaces in Drive yet. Select notes in a local workspace below to upload your first files.</p> : <>
        <label>Drive workspace<select disabled={busy} value={selected} onChange={event=>setSelected(event.target.value)}>{workspaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Store on this laptop<button disabled={busy} onClick={() => void choose().catch(error=>setError(String(error)))}><FolderOpen size={15}/>{parent || "Choose a local folder…"}</button></label>
        {parent && <p>Creates a new “{workspaces.find(item=>item.id===selected)?.name} - …” folder inside {parent}. Existing files stay untouched.</p>}
        <button disabled={!parent || !selected || busy || disabled} onClick={()=>void restore()}>{busy ? "Downloading…" : "Download & open workspace"}</button>
      </>}
    </div>}
    {error && <p role="alert">{error}</p>}{done && <p role="status">Downloaded to {done}</p>}
    <small>Downloaded notes remember their Drive workspace. Saved changes can upload back there. Background downloads and automatic conflict merging are not available yet.</small>
  </section>;
}
