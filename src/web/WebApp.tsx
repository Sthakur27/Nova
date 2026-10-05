import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { Cloud, FileText, Plus, RefreshCw, ArrowLeft } from "lucide-react";
import FilenameDialog from "./FilenameDialog";
import BuiltinDocs from "../BuiltinDocs";
import { loadIdentity, WebAuth } from "./auth";
import { BrowserDrive, DriveError } from "./drive";
import { WebStore, pendingNote, type Account, type Space, type WebNote } from "./store";
import { acceptDriveCopy, createNote, syncAccount } from "./sync";
import NoteEditor, { exportText, type NoteEditorHandle } from "./NoteEditor";

declare const __NOVA_WEB_CLIENT_ID__: string;
const ACCOUNT_KEY = "nova-web-account-v1";
function lastAccount(): Account | undefined {
  try {
    const account = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? "null");
    return typeof account?.id === "string" && typeof account.email === "string" ? account : undefined;
  } catch { return undefined; }
}
export default function WebApp() {
  const [locked, setLocked] = useState(false);
  const [lockError, setLockError] = useState("");
  useEffect(() => {
    if (!navigator.locks) { setLockError("Nova web needs a browser with Web Locks to save safely. Update Safari or use a current desktop browser."); return; }
    let release: (() => void) | undefined; let disposed = false;
    void navigator.locks.request("nova-web-editor-v1", { ifAvailable: true }, async lock => {
      if (disposed) return;
      if (!lock) { setLockError("Nova is already open in another tab or window. Continue there, or close it and reload this page."); return; }
      setLocked(true);
      await new Promise<void>(resolve => { release = resolve; });
    }).catch(error => setLockError(String(error)));
    return () => { disposed = true; release?.(); };
  }, []);
  if (!locked) return <main className="web-setup"><Cloud size={36}/><h1>Nova Notes</h1><p role="status">{lockError || "Opening your workspace…"}</p>{lockError && <button onClick={() => location.reload()}>Try again</button>}</main>;
  return <Workspace />;
}
function Workspace() {
  const [store] = useState(() => new WebStore());
  const [auth] = useState(() => new WebAuth(__NOVA_WEB_CLIENT_ID__));
  const [account, setAccount] = useState(lastAccount);
  const accountRef = useRef(account); accountRef.current = account;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [notes, setNotes] = useState<WebNote[]>([]);
  const [selected, setSelected] = useState("");
  const [space, setSpace] = useState("");
  const [creating, setCreating] = useState<{ account: string; space: string; name: string; text: string }>();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [identityReady, setIdentityReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [showNote, setShowNote] = useState(false);
  const editor = useRef<NoteEditorHandle>(null);
  const syncingRef = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(async () => {
    await store.ready();
    const id = accountRef.current?.id;
    if (!id) { setSpaces([]); setNotes([]); setLoading(false); return; }
    const [spaces, notes] = await Promise.all([store.spaces(id), store.notes(id)]);
    if (id !== accountRef.current?.id) return;
    setSpaces(spaces); setNotes(notes); setSpace(old => spaces.some(space => space.id === old) ? old : spaces[0]?.id ?? "");
    setLoading(false);
  }, [store]);
  useEffect(() => { void refresh().catch(error => { setLoading(false); setError(String(error)); }); }, [account, refresh]);
  const prepareIdentity = useCallback(() => {
    if (!auth.clientId) return;
    void loadIdentity().then(() => setIdentityReady(true)).catch(error => setError(String(error)));
  }, [auth]);
  useEffect(prepareIdentity, [prepareIdentity]);
  useEffect(() => {
    const timer = setInterval(() => setConnected(!!auth.current()), 10000);
    const resume = () => { setOnline(navigator.onLine); if (!document.hidden && navigator.onLine) void syncRef.current(); };
    window.addEventListener("online", resume); window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume); window.addEventListener("focus", resume);
    const poll = setInterval(() => { if (!document.hidden) void syncRef.current(); }, 60000);
    return () => { auth.disconnect(); clearInterval(timer); clearInterval(poll); clearTimeout(syncTimer.current); window.removeEventListener("online", resume); window.removeEventListener("offline", resume); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [auth]);
  async function sync() {
    const session = auth.current(); setConnected(!!session);
    if (!session || session.account.id !== accountRef.current?.id || syncingRef.current || !navigator.onLine || document.hidden) return;
    syncingRef.current = true; setSyncing(true);
    try {
      await editor.current?.flush();
      await syncAccount(store, new BrowserDrive(session));
      setError("");
    } catch (error) {
      if (error instanceof DriveError && error.status === 401) { auth.disconnect(); setConnected(false); }
      setError(String(error));
    } finally {
      syncingRef.current = false; setSyncing(false);
      await refresh().catch(error => setError(String(error)));
    }
  }
  syncRef.current = sync;
  function saved() {
    void refresh().catch(error => setError(String(error)));
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncRef.current(), 1800);
  }
  function connect() {
    // Initiate GIS before any await so Safari keeps the user's popup activation.
    const connection = auth.connect(); setConnecting(true); setConnected(false); setError("");
    void connection.then(async session => {
      await editor.current?.flush();
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(session.account));
      accountRef.current = session.account; setAccount(session.account); setSelected(""); setNotes([]); setSpaces([]);
      setConnected(true); await refresh();
      void navigator.storage?.persist?.().catch(() => false);
      await syncRef.current();
    }).catch(error => { auth.disconnect(); setConnected(false); setError(String(error)); }).finally(() => setConnecting(false));
  }
  const selectNote = async (key: string) => {
    try { await editor.current?.flush(); setSelected(key); setShowNote(true); }
    catch (error) { setError(String(error)); }
  };
  async function newNote(copy?: WebNote) {
    try {
      await editor.current?.flush();
      const destination = copy?.space ?? space;
      if (!account || !destination) throw new Error("Connect Drive and open a Cloud space first.");
      setCreating({ account: account.id, space: destination, name: copy ? `Copy of ${copy.name}` : "Untitled.md", text: copy?.text ?? "" });
    } catch (error) { setError(String(error)); }
  }
  const note = notes.find(note => note.key === selected);
  const pending = notes.filter(pendingNote).length;
  const search = useDeferredValue(query.toLocaleLowerCase());
  const visible = notes.filter(note => (!space || note.space === space) && (!search || `${note.directory}/${note.name}\n${note.text}`.toLocaleLowerCase().includes(search))).sort((a, b) => `${a.directory}/${a.name}`.localeCompare(`${b.directory}/${b.name}`));
  return <div className="web-app" data-note-open={showNote}>
    {creating && <FilenameDialog title="New note" initialName={creating.name} action="Create note" onClose={() => setCreating(undefined)} onSubmit={async name => {
      if (accountRef.current?.id !== creating.account) throw new Error("The connected account changed. Close this dialog and try again.");
      const note = await createNote(store, creating.account, creating.space, name, creating.text);
      await refresh(); setSelected(note.key); setShowNote(true); saved();
    }} />}
    <header className="web-header"><div className="web-brand"><Cloud size={23}/><span>Nova <small>WEB PREVIEW</small></span></div>
      <div className="web-connection"><span title={account?.email}>{!online ? "Offline · device copies" : connecting ? "Connecting…" : syncing ? "Syncing…" : connected ? account?.email : account ? "Reconnect to sync" : "Cloud notes"}</span>
        <button disabled={connecting || syncing || saving || !auth.clientId || !identityReady || !online} onClick={connect}>{connected || account ? "Reconnect" : "Connect Google Drive"}</button>
        {connecting && <button onClick={() => auth.disconnect()}>Cancel</button>}
        {connected && <button disabled={syncing || saving} onClick={() => { auth.disconnect(); setConnected(false); }}>Disconnect</button>}
        <BuiltinDocs />
      </div>
    </header>
    <div className="web-notices">
      {!auth.clientId && <p>Google Drive is not configured for this preview yet.</p>}
      {auth.clientId && !identityReady && !connecting && <p>Google sign-in is not ready. <button onClick={prepareIdentity}>Retry loading sign-in</button></p>}
      {account && !connected && <p>Your downloaded notes remain editable. Reconnect Google Drive to upload pending edits.</p>}
      {error && <p className="web-error" role="alert">{error}</p>}
    </div>
    <div className="web-body">
      <aside className="web-library" aria-label="Cloud notes">
        <div className="web-library-heading"><h1>Cloud</h1><button title="Refresh Cloud" aria-label="Refresh Cloud" disabled={!connected || syncing || saving || !online} onClick={() => void sync()}><RefreshCw size={18}/></button><button aria-label="New note" disabled={!space || saving || connecting} onClick={() => void newNote()}><Plus size={20}/></button></div>
        {spaces.length > 0 && <label className="web-space">Space<select value={space} onChange={event => setSpace(event.target.value)}>{spaces.map(space => <option value={space.id} key={space.id}>{space.name}</option>)}</select></label>}
        <input aria-label="Search downloaded notes" placeholder="Search downloaded notes…" value={query} onChange={event => setQuery(event.target.value)} />
        <nav className="web-files" aria-label="Notes">{visible.map(note => <button key={note.key} aria-current={selected === note.key ? "page" : undefined} onClick={() => void selectNote(note.key)}><FileText size={17}/><span>{note.name}<small>{note.directory || "Cloud"}{note.conflict || note.missing || note.error ? " · needs attention" : pendingNote(note) ? " · pending" : ""}</small></span></button>)}</nav>
        {!visible.length && <p className="web-empty">{loading ? "Opening device copies…" : query ? "No downloaded notes match." : account ? "Refresh Cloud or create your first note." : "Connect Google Drive to bring your Cloud notes here."}</p>}
        <footer>{notes.length} downloaded · {pending} pending<p>Sync runs while Nova is open. Export important unsynced notes before clearing browser data.</p></footer>
      </aside>
      <main className="web-main">
        <button className="web-back" onClick={() => setShowNote(false)}><ArrowLeft size={17}/>All notes</button>
        {note ? <>
          {(note.conflict || note.missing || note.error) && <section className="web-conflict" aria-label="Sync needs attention"><p role="alert">{note.error}</p>
            {note.conflict && <><details><summary>Review the Drive copy: {note.conflict.name}</summary><pre>{note.conflict.text}</pre></details>
              <button disabled={syncing || saving} onClick={() => void (async () => { try { await editor.current?.flush(); await acceptDriveCopy(store, note.key); await refresh(); } catch (error) { setError(String(error)); } })()}>Use Drive copy · keep local recovery</button></>}
            {(note.conflict || note.missing) && <button disabled={saving || syncing} onClick={() => void newNote(note)}>Save local text as a new note</button>}
            <button onClick={() => editor.current?.export()}>Export my edits</button>
          </section>}
          {note.recovery?.map((recovery, index) => <div className="web-recovery" key={index}>Previous local version {index + 1} retained. <button onClick={() => exportText(`Recovered ${recovery.name}`, recovery.text)}>Export recovery copy</button></div>)}
          <NoteEditor key={note.key} ref={editor} note={note} store={store} onSaved={saved} onSaving={setSaving}/>
        </> : <section className="web-setup"><Cloud size={42}/><h1>A little space to think.</h1><p>Your Cloud notes, directly from Google Drive.</p><p>Open a downloaded note or connect your account to get started.</p>{space && <button onClick={() => void newNote()}>Create a note</button>}</section>}
      </main>
    </div>
  </div>;
}
