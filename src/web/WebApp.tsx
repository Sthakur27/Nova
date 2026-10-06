import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { Cloud, FileText, Plus, RefreshCw, PanelLeft, Orbit, Settings2, Search, Maximize2, Minimize2, ChevronLeft, ChevronRight } from "lucide-react";
import MobileNoteCarousel, { adjacentNote } from "../MobileNoteCarousel";
import useWebLayout from "./useWebLayout";
import useConnectionPrompt from "./useConnectionPrompt";
import ReplaceDriveDialog from "./ReplaceDriveDialog";
import AppearanceDialog from "./AppearanceDialog";
import CloudDialog from "./CloudDialog";
import FilenameDialog from "./FilenameDialog";
import BuiltinDocs from "../BuiltinDocs";
import { loadIdentity, WebAuth } from "./auth";
import { BrowserDrive, DriveError } from "./drive";
import { WebStore, pendingNote, type Account, type Space, type WebNote, type RemoteCopy } from "./store";
import { acceptLocalCopy, acceptDriveCopy, createNote, syncAccount } from "./sync";
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
  const [replacing, setReplacing] = useState<{ key: string; name: string; account: string; copy: RemoteCopy }>();
  const [showCloud, setShowCloud] = useState(false);
  useConnectionPrompt({ connected: () => !!auth.current(), connecting, open: showCloud, request: () => setShowCloud(true) });
  const { mobile, focused, setFocused } = useWebLayout();
  const [showAppearance, setShowAppearance] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [wide, setWide] = useState(false);
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
      const sameAccount = accountRef.current?.id === session.account.id;
      accountRef.current = session.account; setAccount(session.account);
      if (!sameAccount) { setSelected(""); setFocused(false); setNotes([]); setSpaces([]); }
      setConnected(true); setConnecting(false); await refresh();
      void navigator.storage?.persist?.().catch(() => false);
      void syncRef.current();
    }).catch(error => { auth.disconnect(); setConnected(false); setError(String(error)); }).finally(() => setConnecting(false));
  }
  const selectNote = async (key: string) => {
    try { await editor.current?.flush(); setSelected(key); setShowNote(true); return true; }
    catch (error) { setError(String(error)); return false; }
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
  const status = error ? "Sync needs attention" : !online ? "Offline" : connecting ? "Connecting…" : syncing ? "Syncing…" : !connected ? account ? "Reconnect to sync" : "Connect Google Drive" : pending ? `${pending} pending` : "Up to date";
  const panelControl = <>
    <button className="web-panel-toggle" title={sidebar ? "Hide sidebar" : "Show sidebar"} aria-label={sidebar ? "Hide sidebar" : "Show sidebar"} aria-expanded={sidebar} onClick={() => setSidebar(value => !value)}><PanelLeft size={18}/></button>
    <button className="web-mobile-back" title="Show notes" aria-label="Show notes" onClick={() => { setShowNote(false); setFocused(false); }}><PanelLeft size={18}/></button>
  </>;
  const noteIds = visible.map(note => note.key);
  const navigate = (direction: -1 | 1) => {
    const key = adjacentNote(noteIds, selected, direction);
    if (key) void selectNote(key);
  };
  const focusControl = <button className="web-focus-enter" title="Focus mode" aria-label="Enter focus mode" onClick={() => setFocused(true)}><Maximize2 size={18}/></button>;
  return <div className="web-app" data-note-open={showNote} data-sidebar={sidebar} data-wide={wide} data-focused={focused}>
    {focused && <button className="web-focus-exit" title="Exit focus mode · Escape" aria-label="Exit focus mode" onClick={() => setFocused(false)}><Minimize2 size={18}/></button>}
    {replacing && <ReplaceDriveDialog name={replacing.name} onClose={() => setReplacing(undefined)} onConfirm={async () => {
      if (syncingRef.current) throw new Error("Wait for sync to finish, then try again.");
      syncingRef.current = true; setSyncing(true);
      try {
        await editor.current?.flush();
        if (accountRef.current?.id !== replacing.account) throw new Error("The connected account changed. Review this note again.");
        await acceptLocalCopy(store, replacing.key, replacing.copy);
        await refresh();
      } finally { syncingRef.current = false; setSyncing(false); }
      void syncRef.current();
    }} />}
    {showAppearance && <AppearanceDialog wide={wide} onWideChange={setWide} onClose={() => setShowAppearance(false)} />}
    {creating && <FilenameDialog title="New note" initialName={creating.name} action="Create note" onClose={() => setCreating(undefined)} onSubmit={async name => {
      if (accountRef.current?.id !== creating.account) throw new Error("The connected account changed. Close this dialog and try again.");
      const note = await createNote(store, creating.account, creating.space, name, creating.text);
      await refresh(); setSelected(note.key); setShowNote(true); saved();
    }} />}
    {showCloud && <CloudDialog onClose={() => setShowCloud(false)}>
      {account && <p className="web-cloud-account">{account.email}</p>}
      <p role="status">{!online ? "Offline · using device copies" : connecting ? "Connecting…" : syncing ? "Syncing…" : connected ? "Connected to Google Drive" : account ? "Reconnect to sync" : "Connect your Google Drive account"}</p>
      <p className="web-cloud-help">{notes.length} downloaded · {pending} pending</p>
      {!connected && <p className="web-cloud-help">Sign in to sync with Google Drive. Your downloaded notes are still available on this device.</p>}
      <div className="web-cloud-actions">
        <button disabled={connecting || syncing || saving || !auth.clientId || !identityReady || !online} onClick={connect}>{connected || account ? "Reconnect" : "Connect Google Drive"}</button>
        {!connected && !connecting && <button onClick={() => setShowCloud(false)}>Continue without syncing</button>}
        {connecting && <button onClick={() => auth.disconnect()}>Cancel sign-in</button>}
        {connected && <button disabled={syncing || saving} onClick={() => { auth.disconnect(); setConnected(false); }}>Disconnect</button>}
      </div>
      {!auth.clientId && <p>Google Drive is not configured for this preview yet.</p>}
      {auth.clientId && !identityReady && !connecting && <p>Google sign-in is not ready. <button onClick={prepareIdentity}>Retry loading sign-in</button></p>}
      {error && <p className="web-error" role="alert">{error}</p>}
    </CloudDialog>}
    {error && !showCloud && <div className="web-notices"><p className="web-error" role="alert">{error} <button onClick={() => setShowCloud(true)}>Open sync settings</button></p></div>}
    <div className="web-body">
      <aside className="web-library" aria-label="Cloud notes">
        <div className="web-brand"><span className="web-monogram" aria-hidden="true">N</span><span>nova<span className="web-brand-dot">.</span></span><Orbit size={22} aria-hidden="true"/></div>
        <label className="web-search"><Search size={16}/><input aria-label="Search downloaded notes" placeholder="Quick find…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="web-library-heading"><h1><Cloud size={14}/>Cloud</h1><button title="Refresh Cloud" aria-label="Refresh Cloud" disabled={!connected || syncing || saving || !online} onClick={() => void sync()}><RefreshCw size={18}/></button><button aria-label="New note" disabled={!space || saving || connecting} onClick={() => void newNote()}><Plus size={20}/></button></div>
        {spaces.length > 0 && <label className="web-space">Space<select value={space} onChange={event => setSpace(event.target.value)}>{spaces.map(space => <option value={space.id} key={space.id}>{space.name}</option>)}</select></label>}
        <nav className="web-files" aria-label="Notes">{visible.map(note => <button key={note.key} aria-current={selected === note.key ? "page" : undefined} onClick={() => void selectNote(note.key)}><FileText size={17}/><span>{note.name}{(note.directory || note.conflict || note.missing || note.error || pendingNote(note)) && <small>{[note.directory, note.conflict || note.missing || note.error ? "needs attention" : pendingNote(note) ? "pending" : ""].filter(Boolean).join(" · ")}</small>}</span></button>)}</nav>
        {!visible.length && <p className="web-empty">{loading ? "Opening device copies…" : query ? "No downloaded notes match." : account ? "Refresh Cloud or create your first note." : "Connect Google Drive to bring your Cloud notes here."}</p>}
        <footer>
          <button className="web-sync-status" onClick={() => setShowCloud(true)}><span data-attention={!!error || pending > 0}/><span role="status">{status}</span></button>
          <div className="web-orbit-controls" aria-label="Workspace controls">
            <button className="web-orbit-new" title="New note" aria-label="Create a note" disabled={!space || saving || connecting} onClick={() => void newNote()}><Plus size={20}/></button>
            <button className="web-orbit-settings" title="Appearance" aria-label="Appearance" aria-haspopup="dialog" onClick={() => setShowAppearance(true)}><Settings2 size={19}/></button>
            <button className="web-cloud-button" title="Google Drive settings" aria-label="Google Drive settings" aria-haspopup="dialog" aria-expanded={showCloud} data-attention={!!error || (!!account && !connected)} onClick={() => setShowCloud(true)}><Cloud size={20}/></button>
            <BuiltinDocs />
          </div>
        </footer>
      </aside>
      <main className="web-main">
        {!note && <div className="web-empty-controls">{panelControl}</div>}
        <MobileNoteCarousel enabled={mobile && showNote && !!note} ids={noteIds} selected={selected} onSelect={selectNote}
          renderPreview={key => {
            const preview = notes.find(note => note.key === key);
            return <article className="web-swipe-preview"><h1>{preview?.name}</h1><pre>{preview?.text.slice(0, 6000)}</pre></article>;
          }}>
        {note ? <>
          {(note.conflict || note.missing || note.error) && <section className="web-conflict" aria-label="Sync needs attention"><p role="alert">{note.error}</p>
            {syncing && <p role="status">Checking Drive… Conflict controls will be available when sync finishes. You can keep editing or export your edits.</p>}
            {note.conflict && <><button disabled={syncing || saving} onClick={() => setReplacing({ key: note.key, name: note.name, account: note.account, copy: note.conflict! })}>Replace Drive with my version</button><details><summary>Review the Drive copy: {note.conflict.name}</summary><pre>{note.conflict.text}</pre></details>
              <button disabled={syncing || saving} onClick={() => void (async () => { try { await editor.current?.flush(); await acceptDriveCopy(store, note.key); await refresh(); } catch (error) { setError(String(error)); } })()}>Use Drive copy</button></>}
            {(note.conflict || note.missing) && <button disabled={saving || syncing} onClick={() => void newNote(note)}>Save local text as a new note</button>}
            <button onClick={() => editor.current?.export()}>Export my edits</button>
          </section>}
          {note.recovery?.map((recovery, index) => <div className="web-recovery" key={index}>Recovery copy {index + 1} retained. <button onClick={() => exportText(`Recovered ${recovery.name}`, recovery.text)}>Export recovery copy</button></div>)}
          <NoteEditor key={note.key} ref={editor} note={note} store={store} onSaved={saved} onSaving={setSaving} panelControl={panelControl} focusControl={focusControl}/>
        </> : <section className="web-setup"><Orbit size={46}/><h1>A little space to think.</h1><p>{notes.length ? "Pick a note. Make some room for an idea." : "Your notes, wherever you are."}</p>{space ? <button onClick={() => void newNote()}><Plus size={16}/>Create a note</button> : <button onClick={() => setShowCloud(true)}><Cloud size={16}/>Connect Google Drive</button>}</section>}
        </MobileNoteCarousel>
        {note && <nav className="web-note-navigation" aria-label="Browse notes">
          <button aria-label="Previous note" disabled={noteIds.length < 2 || !noteIds.includes(selected)} onClick={() => navigate(-1)}><ChevronLeft size={18}/></button>
          <span>{noteIds.includes(selected) ? `${noteIds.indexOf(selected) + 1} / ${noteIds.length}` : "Filtered note"}</span>
          <button aria-label="Next note" disabled={noteIds.length < 2 || !noteIds.includes(selected)} onClick={() => navigate(1)}><ChevronRight size={18}/></button>
        </nav>}
      </main>
    </div>
  </div>;
}
