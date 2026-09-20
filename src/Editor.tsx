import { mobile } from "./platform";
import { editorSearch } from "./editorSearch";
import { codeExtensions, codeLanguage } from "./codeLanguages";
import { DocumentEditor } from "./DocumentEditor";
import { supportsDocumentView } from "./documentLimits";
import { textChanges } from "./documentMarkdown";
import GalaxyMark from "./GalaxyMark";
import FileTitle, { fileTitle } from "./FileTitle";
import { scrollSpaceStyle } from "./scrollSpace";
import { GFM } from "@lezer/markdown";
import { tags } from "@lezer/highlight";
import {
  formatTransaction,
  formattingKeymap,
  indentationKeymap,
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
  drawSelection,
  gutter,
  GutterMarker,
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo, selectAll } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  indentUnit,
} from "@codemirror/language";
import type { Bookmark } from "./model";
import {
  dictationAnchor,
  dictationPreview,
  previewTransaction,
  clearPreviewTransaction,
  setDictationAnchor,
  transcriptTransaction,
} from "./dictation";
const setMarks = StateEffect.define<Bookmark[]>();
const sourceHighlightStyle = HighlightStyle.define([
  ...defaultHighlightStyle.specs,
  { tag: tags.processingInstruction, color: "#c8afe8" },
]);

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
export type EditorSnapshot = { state: EditorState; scrollTop: number; scrollSpace?: { before: string; after: string } };
export type EditorHandle = {
  snapshot: () => EditorSnapshot;
  format: (action: FormatAction) => void;
  undo: () => void;
  redo: () => void;
  selectAll: () => boolean;
  text: () => string;
  selection: () => { from: number; to: number; quote: string };
  jump: (from: number, to?: number) => void;
  marks: () => Bookmark[];
  beginDictation: () => void;
  insertDictation: (text: string) => void;
  previewDictation: (text: string) => void;
  cancelDictation: () => void;
  toggleTask: (offset: number, checked: boolean) => void;
  isDocumentView: () => boolean;
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
  onSourceSearch?: () => void;
  isMarkdown: boolean;
  filePath?: string;
  documentMode?: "edit" | "read";
  showLineNumbers: boolean;
  showLineHighlight: boolean;
  wordWrap: boolean;
  spellcheck: boolean;
};
export default forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const wrapping = useRef(new Compartment());
  const spelling = useRef(new Compartment());
  const highlighting = useRef(new Compartment());
  const numbering = useRef(new Compartment());
  const language = useRef(new Compartment());
  const sourceTitle = useRef<HTMLHeadingElement | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const documentMount = useRef<HTMLDivElement>(null);
  const documentPane = useRef<HTMLDivElement>(null);
  const documentEditor = useRef<DocumentEditor | null>(null);
  const bridging = useRef(false);
  // Guard the editor itself as well, including restored tabs with large drafts.
  if (!supportsDocumentView(props.initial.length, props.snapshot?.state.doc.length ?? 0)) {
    props = { ...props, documentMode: undefined };
  }
  const latest = useRef(props);
  latest.current = props;
  useImperativeHandle(
    ref,
    () => ({
      snapshot: () => ({
        state: view.current!.state,
        scrollTop: latest.current.documentMode ? documentPane.current?.scrollTop ?? 0 : view.current!.scrollDOM.scrollTop,
        scrollSpace: scrollSpaceStyle(latest.current.documentMode ? documentPane.current : view.current?.scrollDOM),
      }),
      format: (action) => {
        if (latest.current.documentMode) { documentEditor.current?.format(action); return; }
        const v = view.current;
        if (v) {
          v.dispatch(formatTransaction(v.state, action));
          v.focus();
        }
      },
      undo: () => { if (view.current && latest.current.documentMode !== "read") { undo(view.current); if (!latest.current.documentMode) view.current.focus(); } },
      redo: () => { if (view.current && latest.current.documentMode !== "read") { redo(view.current); if (!latest.current.documentMode) view.current.focus(); } },
      selectAll: () => {
        const active = document.activeElement;
        if (latest.current.documentMode && documentMount.current?.contains(active)) {
          const rich = documentEditor.current?.editor;
          if (!rich) return false;
          rich.commands.selectAll();
          rich.view.focus();
          return true;
        }
        if (!latest.current.documentMode && view.current && mount.current?.contains(active)) {
          selectAll(view.current);
          view.current.focus();
          return true;
        }
        return false;
      },
      text: () => view.current?.state.doc.toString() ?? "",
      beginDictation: () => {
        const v = view.current!;
        v.dispatch({
          effects: setDictationAnchor.of(v.state.selection.main.head),
        });
        if (!latest.current.documentMode) v.focus();
      },
      previewDictation: (text) => {
        const v = view.current;
        if (!v) return;
        const tr = previewTransaction(v.state, text);
        if (tr) v.dispatch(tr);
      },
      insertDictation: (text) => {
        const v = view.current!;
        const clear = clearPreviewTransaction(v.state);
        if (clear) v.dispatch(clear);
        const tr = transcriptTransaction(v.state, text);
        if (tr) {
          v.dispatch(tr);
          if (latest.current.documentMode) documentEditor.current?.select(v.state.selection.main.from);
          else v.focus();
        }
      },
      cancelDictation: () => {
        if (view.current) {
          const clear = clearPreviewTransaction(view.current.state);
          if (clear) view.current.dispatch(clear);
        }
        view.current?.dispatch({ effects: setDictationAnchor.of(null) });
      },
      marks: () => view.current?.state.field(bookmarkField) ?? [],
      isDocumentView: () => !!latest.current.documentMode,
      toggleTask: (offset, checked) => {
        const v = view.current;
        if (!v || !/\[[ xX]\]/.test(v.state.sliceDoc(offset - 1, offset + 2))) return;
        v.dispatch({ changes: { from: offset, to: offset + 1, insert: checked ? "x" : " " }, userEvent: "input" });
      },
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
        if (latest.current.documentMode) {
          documentEditor.current?.select(clamp(from), clamp(to));
          documentEditor.current?.scrollSelectionIntoView();
        }
        else v.focus();
      },
    }),
    [],
  );
  useEffect(() => {
    const p = latest.current;
    const bookmarkEntry = new BookmarkEntry(() => latest.current.onBookmark());
    const extensions = [
      history(),
      // Fill selected line breaks and blank lines without native selection gaps.
      drawSelection({ drawRangeCursor: true }),
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
      syntaxHighlighting(sourceHighlightStyle),
      highlighting.current.of(p.showLineHighlight ? highlightActiveLine() : []),
      editorSearch,
      highlightSelectionMatches(),
      wrapping.current.of(p.wordWrap ? EditorView.lineWrapping : []),
      language.current.of(p.isMarkdown ? markdown({ extensions: GFM }) : codeExtensions(p.filePath)),
      // Four spaces nest both bullet and numbered items in Markdown.
      indentUnit.of("    "),
      bookmarkField,
      dictationAnchor,
      dictationPreview,
      decorations,
      keymap.of([
        { key: "Ctrl-a", run: selectAll },
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
        ...indentationKeymap(() => latest.current.isMarkdown),
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      spelling.current.of(EditorView.contentAttributes.of({
        "aria-label": "Note editor",
        spellcheck: String(p.spellcheck && !codeLanguage(p.filePath)),
      })),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          if (documentEditor.current && !bridging.current && latest.current.documentMode) {
            bridging.current = true;
            try {
              documentEditor.current.setSource(update.state.doc.toString(), update.state.selection.main.anchor, update.state.selection.main.head);
            } finally { bridging.current = false; }
          }
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
            lineHeight: "var(--editor-line-height, 1.9)",
            overflow: "auto",
          },
          ".cm-content": { padding: "calc(100cqh + 40px + var(--extra-scroll-before, 0px) + var(--file-title-height, 72px)) 36px calc(100cqh + var(--extra-scroll-after, 0px))", maxWidth: "var(--text-width, 900px)" },
          ".cm-gutters": {
            backgroundColor: "transparent",
            color: "#54565f",
            border: "none",
            // CodeMirror already offsets gutter entries by the content padding.
          },
          ".cm-activeLineGutter": { backgroundColor: "#ffffff05" },
          ".cm-activeLine": { backgroundColor: "#ffffff03" },
          "&.cm-focused .cm-cursor": { borderLeftColor: "#b8a0ed" },
          "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
            backgroundColor: "#a98be43b",
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
    if (p.snapshot?.scrollSpace) {
      v.scrollDOM.style.setProperty("--extra-scroll-before", p.snapshot.scrollSpace.before);
      v.scrollDOM.style.setProperty("--extra-scroll-after", p.snapshot.scrollSpace.after);
    }
    const heading = document.createElement("header");
    heading.className = "file-heading source-file-heading";
    const title = document.createElement("h1");
    title.className = "file-title";
    title.dir = "auto";
    title.textContent = title.title = fileTitle(p.filePath);
    heading.append(title);
    v.scrollDOM.prepend(heading);
    sourceTitle.current = title;
    const measureTitle = () => {
      const style = getComputedStyle(v.contentDOM);
      const left = v.contentDOM.offsetLeft + (parseFloat(style.paddingLeft) || 36);
      heading.style.left = `${left}px`;
      heading.style.width = `${Math.max(0, Math.min(v.contentDOM.clientWidth - (parseFloat(style.paddingLeft) || 36) - (parseFloat(style.paddingRight) || 36), v.scrollDOM.clientWidth - left - 24))}px`;
      const height = heading.getBoundingClientRect().height;
      if (height && v.scrollDOM.style.getPropertyValue("--file-title-height") !== `${height}px`) {
        v.scrollDOM.style.setProperty("--file-title-height", `${height}px`);
        v.requestMeasure();
      }
    };
    const titleObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measureTitle);
    titleObserver?.observe(heading);
    titleObserver?.observe(v.contentDOM);
    titleObserver?.observe(v.scrollDOM);
    measureTitle();
    // A source editor can mount hidden behind Read mode. Wait until it has a
    // viewport before positioning the first line below the space above it.
    const positionSource = () => {
      v.scrollDOM.scrollTop = p.snapshot?.scrollTop ?? (mobile ? 0 : v.scrollDOM.clientHeight);
    };
    let openingObserver: ResizeObserver | undefined;
    if (v.scrollDOM.clientHeight) positionSource();
    else if (typeof ResizeObserver !== "undefined") {
      openingObserver = new ResizeObserver(() => {
        if (!v.scrollDOM.clientHeight) return;
        positionSource();
        openingObserver?.disconnect();
      });
      openingObserver.observe(v.scrollDOM);
    }
    view.current = v;
    v.dispatch({ effects: setMarks.of(p.bookmarks) });
    const head = v.state.selection.main.head,
      line = v.state.doc.lineAt(head);
    p.onCursor(line.number, head - line.from + 1);
    p.onParagraphStyle?.(paragraphStyle(v.state));
    return () => {
      openingObserver?.disconnect();
      titleObserver?.disconnect();
      sourceTitle.current = null;
      v.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (!v || !props.documentMode || !documentMount.current) return;
    if (!documentEditor.current) {
      documentEditor.current = new DocumentEditor(documentMount.current, v.state.doc.toString(), {
        change: (source, selection) => {
          bridging.current = true;
          try { v.dispatch({ changes: textChanges(v.state.doc.toString(), source), selection, userEvent: "input" }); }
          finally { bridging.current = false; }
        },
        selection: (anchor, head, style) => {
          if (bridging.current || !latest.current.documentMode) return;
          v.dispatch({ selection: { anchor, head } });
          latest.current.onParagraphStyle?.(style);
        },
        undo: () => { undo(v); },
        redo: () => { redo(v); },
        save: () => latest.current.onSave(),
        bookmark: () => latest.current.onBookmark(),
        find: () => {
          latest.current.onSourceSearch?.();
          requestAnimationFrame(() => { openSearchPanel(v); });
        },
      });
      if (documentPane.current) {
        if (props.snapshot?.scrollSpace) {
          documentPane.current.style.setProperty("--extra-scroll-before", props.snapshot.scrollSpace.before);
          documentPane.current.style.setProperty("--extra-scroll-after", props.snapshot.scrollSpace.after);
        }
        documentPane.current.scrollTop = props.snapshot?.scrollTop ?? (mobile ? 0 : documentPane.current.clientHeight);
      }
      documentEditor.current.setBookmarks(latest.current.bookmarks);
    }
    bridging.current = true;
    try {
      documentEditor.current.setSource(v.state.doc.toString(), v.state.selection.main.anchor, v.state.selection.main.head);
      documentEditor.current.setEditable(props.documentMode === "edit", props.spellcheck);
    } finally { bridging.current = false; }
  }, [props.documentMode, props.spellcheck]);
  useEffect(() => () => { documentEditor.current?.destroy(); documentEditor.current = null; }, []);
  useEffect(() => {
    const v = view.current;
    documentEditor.current?.setBookmarks(props.bookmarks);
    if (v && v.state.field(bookmarkField) !== props.bookmarks)
      v.dispatch({ effects: setMarks.of(props.bookmarks) });
  }, [props.bookmarks]);
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
    view.current?.dispatch({ effects: language.current.reconfigure(
      props.isMarkdown ? markdown({ extensions: GFM }) : codeExtensions(props.filePath),
    ) });
  }, [props.isMarkdown, props.filePath]);
  useEffect(() => {
    if (sourceTitle.current) sourceTitle.current.textContent = sourceTitle.current.title = fileTitle(props.filePath);
  }, [props.filePath]);
  useEffect(() => {
    view.current?.dispatch({ effects: spelling.current.reconfigure(EditorView.contentAttributes.of({
      "aria-label": "Note editor", spellcheck: String(props.spellcheck && !codeLanguage(props.filePath)),
    })) });
  }, [props.spellcheck, props.filePath]);
  return <div className="editor-mount">
    <div className="source-editor-mount" ref={mount} hidden={!!props.documentMode} />
    <div className="document-pane" ref={documentPane} hidden={!props.documentMode} data-mode={props.documentMode}>
      <div className="start-mark" aria-hidden="true"><GalaxyMark circled /></div>
      <article className="prose document-prose">
        <div className="document-eyebrow">A NOTE IN YOUR SPACE</div>
        <FileTitle path={props.filePath ?? ""} />
        <div ref={documentMount} />
        <div className="end-mark"><GalaxyMark circled /></div>
      </article>
    </div>
  </div>;
});
