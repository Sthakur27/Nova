import { GFM } from "@lezer/markdown";
import {
  richMarkdown,
  formatTransaction,
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
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
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
export type EditorHandle = {
  format: (action: FormatAction) => void;
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
  bookmarks: Bookmark[];
  onChange: () => void;
  onBookmarks: (b: Bookmark[]) => void;
  onCursor: (line: number, col: number) => void;
  onBookmark: () => void;
  onSave: () => void;
  isMarkdown: boolean;
  visual: boolean;
};
export default forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const presentation = useRef(new Compartment());
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useImperativeHandle(
    ref,
    () => ({
      format: (action) => {
        const v = view.current;
        if (v) {
          v.dispatch(formatTransaction(v.state, action));
          v.focus();
        }
      },
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
    const v = new EditorView({
      parent: mount.current!,
      state: EditorState.create({
        doc: p.initial,
        extensions: [
          history(),
          presentation.current.of(
            p.visual
              ? [
                  richMarkdown,
                  EditorView.editorAttributes.of({ class: "live-edit" }),
                ]
              : [lineNumbers(), syntaxHighlighting(defaultHighlightStyle)],
          ),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
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
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          EditorView.contentAttributes.of({
            "aria-label": "Note editor",
            spellcheck: "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              latest.current.onChange();
              latest.current.onBookmarks(update.state.field(bookmarkField));
            }
            if (update.selectionSet || update.docChanged) {
              const pos = update.state.selection.main.head,
                line = update.state.doc.lineAt(pos);
              latest.current.onCursor(line.number, pos - line.from + 1);
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
                fontSize: "14px",
                lineHeight: "1.9",
                overflow: "auto",
              },
              ".cm-content": { padding: "40px 36px 150px", maxWidth: "900px" },
              ".cm-gutters": {
                backgroundColor: "transparent",
                color: "#54565f",
                border: "none",
                paddingTop: "40px",
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
        ],
      }),
    });
    view.current = v;
    v.dispatch({ effects: setMarks.of(p.bookmarks) });
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
          : [lineNumbers(), syntaxHighlighting(defaultHighlightStyle)],
      ),
    });
  }, [props.visual]);
  return <div className="editor-mount" ref={mount} />;
});
