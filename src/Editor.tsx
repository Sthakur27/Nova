import { mobile } from "./platform";
import { startEditorWindowDrag } from "./editorWindowDrag";
import { editorSearch } from "./editorSearch";
import { typedArrows } from "./typedArrows";
import { codeExtensions, codeLanguage } from "./codeLanguages";
import { DocumentEditor } from "./DocumentEditor";
import { supportsDocumentView } from "./documentLimits";
import { textChanges } from "./documentMarkdown";
import GalaxyMark from "./GalaxyMark";
import FileTitle from "./FileTitle";
import { createPortal } from "react-dom";
import { initialScrollTop } from "./scrollSpace";
import { GFM } from "@lezer/markdown";
import { tags } from "@lezer/highlight";
import {
  activeFormatting,
  formatTransaction,
  formattingKeymap,
  indentationKeymap,
  paragraphStyle,
  type FormatAction,
} from "./richMarkdown";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  gutter,
  GutterMarker,
} from "@codemirror/view";
import { defaultKeymap, history, isolateHistory, historyKeymap, undo, redo, selectAll } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
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
  constructor(private readonly onBookmark?: () => void, private readonly name?: string) {
    super();
  }
  toDOM() {
    const button = document.createElement(this.onBookmark ? "button" : "span");
    if (button instanceof HTMLButtonElement) button.type = "button";
    button.className = `line-bookmark-button${this.name ? " is-bookmarked" : ""}`;
    button.title = this.name ? `Remove bookmark: ${this.name}` : "Bookmark this line or selection";
    button.setAttribute("aria-label", button.title);
    if (!this.onBookmark) button.setAttribute("role", "img");
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
      this.onBookmark?.();
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
export type EditorSnapshot = { state: EditorState; scrollTop: number };
export type EditorHandle = {
  snapshot: () => EditorSnapshot;
  format: (action: FormatAction) => void;
  undo: () => void;
  redo: () => void;
  selectAll: () => boolean;
  text: () => string;
  selection: () => { from: number; to: number; quote: string };
  jump: (from: number, to?: number) => void;
  replaceMatches: (expected: string, matches: { from: number; to: number }[], replacement: string) => boolean;
  setFindMatches: (matches: { from: number; to: number }[], active: number) => void;
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
  onFormatting?: (active: FormatAction[]) => void;
  onParagraphStyle?: (style: FormatAction) => void;
  onCursor: (line: number, col: number) => void;
  onBookmark: () => void;
  onSave: () => void;
  isMarkdown: boolean;
  filePath?: string;
  onRename?: (name: string) => Promise<void>;
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
  const [sourceTitleContainer, setSourceTitleContainer] = useState<HTMLElement | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const documentMount = useRef<HTMLDivElement>(null);
  const documentPane = useRef<HTMLDivElement>(null);
  const documentEditor = useRef<DocumentEditor | null>(null);
  const findMatches = useRef<{ matches: { from: number; to: number }[]; active: number }>({ matches: [], active: 0 });
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
      replaceMatches: (expected, matches, replacement) => {
        const v = view.current;
        if (!v || latest.current.documentMode === "read" || v.state.readOnly || v.state.doc.toString() !== expected || !matches.length) return false;
        let end = 0;
        for (const match of matches) {
          if (match.from < end || match.to <= match.from || match.to > v.state.doc.length) return false;
          end = match.to;
        }
        v.dispatch({
          changes: matches.map(match => ({ ...match, insert: replacement })),
          userEvent: "input.replace",
          annotations: isolateHistory.of("full"),
        });
        return true;
      },
      setFindMatches: (matches, active) => {
        findMatches.current = { matches, active };
        documentEditor.current?.setFindMatches(matches, active);
      },
      jump: (from, to = from) => {
        const v = view.current;
        if (!v) return;
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
      typedArrows(() => /\.txt$/i.test(latest.current.filePath ?? "")),
      // Fill selected line breaks and blank lines without native selection gaps.
      drawSelection({ drawRangeCursor: true }),
      numbering.current.of(p.showLineNumbers ? lineNumbers() : []),
      gutter({
        class: "cm-bookmark-entry",
        renderEmptyElements: true,
        lineMarker: (v, line) => {
          const saved = v.state.field(bookmarkField).filter(mark =>
            !mark.unresolved && mark.to > mark.from && v.state.doc.lineAt(mark.from).from === line.from);
          if (saved.length) return new BookmarkEntry(() => {
            latest.current.onBookmarks(v.state.field(bookmarkField).filter(mark => !saved.some(item => item.id === mark.id)));
          }, saved.map(mark => mark.name).join(", "));
          const selection = v.state.selection.main;
          const activeLine = v.state.doc.lineAt(selection.head);
          return line.from === activeLine.from &&
            (!selection.empty || activeLine.text.trim())
            ? bookmarkEntry
            : null;
        },
        lineMarkerChange: (update) => update.selectionSet || update.docChanged ||
          update.startState.field(bookmarkField) !== update.state.field(bookmarkField),
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
            latest.current.onFormatting?.(documentEditor.current.activeFormatting());
          }
          latest.current.onChange();
          latest.current.onBookmarks(update.state.field(bookmarkField));
        }
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head,
            line = update.state.doc.lineAt(pos);
          latest.current.onCursor(line.number, pos - line.from + 1);
          latest.current.onParagraphStyle?.(paragraphStyle(update.state));
          if (!latest.current.documentMode) latest.current.onFormatting?.(latest.current.isMarkdown ? activeFormatting(update.state) : []);
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
            fontFamily: 'var(--editor-font-family, "SFMono-Regular", Consolas, monospace)',
            fontSize: "var(--editor-font-size, 14px)",
            lineHeight: "var(--editor-line-height, 1.9)",
            overflow: "auto",
          },
          // Selection rectangles start at the content edge, so keep the left
          // breathing room outside that box instead of inside its padding.
          ".cm-content": {
            marginLeft: "var(--editor-left-space, 36px)",
            padding: "calc(var(--scroll-before) + 40px + var(--file-title-height, 72px)) 36px max(0px, calc(100cqh - 48px)) 0",
            maxWidth: "calc(var(--text-width, 900px) - var(--editor-left-space, 36px))",
          },
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
    const heading = document.createElement("div");
    heading.className = "source-file-heading";
    v.scrollDOM.prepend(heading);
    setSourceTitleContainer(heading);
    const measureTitle = () => {
      const style = getComputedStyle(v.contentDOM);
      const left = v.contentDOM.offsetLeft + (parseFloat(style.paddingLeft) || 0);
      heading.style.left = `${left}px`;
      heading.style.width = `${Math.max(0, Math.min(v.contentDOM.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0), v.scrollDOM.clientWidth - left - 24))}px`;
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
      v.scrollDOM.scrollTop = p.snapshot?.scrollTop ?? initialScrollTop(v.scrollDOM, mobile);
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
      v.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const surfaces = [view.current?.scrollDOM, documentPane.current];
    const cleanups = surfaces.map(surface => {
      if (!surface) return () => {};
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const onScroll = () => {
        surface.classList.add("is-scrolling");
        clearTimeout(timeout);
        timeout = setTimeout(() => surface.classList.remove("is-scrolling"), 1000);
      };
      surface.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        clearTimeout(timeout);
        surface.removeEventListener("scroll", onScroll);
        surface.classList.remove("is-scrolling");
      };
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, []);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (!props.documentMode) {
      latest.current.onFormatting?.(props.isMarkdown ? activeFormatting(v.state) : []);
      return;
    }
    if (!documentMount.current) return;
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
        formatting: active => { if (!bridging.current && latest.current.documentMode) latest.current.onFormatting?.(active); },
        undo: () => { undo(v); },
        redo: () => { redo(v); },
        save: () => latest.current.onSave(),
        bookmark: (from, to, removeIds) => {
          if (removeIds?.length) {
            latest.current.onBookmarks(v.state.field(bookmarkField).filter(mark => !removeIds.includes(mark.id)));
          } else {
            if (from !== undefined) v.dispatch({ selection: { anchor: from, head: Math.min(to ?? from, from + 500) } });
            latest.current.onBookmark();
          }
        },
      });
      if (documentPane.current) {
        documentPane.current.scrollTop = props.snapshot?.scrollTop ?? initialScrollTop(documentPane.current, mobile);
      }
      documentEditor.current.setFindMatches(findMatches.current.matches, findMatches.current.active);
      documentEditor.current.setBookmarks(latest.current.bookmarks);
      documentEditor.current.setLineHighlight(latest.current.showLineHighlight);
    }
    bridging.current = true;
    try {
      documentEditor.current.setSource(v.state.doc.toString(), v.state.selection.main.anchor, v.state.selection.main.head);
      documentEditor.current.setEditable(props.documentMode === "edit", props.spellcheck);
    } finally { bridging.current = false; }
    latest.current.onFormatting?.(documentEditor.current.activeFormatting());
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
    documentEditor.current?.setLineHighlight(props.showLineHighlight);
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
    view.current?.dispatch({ effects: spelling.current.reconfigure(EditorView.contentAttributes.of({
      "aria-label": "Note editor", spellcheck: String(props.spellcheck && !codeLanguage(props.filePath)),
    })) });
  }, [props.spellcheck, props.filePath]);
  return <div className="editor-mount" onPointerDownCapture={startEditorWindowDrag}>
    {sourceTitleContainer && createPortal(<FileTitle key={props.filePath} path={props.filePath ?? ""} onRename={props.onRename} />, sourceTitleContainer)}
    <div className="source-editor-mount" ref={mount} hidden={!!props.documentMode} />
    <div className="document-pane" ref={documentPane} hidden={!props.documentMode} data-mode={props.documentMode}>
      <div className="start-mark" aria-hidden="true"><GalaxyMark circled /></div>
      <article className="prose document-prose">
        <div className="document-eyebrow">A NOTE IN YOUR SPACE</div>
        <FileTitle key={props.filePath} path={props.filePath ?? ""} onRename={props.onRename} />
        <div ref={documentMount} />
        <div className="end-mark"><GalaxyMark circled /></div>
      </article>
    </div>
  </div>;
});
