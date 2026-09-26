import RenameStateDialog from "./RenameStateDialog";
import { useStateReorder } from "./useStateReorder";
import { useEffect, useRef, useState } from "react";
import { Plus, Save, Pencil, GripVertical, Trash2, PanelsTopLeft } from "lucide-react";
import { paneLeaves } from "./paneLayout";
import { tabId } from "./tabs";
import type { SavedState } from "./savedStates";

export default function SavedStatesPanel({ suggestedName = "My layout", previousState = null, onReturn, error, slots, onSave, onRestore, onDelete, onReorder, onRename }: {
  suggestedName?: string;
  previousState?: SavedState | null; onReturn?: () => Promise<void>;
  error: string; slots: (SavedState | null)[]; onSave: (slot: number, name: string, expected?: SavedState) => boolean;
  onRename?: (slot: number, name: string, expected: SavedState) => void;
  onReorder?: (from: number, before: number | null) => void;
  onRestore: (slot: number) => Promise<void>; onDelete: (slot: number) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirm, setConfirm] = useState<{ slot: number; state: SavedState } | null>(null);
  const [rename, setRename] = useState<{ slot: number; state: SavedState } | null>(null);
  const list = useStateReorder(onReorder, busy || !!rename);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") setConfirm(null); };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const occupied = slots.flatMap((state, slot) => state ? [slot] : []);
  const freeSlot = slots.findIndex(state => !state);
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘⌥" : "Ctrl Alt";
  return <section className="saved-states-panel" aria-label="Saved states">
    <div className="rail-intro">Your layouts, ready to return to.</div>
    {error && <p className="saved-states-error" role="alert">{error}</p>}
    <div className="saved-states-list" ref={list}>
      {previousState && <div className="saved-state-card previous-state-card">
        <button className="saved-state-restore" disabled={busy} aria-label="Return to previous state" onClick={async () => {
          if (pending.current) return;
          pending.current = true; setBusy(true);
          try { await onReturn?.(); } finally { pending.current = false; setBusy(false); }
        }}>
          <span className="saved-state-heading"><strong>Previous state</strong><kbd>{mod} 0</kbd></span>
          <small>{previousState.tabs.filter(tab => paneLeaves(previousState.layout).some(pane => pane.selected === tabId(tab))).map(tab => tab.path.split("/").at(-1)).join(" · ")}</small>
          <small>Return to your unsaved layout</small>
        </button>
      </div>}
      {!slots.some(Boolean) && <div className="empty-bookmarks">
        <PanelsTopLeft size={25} aria-hidden="true" />
        <p>Keep a place for your notes.</p>
        <small>Arrange your panes and scroll to the places you want. Save the layout here.</small>
      </div>}
      {slots.map((state, slot) => {
        if (!state) return null;
        const visible = new Set(paneLeaves(state.layout).map(pane => pane.selected));
        const files = state.tabs.filter(tab => visible.has(tabId(tab))).map(tab => tab.path.split("/").at(-1));
        const restore = async () => {
          if (pending.current) return;
          pending.current = true; setBusy(true);
          try { await onRestore(slot); } finally { pending.current = false; setBusy(false); }
        };
        return <div className="saved-state-card" key={slot} data-state-slot={slot} onClick={event => {
          if (!(event.target instanceof Element) || event.target.closest("button, .saved-state-confirm")) return;
          void restore();
        }}>
          {onReorder && <button className="saved-state-drag icon-button" aria-label={`Reorder ${state.name}`}
            title="Drag to reorder · Arrow keys to move" disabled={busy} onPointerDown={() => setConfirm(null)}
            onKeyDown={event => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault(); setConfirm(null);
              const index = occupied.indexOf(slot);
              if (event.key === "ArrowUp" && index > 0) onReorder(slot, occupied[index - 1]);
              if (event.key === "ArrowDown" && index < occupied.length - 1) onReorder(slot, occupied[index + 2] ?? null);
            }}><GripVertical size={14} /></button>}
          <div className="saved-state-heading saved-state-title">
            <button className="saved-state-restore" disabled={busy} aria-label={`Restore ${state.name}`}
              title={`Restore ${state.name} (${mod} ${slot + 1})`} onClick={() => void restore()}><strong>{state.name}</strong></button>
            {onRename && <button className="icon-button saved-state-rename" disabled={busy} aria-label={`Rename ${state.name}`}
              title="Rename saved state" onClick={() => { setConfirm(null); setRename({ slot, state }); }}><Pencil size={13} /></button>}
            <kbd>{mod} {slot + 1}</kbd>
          </div>
          <div className="saved-state-files">{files.join(" · ")}</div>
          <div className="saved-state-actions">
            <button className="icon-button" disabled={busy} aria-label={`Save over ${state.name}`}
              title="Overwrite with current layout" onClick={() => setConfirm({ slot, state })}><Save size={13} /></button>
            <button className="icon-button" disabled={busy} aria-label={`Delete ${state.name}`}
              title="Delete saved state" onClick={() => onDelete(slot)}><Trash2 size={13} /></button>
          </div>
          {confirm?.slot === slot && confirm.state === state && <div className="saved-state-confirm" role="group" aria-label={`Confirm overwrite ${state.name}`}>
            <p>Replace “{state.name}” with the current layout?</p>
            <button disabled={busy} onClick={() => { if (onSave(slot, state.name, state)) setConfirm(null); }}>Confirm overwrite</button>
            <button disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
          </div>}
        </div>;
      })}
    </div>
    <form className="saved-state-create" onSubmit={event => {
      event.preventDefault();
      if (!busy && freeSlot >= 0 && onSave(freeSlot, name.trim() || suggestedName)) setName("");
    }}>
      {freeSlot >= 0 ? <>
        <label htmlFor="saved-state-name">Save current layout</label>
        <input id="saved-state-name" maxLength={100} value={name} disabled={busy} placeholder={suggestedName}
          aria-describedby={!name.trim() ? "saved-state-name-hint" : undefined}
          onKeyDown={event => {
            if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing && !name.trim()) setName(suggestedName);
          }}
          onChange={event => setName(event.target.value)} />
        {!name.trim() && <small id="saved-state-name-hint" className="saved-state-name-hint">Tab to accept, or save with this name.</small>}
        <button className="add-bookmark" type="submit" disabled={busy}><Plus size={15} />Save state<span>{mod} {freeSlot + 1}</span></button>
      </> : <p>All nine shortcuts are in use. Update or delete a state to make room.</p>}
      <small>Saved on this device.</small>
    </form>
    {rename && onRename && <RenameStateDialog name={rename.state.name} onClose={() => setRename(null)}
      onRename={name => onRename(rename.slot, name, rename.state)} />}
  </section>;
}
