import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Plus, X, TerminalSquare } from "lucide-react";
import { panelSnapDistance, usePanelDrag } from "./usePanelDrag";

const TerminalView = lazy(() => import("./TerminalView"));
const heightKey = "nova:terminal-height:v1";
const defaultHeight = 260;
function readHeight() {
  try {
    const value = Number(localStorage.getItem(heightKey));
    return Number.isFinite(value) && value >= 120 ? Math.min(1000, value) : defaultHeight;
  } catch { return defaultHeight; }
}
export default function TerminalPanel({ open, root, onOpenChange, onStorageError, controlsContainer, hoveredEdge = false, started = true }: {
  started?: boolean; hoveredEdge?: boolean;
  controlsContainer: HTMLElement | null;
  open: boolean; root: string; onOpenChange: (open: boolean) => void; onStorageError: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(readHeight);
  const [maximum, setMaximum] = useState(500);
  const [maximized, setMaximized] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const nextId = useRef(started ? 2 : 1);
  const initialized = useRef(started);
  const [sessions, setSessions] = useState(() => ({ tabs: started ? [{ id: 1, root }] : [], active: started ? 1 : 0 }));
  const activeRoot = sessions.tabs.find(tab => tab.id === sessions.active)?.root ?? root;
  const addSession = () => {
    initialized.current = true;
    const tab = { id: nextId.current++, root };
    setSessions(previous => ({ tabs: [...previous.tabs, tab], active: tab.id }));
    onOpenChange(true);
  };
  useEffect(() => {
    if (!started || initialized.current) return;
    initialized.current = true;
    const tab = { id: nextId.current++, root };
    setSessions({ tabs: [tab], active: tab.id });
  }, [started, root]);
  const closeSession = (id: number) => {
    setSessions(previous => {
      const index = previous.tabs.findIndex(tab => tab.id === id);
      const tabs = previous.tabs.filter(tab => tab.id !== id);
      return { tabs, active: previous.active === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? 0) : previous.active };
    });
  };
  useEffect(() => {
    if (open) document.getElementById(`terminal-tab-${sessions.active}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [sessions.active, open]);
  const drag = useRef({ open, maximized, latest: height });
  const clamp = (value: number) => Math.max(120, Math.min(maximum, value));
  useEffect(() => {
    const main = panel.current?.parentElement;
    if (!main) return;
    const observer = new ResizeObserver(() => setMaximum(Math.max(120, main.clientHeight - 150)));
    observer.observe(main);
    return () => observer.disconnect();
  }, []);
  const persist = (value: number) => {
    setHeight(value);
    try { localStorage.setItem(heightKey, String(value)); } catch { onStorageError(); }
  };
  usePanelDrag({
    bottomOnly: true,
    shell: () => panel.current?.closest<HTMLElement>(".app-shell"),
    onStart: () => {
      drag.current = { open, maximized, latest: open ? panel.current!.getBoundingClientRect().height : 0 };
      return drag.current.latest;
    },
    onMove: (_, size) => {
      drag.current.latest = size;
      setMaximized(false);
      if (size > panelSnapDistance) onOpenChange(true);
      setDraft(size <= panelSnapDistance ? 0 : clamp(size));
    },
    onFinish: (_, commit) => {
      if (commit) {
        if (drag.current.latest <= panelSnapDistance) onOpenChange(false);
        else persist(clamp(drag.current.latest));
      } else { onOpenChange(drag.current.open); setMaximized(drag.current.maximized); }
      setDraft(null);
    },
  });
  const actualHeight = draft ?? (open ? maximized ? maximum : clamp(height) : 0);
  return <section ref={panel} id="terminal-panel" className="terminal-panel" aria-label="Terminal"
    data-open={open} data-snap-collapse={draft === 0} style={{ height: actualHeight }}>
    <div className="panel-toggle-zone panel-toggle-terminal" data-expanded={open} data-edge-hover={hoveredEdge}>
      <button className="panel-toggle" aria-label={open ? "Collapse bottom panel" : "Expand bottom panel"}
        aria-describedby="bottom-panel-tooltip" aria-expanded={open} aria-controls="terminal-body"
        onClick={() => onOpenChange(!open)}>
        {open ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        <span className="focus-tooltip" id="bottom-panel-tooltip" role="tooltip">
          <span>{open ? "Collapse" : "Expand"} bottom panel</span>
        </span>
      </button>
    </div>
    <div className="terminal-resizer" data-panel-drag="bottom" role="separator" tabIndex={0}
      aria-label="Resize terminal" aria-orientation="horizontal" aria-controls="terminal-body"
      aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.round(actualHeight)}
      title="Drag to resize or collapse. Double-click to reset."
      onDoubleClick={() => { setMaximized(false); onOpenChange(true); persist(clamp(defaultHeight)); }}
      onKeyDown={event => {
        if (event.key === "Home") { event.preventDefault(); onOpenChange(false); return; }
        let next: number;
        if (event.key === "End") next = maximum;
        else if (event.key === "Enter") next = defaultHeight;
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") next = actualHeight + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 40 : 10);
        else return;
        event.preventDefault();
        setMaximized(false); onOpenChange(true); persist(clamp(next));
      }} />
    {controlsContainer && createPortal(<>
      <button className="status-terminal-toggle" aria-label={open ? "Collapse terminal panel" : "Expand terminal panel"}
        title={open ? "Collapse terminal" : "Open terminal"} aria-expanded={open} aria-controls="terminal-body"
        onClick={() => onOpenChange(!open)}>
        <TerminalSquare size={13} /><span>Terminal</span>
        {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>
      {open && <span className="terminal-directory" title={activeRoot === "demo" ? "Home directory" : activeRoot}>
        {activeRoot === "demo" ? "Home" : activeRoot.split(/[\\/]/).at(-1)}
      </span>}
      <button className="icon-button" aria-label="New terminal session" title="New terminal in the active folder"
        onClick={addSession}><Plus size={13} /></button>
      <button className="icon-button" aria-label={maximized && open ? "Restore terminal size" : "Maximize terminal"}
        title={maximized && open ? "Restore terminal size" : "Maximize terminal"}
        onClick={() => { setMaximized(!maximized || !open); onOpenChange(true); }}>
        {maximized && open ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
    </>, controlsContainer)}
    <div className="terminal-tab-bar" hidden={!open}>
      <div className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
        {sessions.tabs.map(tab => <div key={tab.id} className="terminal-tab" data-active={tab.id === sessions.active}>
          <button role="tab" id={`terminal-tab-${tab.id}`} aria-controls={`terminal-session-${tab.id}`}
            aria-selected={tab.id === sessions.active} tabIndex={tab.id === sessions.active ? 0 : -1}
            title={tab.root === "demo" ? "Home directory" : tab.root}
            onClick={() => setSessions(previous => ({ ...previous, active: tab.id }))}
            onKeyDown={event => {
              if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
              const index = sessions.tabs.findIndex(item => item.id === tab.id);
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % sessions.tabs.length;
              else if (event.key === "ArrowLeft") next = (index - 1 + sessions.tabs.length) % sessions.tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = sessions.tabs.length - 1;
              else return;
              event.preventDefault();
              document.getElementById(`terminal-tab-${sessions.tabs[next].id}`)?.focus();
            }}><TerminalSquare size={13} /><span>Terminal {tab.id}</span></button>
          <button className="terminal-tab-close" aria-label={`Close terminal ${tab.id}`} title="Close terminal"
            onClick={() => closeSession(tab.id)}><X size={12} /></button>
        </div>)}
      </div>
      <button className="icon-button terminal-add" aria-label="New terminal tab" title="New terminal in the active folder" onClick={addSession}><Plus size={15} /></button>
      <div className="terminal-tab-drag" data-panel-drag="bottom" title="Drag to resize terminal" />
    </div>
    <div id="terminal-body" className="terminal-body" hidden={!open}>
      {sessions.tabs.map(tab => <div key={tab.id} id={`terminal-session-${tab.id}`} className="terminal-session"
        role="tabpanel" aria-labelledby={`terminal-tab-${tab.id}`} hidden={tab.id !== sessions.active}>
        <Suspense fallback={<p className="terminal-message">Starting terminal…</p>}>
          <TerminalView root={tab.root} open={open && tab.id === sessions.active} />
        </Suspense>
      </div>)}
      {sessions.tabs.length === 0 && <div className="terminal-empty"><p>No terminals open.</p>
        <button className="primary" onClick={addSession}>New terminal</button></div>}
    </div>
  </section>;
}
