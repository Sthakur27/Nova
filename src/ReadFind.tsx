import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { searchMatches } from "./editorSearch";

/** Mounted only for Read mode; capture Find before the rich editor's source shortcut. */
export default function ReadFind({ text, disabled, onJump }: {
  text: string; disabled: boolean; onJump: (from: number, to: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const state = useMemo(() => EditorState.create({ doc: text }), [text]);
  const matches = useMemo(() => searchMatches(state, new SearchQuery({ search: query, literal: true })), [state, query]);
  const active = matches.length ? index % matches.length : 0;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (disabled || event.isComposing || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f" ||
        (event.target instanceof Element && event.target.closest("#terminal-panel"))) return;
      event.preventDefault();
      event.stopPropagation();
      if (open) {
        setOpen(false);
        previousFocus.current?.focus({ preventScroll: true });
      } else {
        previousFocus.current = document.activeElement as HTMLElement | null;
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [disabled, open]);
  useEffect(() => { if (open) { input.current?.focus(); input.current?.select(); } }, [open]);
  useEffect(() => {
    if (!open || disabled || !matches.length) return;
    onJump(matches[active].from, matches[active].to);
    // Navigation must leave the caret in Find so typing and Enter keep working.
    input.current?.focus({ preventScroll: true });
  }, [open, disabled, matches, active, onJump]);
  const close = () => { setOpen(false); previousFocus.current?.focus({ preventScroll: true }); };
  const move = (delta: number) => { if (matches.length) setIndex((active + delta + matches.length) % matches.length); };
  if (!open) return null;
  return <div className="nova-find read-find" data-match={matches.length > 0} role="search" aria-label="Find in note" onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Enter" && event.target === input.current) { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
  }}>
    <div className="nova-find-row">
      <div className="nova-find-field">
        <Search aria-hidden="true" />
        <input ref={input} aria-label="Find in note" placeholder="Find in note" value={query} autoComplete="off" spellCheck={false}
          onChange={event => { setQuery(event.target.value); setIndex(0); }} />
        <span className="nova-find-count" role="status" aria-live="polite">{query ? matches.length ? `${active + 1} of ${matches.length}` : "No results" : ""}</span>
      </div>
      <button title="Previous match (Shift+Enter)" aria-label="Previous match (Shift+Enter)" disabled={!matches.length} onClick={() => move(-1)}><ChevronUp /></button>
      <button title="Next match (Enter)" aria-label="Next match (Enter)" disabled={!matches.length} onClick={() => move(1)}><ChevronDown /></button>
      <button title="Close search (Esc)" aria-label="Close search (Esc)" onClick={close}><X /></button>
    </div>
  </div>;
}
