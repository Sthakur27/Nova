import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { paneLeaves } from "./paneLayout";
import { tabId } from "./tabs";
import type { SavedState } from "./savedStates";

export default function FocusStateNav({ slots, previousState, suggestedName, error, onRestore, onQuickSave }: {
  slots: (SavedState | null)[]; previousState: SavedState | null; suggestedName: string; error: string;
  onRestore: (slot: number | "previous") => Promise<void>; onQuickSave: () => boolean;
}) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  const open = !dismissed && (hovered || focused);
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘⌥" : "Ctrl Alt";
  const freeSlot = slots.findIndex(state => !state);
  const entries = [ ...(previousState ? [{ state: previousState, slot: "previous" as const }] : []),
    ...slots.flatMap((state, slot) => state ? [{ state, slot }] : []) ];
  return <nav className="focus-state-nav" aria-label="Focus saved states" data-open={open}
    onPointerEnter={event => { if (event.pointerType !== "touch") { setHovered(true); setDismissed(false); } }}
    onPointerLeave={() => setHovered(false)}
    onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(true); setDismissed(false); } }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDismissed(true); trigger.current?.focus(); } }}>
    <button ref={trigger} className="focus-state-trigger" aria-label="Show saved states" aria-expanded={open} aria-controls="focus-state-popover"
      onClick={() => { setFocused(true); setDismissed(false); }}>
      <span aria-hidden="true"><i /><i /><i /><b>+</b></span>
    </button>
    <div id="focus-state-popover" className="focus-state-popover" hidden={!open}>
      <header>Saved states</header>
      <div className="focus-state-list">
        {!entries.length && <p>Save this layout to return to it later.</p>}
        {entries.map(({ state, slot }) => {
          const visible = new Set(paneLeaves(state.layout).map(pane => pane.selected));
          const files = state.tabs.filter(tab => visible.has(tabId(tab))).map(tab => tab.path.split("/").at(-1)).join(" · ");
          const label = slot === "previous" ? "Previous state" : state.name;
          return <button className="focus-state-link" key={slot} disabled={busy} aria-label={`Restore ${label}`} onClick={async () => {
            if (pending.current) return;
            pending.current = true; setBusy(true); setMessage("");
            try { await onRestore(slot); } finally { pending.current = false; setBusy(false); }
          }}>
            <span><strong>{label}</strong><kbd>{mod} {slot === "previous" ? 0 : slot + 1}</kbd></span>
            <small>{files}</small>
          </button>;
        })}
      </div>
      <footer>
        <button className="focus-state-save" disabled={busy || freeSlot < 0} onClick={() => {
          if (onQuickSave()) setMessage(`Saved “${suggestedName}”.`);
        }}><Plus size={15} aria-hidden="true" />Quick save current state</button>
        <small>{freeSlot < 0 ? "All nine slots are in use." : suggestedName}</small>
        {error ? <p role="alert">{error}</p> : message && <p role="status">{message}</p>}
      </footer>
    </div>
  </nav>;
}
