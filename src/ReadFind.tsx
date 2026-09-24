import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Search, X } from "lucide-react";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { highlightReadPreview } from "./readFindHighlights";
import { searchMatches } from "./editorSearch";

/** Find in formatted Edit and Read without changing the document mode. */
export default function ReadFind({ text, disabled, onJump, onHighlight, surface, onReplace }: {
  text: string; disabled: boolean; onJump: (from: number, to: number) => void;
  surface?: string;
  onReplace?: (expected: string, matches: { from: number; to: number }[], replacement: string) => boolean;
  onHighlight?: (matches: { from: number; to: number }[], active: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacement, setReplacement] = useState("");
  const replaceId = useId();
  const replaceInput = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const highlight = useRef(onHighlight);
  highlight.current = onHighlight;
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
    if (!open || disabled) return;
    const keepReplacementFocus = document.activeElement === replaceInput.current;
    if (matches.length) onJump(matches[active].from, matches[active].to);
    // Navigation must leave the caret in Find so typing and Enter keep working.
    (keepReplacementFocus ? replaceInput.current : input.current)?.focus({ preventScroll: true });
  }, [open, disabled, matches, active, onJump]);
  useEffect(() => {
    highlight.current?.(open ? matches : [], active);
    return () => highlight.current?.([], 0);
  }, [open, matches, active, surface]);
  useEffect(() => {
    const scope = input.current?.closest(".document-area")?.querySelector<HTMLElement>(".read-pane");
    if (open && scope) return highlightReadPreview(scope, text, query, matches[active]?.from ?? 0);
  }, [open, text, query, matches, active, surface]);
  const close = () => { setOpen(false); previousFocus.current?.focus({ preventScroll: true }); };
  const move = (delta: number) => { if (matches.length) setIndex((active + delta + matches.length) % matches.length); };
  const replace = (all: boolean) => {
    if (disabled || !onReplace || !matches.length) return;
    let end = -1;
    const selected = all ? matches.filter(match => {
      if (match.from < end) return false;
      end = match.to;
      return true;
    }) : [matches[active]];
    if (onReplace(text, selected, replacement)) {
      // Advance past inserted text, even when it contains the search term.
      const nextText = state.update({ changes: selected.map(match => ({ ...match, insert: replacement })) }).state;
      const nextMatches = searchMatches(nextText, new SearchQuery({ search: query, literal: true }));
      const next = all ? 0 : nextMatches.findIndex(match => match.from >= selected[0].from + replacement.length);
      setIndex(Math.max(0, next));
    }
  };
  if (!open) return null;
  return <div className="nova-find read-find" data-match={matches.length > 0} role="search" aria-label="Find in note" onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Enter" && event.target === input.current) { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
  }}>
    <div className="nova-find-row">
      <button aria-label={replaceOpen ? "Hide replace" : "Show replace"} title={replaceOpen ? "Hide replace" : "Show replace"}
        aria-expanded={replaceOpen} aria-controls={replaceId} onClick={() => setReplaceOpen(!replaceOpen)}>
        {replaceOpen ? <ChevronDown /> : <ChevronRight />}
      </button>
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
    {replaceOpen && <div id={replaceId} className="nova-find-replace formatted-find-replace">
      <input ref={replaceInput} aria-label="Replace with" placeholder="Replace with" value={replacement}
        autoComplete="off" spellCheck={false} disabled={!onReplace}
        onChange={event => setReplacement(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); replace(false); }
        }} />
      <button disabled={disabled || !onReplace || !matches.length} onClick={() => replace(false)}>Replace</button>
      <button disabled={disabled || !onReplace || !matches.length} onClick={() => replace(true)}>Replace all</button>
      {!onReplace && <span className="find-replace-hint">Switch to Edit to replace.</span>}
    </div>}
  </div>;
}
