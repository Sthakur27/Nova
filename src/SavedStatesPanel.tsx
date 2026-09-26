import { useRef, useState } from "react";
import { Plus, RotateCcw, Trash2, PanelsTopLeft } from "lucide-react";
import { paneLeaves } from "./paneLayout";
import { tabId } from "./tabs";
import type { SavedState } from "./savedStates";

export default function SavedStatesPanel({ suggestedName = "My layout", previousState = null, onReturn, error, slots, onSave, onRestore, onDelete }: {
  suggestedName?: string;
  previousState?: SavedState | null; onReturn?: () => Promise<void>;
  error: string; slots: (SavedState | null)[]; onSave: (slot: number, name: string) => boolean;
  onRestore: (slot: number) => Promise<void>; onDelete: (slot: number) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const freeSlot = slots.findIndex(state => !state);
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘⌥" : "Ctrl Alt";
  return <section className="saved-states-panel" aria-label="Saved states">
    <div className="rail-intro">Your layouts, ready to return to.</div>
    {error && <p className="saved-states-error" role="alert">{error}</p>}
    <div className="saved-states-list">
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
        return <div className="saved-state-card" key={slot}>
          <button className="saved-state-restore" disabled={busy} aria-label={`Restore ${state.name}`}
            title={`Restore ${state.name} (${mod} ${slot + 1})`} onClick={async () => {
              if (pending.current) return;
              pending.current = true; setBusy(true);
              try { await onRestore(slot); } finally { pending.current = false; setBusy(false); }
            }}>
            <span className="saved-state-heading"><strong>{state.name}</strong><kbd>{mod} {slot + 1}</kbd></span>
            <small>{files.join(" · ")}</small>
          </button>
          <div className="saved-state-actions">
            <button className="icon-button" disabled={busy} aria-label={`Update ${state.name} with current layout`}
              title="Update with current layout" onClick={() => onSave(slot, state.name)}><RotateCcw size={13} /></button>
            <button className="icon-button" disabled={busy} aria-label={`Delete ${state.name}`}
              title="Delete saved state" onClick={() => onDelete(slot)}><Trash2 size={13} /></button>
          </div>
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
  </section>;
}
