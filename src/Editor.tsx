import { GFM } from "@lezer/markdown";
import {
  richMarkdown,
  formatTransaction,
  formattingKeymap,
  paragraphStyle,
  type FormatAction,
} from "./richMarkdown";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  gutter,
  GutterMarker,
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import type { Bookmark } from "./model";
import {
  dictationAnchor,
  setDictationAnchor,
  transcriptTransaction,
} from "./dictation";
const setMarks = StateEffect.define<Bookmark[]>();

class BookmarkEntry extends GutterMarker {
  constructor(private readonly onBookmark: () => void) {
    super();
  }
  toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "line-bookmark-button";
    button.title = "Bookmark this line or selection";
    button.setAttribute("aria-label", "Bookmark this line or selection");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z");
    icon.append(path);
    button.append(icon);
    // Keep the editor's selection intact when opening the naming dialog.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      this.onBookmark();
    });
    return button;
  }
}
export const bookmarkField = StateField.define<Bookmark[]>({
  create: () => [],
  update(value, transaction) {
    let next = value;
    if (transaction.docChanged)
      next = value.map((b) => {
        const from = transaction.changes.mapPos(b.from, 1);
        const to = Math.max(from, transaction.changes.mapPos(b.to, -1));
        return {
          ...b,
          from,
          to,
          quote: transaction.newDoc.sliceString(from, to),
          line: transaction.newDoc.lineAt(from).number,
          unresolved: from === to,
        };
      });
    for (const effect of transaction.effects)
      if (effect.is(setMarks)) next = effect.value;
    return next;
  },
});
const decorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(_, tr) {
    const ranges = tr.state
      .field(bookmarkField)
      .filter((b) => !b.unresolved && b.to > b.from)
      .map((b) =>
        Decoration.mark({
          class: "bookmark-highlight",
          attributes: { title: b.name },
        }).range(b.from, b.to),
      );
    return Decoration.set(ranges, true);
  },
  provide: (field) => EditorView.decorations.from(field),
});
export type EditorSnapshot = { state: EditorState; scrollTop: number };
export type EditorHandle = {
  snapshot: () => EditorSnapshot;
  format: (action: FormatAction) => void;
  undo: () => void;
  redo: () => void;
  text: () => string;
  selection: () => { from: number; to: number; quote: string };
  jump: (from: number, to?: number) => void;
  marks: () => Bookmark[];
  beginDictation: () => void;
  insertDictation: (text: string) => void;
  cancelDictation: () => void;
};
type Props = {
  initial: string;
  snapshot?: EditorSnapshot;
  bookmarks: Bookmark[];
  onChange: () => void;
  onBookmarks: (b: Bookmark[]) => void;
  onParagraphStyle?: (style: FormatAction) => void;
  onCursor: (line: number, col: number) => void;
  onBookmark: () => void;
  onSave: () => void;
  isMarkdown: boolean;
  visual: boolean;
  showLineNumbers: boolean;
  showLineHighlight: boolean;
  wordWrap: boolean;
  spellcheck: boolean;
};
export default forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const presentation = useRef(new Compartment());
  const wrapping = useRef(new Compartment());
  const spelling = useRef(new Compartment());
  const highlighting = useRef(new Compartment());
  const numbering = useRef(new Compartment());
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useImperativeHandle(
    ref,
    () => ({
      snapshot: () => ({
        state: view.current!.state,
        scrollTop: view.current!.scrollDOM.scrollTop,
      }),
      format: (action) => {
        const v = view.current;
        if (v) {
          v.dispatch(formatTransaction(v.state, action));
          v.focus();
        }
      },
      undo: () => { if (view.current) { undo(view.current); view.current.focus(); } },
      redo: () => { if (view.current) { redo(view.current); view.current.focus(); } },
      text: () => view.current?.state.doc.toString() ?? "",
      beginDictation: () => {
        const v = view.current!;
        v.dispatch({
          effects: setDictationAnchor.of(v.state.selection.main.head),
        });
        v.focus();
      },
      insertDictation: (text) => {
        const v = view.current!;
        const tr = transcriptTransaction(v.state, text);
        if (tr) {
          v.dispatch(tr);
          v.focus();
        }
      },
      cancelDictation: () => {
        view.current?.dispatch({ effects: setDictationAnchor.of(null) });
      },
      marks: () => view.current?.state.field(bookmarkField) ?? [],
      selection: () => {
        const state = view.current!.state;
        let { from, to } = state.selection.main;
        if (from === to) {
          const line = state.doc.lineAt(from);
          from = line.from;
          to = line.to;
        }
        // A bounded excerpt keeps bookmark metadata small even for huge selections.
        to = Math.min(to, from + 500);
        return { from, to, quote: state.doc.sliceString(from, to) };
      },
      jump: (from, to = from) => {
        const v = view.current!;
        const clamp = (n: number) =>
          Math.max(0, Math.min(n, v.state.doc.length));
        v.dispatch({
          selection: { anchor: clamp(from), head: clamp(to) },
          effects: EditorView.scrollIntoView(clamp(from), { y: "center" }),
        });
        v.focus();
      },
    }),
    [],
  );
  useEffect(() => {
    const p = latest.current;
    const bookmarkEntry = new BookmarkEntry(() => latest.current.onBookmark());
    const extensions = [
      history(),
      numbering.current.of(p.showLineNumbers ? lineNumbers() : []),
      gutter({
        class: "cm-bookmark-entry",
        renderEmptyElements: true,
        lineMarker: (v, line) => {
          const selection = v.state.selection.main;
          const activeLine = v.state.doc.lineAt(selection.head);
          return line.from === activeLine.from &&
            (!selection.empty || activeLine.text.trim())
            ? bookmarkEntry
            : null;
        },
        lineMarkerChange: (update) => update.selectionSet || update.docChanged,
      }),
      presentation.current.of(
        p.visual
          ? [
              richMarkdown,
              EditorView.editorAttributes.of({ class: "live-edit" }),
            ]
          : [syntaxHighlighting(defaultHighlightStyle)],
      ),
      highlighting.current.of(p.showLineHighlight ? highlightActiveLine() : []),
      highlightSelectionMatches(),
      wrapping.current.of(p.wordWrap ? EditorView.lineWrapping : []),
      p.isMarkdown ? markdown({ extensions: GFM }) : [],
      bookmarkField,
      dictationAnchor,
      decorations,
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            latest.current.onSave();
            return true;
          },
        },
        {
          key: "Mod-Shift-b",
          run: () => {
            latest.current.onBookmark();
            return true;
          },
        },
        ...formattingKeymap(() => latest.current.isMarkdown),
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      spelling.current.of(EditorView.contentAttributes.of({
        "aria-label": "Note editor",
        spellcheck: String(p.spellcheck),
      })),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          latest.current.onChange();
          latest.current.onBookmarks(update.state.field(bookmarkField));
        }
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head,
            line = update.state.doc.lineAt(pos);
          latest.current.onCursor(line.number, pos - line.from + 1);
          latest.current.onParagraphStyle?.(paragraphStyle(update.state));
        }
      }),
      EditorView.theme(
        {
          "&": {
            height: "100%",
            backgroundColor: "transparent",
            color: "#d4d4da",
          },
          ".cm-scroller": {
            fontFamily: '"SFMono-Regular", Consolas, monospace',
            fontSize: "var(--editor-font-size, 14px)",
            lineHeight: "1.9",
            overflow: "auto",
          },
          ".cm-content": { padding: "40px 36px 150px", maxWidth: "var(--text-width, 900px)" },
          ".cm-gutters": {
            backgroundColor: "transparent",
            color: "#54565f",
            border: "none",
            // CodeMirror already offsets gutter entries by the content padding.
          },
          ".cm-activeLineGutter": { backgroundColor: "#ffffff05" },
          ".cm-activeLine": { backgroundColor: "#ffffff03" },
          "&.cm-focused .cm-cursor": { borderLeftColor: "#b8a0ed" },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
            backgroundColor: "#a98be43b",
          },
          ".cm-panels": { background: "#232329", color: "#ddd" },
          ".cm-search input": {
            color: "#eee",
            background: "#18191c",
            border: "1px solid #555",
          },
        },
        { dark: true },
      ),
    ];
    const state = p.snapshot
      ? p.snapshot.state.update({
          effects: StateEffect.reconfigure.of(extensions),
        }).state
      : EditorState.create({ doc: p.initial, extensions });
    const v = new EditorView({ parent: mount.current!, state });
    if (p.snapshot) v.scrollDOM.scrollTop = p.snapshot.scrollTop;
    view.current = v;
    v.dispatch({ effects: setMarks.of(p.bookmarks) });
    const head = v.state.selection.main.head,
      line = v.state.doc.lineAt(head);
    p.onCursor(line.number, head - line.from + 1);
    p.onParagraphStyle?.(paragraphStyle(v.state));
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.field(bookmarkField) !== props.bookmarks)
      v.dispatch({ effects: setMarks.of(props.bookmarks) });
  }, [props.bookmarks]);
  useEffect(() => {
    view.current?.dispatch({
      effects: presentation.current.reconfigure(
        props.visual
          ? [
              richMarkdown,
              EditorView.editorAttributes.of({ class: "live-edit" }),
            ]
          : [syntaxHighlighting(defaultHighlightStyle)],
      ),
    });
  }, [props.visual]);
  useEffect(() => {
    view.current?.dispatch({
      effects: numbering.current.reconfigure(props.showLineNumbers ? lineNumbers() : []),
    });
  }, [props.showLineNumbers]);
  useEffect(() => {
    view.current?.dispatch({
      effects: highlighting.current.reconfigure(props.showLineHighlight ? highlightActiveLine() : []),
    });
  }, [props.showLineHighlight]);
  useEffect(() => {
    view.current?.dispatch({ effects: wrapping.current.reconfigure(props.wordWrap ? EditorView.lineWrapping : []) });
  }, [props.wordWrap]);
  useEffect(() => {
    view.current?.dispatch({ effects: spelling.current.reconfigure(EditorView.contentAttributes.of({
      "aria-label": "Note editor", spellcheck: String(props.spellcheck),
    })) });
  }, [props.spellcheck]);
  return <div className="editor-mount" ref={mount} />;
});
