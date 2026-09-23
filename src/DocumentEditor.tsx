import { Editor, Extension, InputRule, Node, wrappingInputRule, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown as MarkdownExtension } from "@tiptap/markdown";
import { TaskList, TaskItem, BulletList, OrderedList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { AllSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { createRoot } from "react-dom/client";
import Markdown from "./Markdown";
import { documentPositions, parseDocument, taskOffsets } from "./documentMarkdown";
import { formatShortcuts, type FormatAction } from "./richMarkdown";
import type { Bookmark } from "./model";

const RawMarkdown = Node.create<{ toggle?: (node: DocumentNode, offset: number, checked: boolean) => void }>({
  name: "rawMarkdown", group: "block", atom: true,
  addOptions: () => ({}),
  addAttributes: () => ({ source: { default: "" } }),
  parseHTML: () => [{ tag: "div[data-raw-markdown]" }],
  renderHTML: ({ node }) => ["div", { "data-raw-markdown": "", class: "raw-markdown" }, node.attrs.source],
  renderMarkdown: node => node.attrs?.source ?? "",
  addNodeView() { return ({ node }) => {
    const dom = document.createElement("div");
    dom.className = "raw-markdown";
    dom.contentEditable = "false";
    dom.title = "This Markdown block can be edited in Source mode";
    const root = createRoot(dom);
    root.render(<Markdown text={node.attrs.source} onToggleTask={(offset, checked) => this.options.toggle?.(node, offset, checked)} />);
    return { dom, destroy: () => { queueMicrotask(() => root.unmount()); } };
  }; },
});
const DocumentImage = Image.extend({
  renderHTML: ({ node }) => ["span", { class: "image-placeholder", "data-image-src": node.attrs.src }, `Image: ${node.attrs.alt || "attachment"} (image preview is not enabled yet)`],
}).configure({ inline: true, allowBase64: false });
const DocumentTask = TaskItem.extend({
  addInputRules() {
    return [new InputRule({
      find: /^\[([ xX]?)\] $/,
      handler: ({ state, range, match, chain }) => {
        const checked = match[1].toLowerCase() === "x";
        const { $from } = state.selection;
        // Convert only the current bullet/numbered item; retain its siblings.
        if ($from.depth >= 2 && $from.node(-1).type.name === "listItem") {
          state.tr.delete(range.from, range.to)
            .setNodeMarkup($from.before($from.depth - 1), this.type, { checked });
        } else if ($from.depth === 1) {
          chain().deleteRange(range).wrapIn("taskList")
            .updateAttributes("taskItem", { checked }).run();
        } else {
          return null;
        }
      },
    })];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("li");
      dom.dataset.type = "taskItem";
      const label = document.createElement("label");
      label.contentEditable = "false";
      const input = document.createElement("input");
      input.type = "checkbox";
      label.append(input);
      const contentDOM = document.createElement("div");
      dom.append(label, contentDOM);
      const update = (next: DocumentNode) => {
        if (next.type.name !== "taskItem") return false;
        input.checked = next.attrs.checked;
        input.setAttribute("aria-label", `Task: ${next.textContent || "empty task"}`);
        dom.dataset.checked = String(next.attrs.checked);
        return true;
      };
      update(node);
      input.addEventListener("mousedown", event => event.preventDefault());
      input.addEventListener("change", () => {
        const pos = getPos();
        if (pos === undefined) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, checked: input.checked }).setMeta("taskToggle", true));
      });
      return { dom, contentDOM, update, stopEvent: event => label.contains(event.target as globalThis.Node) };
    };
  },
}).configure({ nested: true });

type Callbacks = {
  change: (source: string, selection: { anchor: number; head: number }) => void;
  selection: (anchor: number, head: number, style: FormatAction) => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  bookmark: (from?: number, to?: number, removeIds?: string[]) => void;
  find?: () => void;
  formatting?: (active: FormatAction[]) => void;
};
type Part = { raw: string; gap: string };

/** One document surface for Edit and Read; CodeMirror remains the source of truth. */
export class DocumentEditor {
  readonly editor: Editor;
  source: string;
  private prefix = "";
  private parts = new Map<DocumentNode, Part>();
  private syncing = false;
  private positions?: ReturnType<typeof documentPositions>;
  private lastDoc?: DocumentNode;
  private bookmarks: Bookmark[] = [];
  private lineHighlight = false;
  private highlightFrame = 0;
  private highlightObserver?: ResizeObserver;

  constructor(element: HTMLElement, source: string, private callbacks: Callbacks) {
    this.source = source;
    const parsed = parseDocument(source);
    const owner = this;
    const shortcuts = Extension.create({
      name: "documentControls", priority: 1000,
      addKeyboardShortcuts() {
        return {
          "Ctrl-a": () => owner.editor.commands.selectAll(),
          "Mod-a": () => owner.editor.commands.selectAll(),
          "Mod-s": () => { callbacks.save(); return true; },
          "Mod-f": () => { callbacks.find?.(); return !!callbacks.find; },
          "Mod-z": () => { if (!owner.editor.isEditable) return false; callbacks.undo(); return true; },
          "Mod-Shift-z": () => { if (!owner.editor.isEditable) return false; callbacks.redo(); return true; },
          "Mod-y": () => { if (!owner.editor.isEditable) return false; callbacks.redo(); return true; },
          "Mod-Shift-b": () => { callbacks.bookmark(); return true; },
          Enter: () => {
            const { empty, $from } = owner.editor.state.selection;
            if (!owner.editor.isEditable || !empty || $from.parent.type.name !== "paragraph"
              || $from.parentOffset !== $from.parent.content.size) return false;
            const fence = /^(`{3,}|~{3,})([\w+-]*)$/.exec($from.parent.textContent);
            if (!fence) return false;
            return owner.editor.chain().deleteRange({ from: $from.start(), to: $from.end() })
              .setCodeBlock(fence[2] ? { language: fence[2] } : undefined).run();
          },
          Tab: () => owner.editor.isEditable && (owner.editor.commands.sinkListItem("taskItem") || owner.editor.commands.sinkListItem("listItem")),
          "Shift-Tab": () => owner.editor.isEditable && (owner.editor.commands.liftListItem("taskItem") || owner.editor.commands.liftListItem("listItem")),
          ...Object.fromEntries(formatShortcuts.map(({ key, action }) => [key, () => { if (!owner.editor.isEditable) return false; owner.format(action); return true; }])),
        };
      },
      addProseMirrorPlugins() {
        return [new Plugin({
          filterTransaction: tr => !tr.docChanged || owner.syncing || owner.editor.isEditable || tr.getMeta("taskToggle") === true,
          props: { decorations: state => {
            const selected: Decoration[] = [];
            if (state.selection instanceof AllSelection) {
              state.doc.forEach((node, pos) => selected.push(Decoration.node(pos, pos + node.nodeSize, { class: "document-all-selected" })));
            }
            if (owner.editor && !owner.editor.isEditable && !state.selection.empty && !(state.selection instanceof AllSelection)) {
              selected.push(Decoration.inline(state.selection.from, state.selection.to, { class: "read-search-selection" }));
            }
            const mapping = owner.bookmarks.length ? documentPositions(state.doc, owner.source) : undefined;
            const markedBlocks = new Map<number, Bookmark[]>();
            for (const mark of owner.bookmarks) {
              const from = mapping!.toDocument(mark.from), to = mapping!.toDocument(mark.to);
              if (mark.unresolved || from >= to) continue;
              const start = state.doc.resolve(from);
              const pos = start.depth ? start.before(start.depth) : from;
              markedBlocks.set(pos, [...(markedBlocks.get(pos) ?? []), mark]);
            }
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock || !node.textContent.trim()) return;
              const marks = markedBlocks.get(pos) ?? [];
              // Match Source's active-line affordance without adding thousands of
              // interactive DOM nodes to long documents.
              const active = state.selection.head > pos && state.selection.head < pos + node.nodeSize;
              if (!marks.length && !active) return;
              selected.push(Decoration.node(pos, pos + node.nodeSize, {
                class: `document-bookmark-control${marks.length ? " document-bookmarked" : ""}`,
              }));
              selected.push(Decoration.widget(pos + 1, () => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `line-bookmark-button document-bookmark-button${marks.length ? " is-bookmarked" : ""}`;
                button.contentEditable = "false";
                button.title = marks.length ? `Remove bookmark: ${marks.map(mark => mark.name).join(", ")}` : "Bookmark this passage";
                button.setAttribute("aria-label", button.title);
                button.setAttribute("aria-pressed", String(!!marks.length));
                button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
                button.addEventListener("mousedown", event => event.preventDefault());
                button.addEventListener("click", event => {
                  event.preventDefault();
                  event.stopPropagation();
                  const sourceMapping = owner.mapping();
                  callbacks.bookmark(sourceMapping.toSource(pos + 1), sourceMapping.toSource(pos + 1 + node.content.size), marks.map(mark => mark.id));
                });
                return button;
              }, { side: -1, stopEvent: () => true }));
            });
            return DecorationSet.create(state.doc, selected);
          } },
        })];
      },
    });
    this.editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({ undoRedo: false, underline: false, trailingNode: false, bulletList: false, orderedList: false, link: { openOnClick: false, autolink: false } }),
        BulletList.extend({ content: "(listItem | taskItem)+" }), OrderedList.extend({
          content: "(listItem | taskItem)+",
          addInputRules() {
            return [wrappingInputRule({
              find: /^(1|\d+[.)]) $/,
              type: this.type,
              getAttributes: match => ({ start: parseInt(match[1], 10) }),
              joinPredicate: (match, node) => (!node.attrs.type || node.attrs.type === "1")
                && node.attrs.start + node.childCount === parseInt(match[1], 10),
            })];
          },
        }),
        TaskList, DocumentTask,
        TableKit.configure({ table: { resizable: false } }), DocumentImage, RawMarkdown.configure({ toggle: (node, relative, checked) => {
          let offset = this.prefix.length;
          this.editor.state.doc.forEach(block => {
            const part = this.parts.get(block);
            if (block === node && part) {
              const at = offset + relative;
              if (/\[[ xX]\]/.test(this.source.slice(at - 1, at + 2))) {
                const source = this.source.slice(0, at) + (checked ? "x" : " ") + this.source.slice(at + 1);
                const selection = this.sourceSelection();
                this.setSource(source);
                callbacks.change(source, selection);
              }
            }
            offset += (part?.raw.length ?? 0) + (part?.gap.length ?? 0);
          });
        } }),
        MarkdownExtension.configure({ markedOptions: { gfm: true } }), shortcuts,
      ],
      content: parsed.content,
      editorProps: {
        attributes: { class: "document-content", "aria-label": "Note editor", role: "textbox", "aria-multiline": "true" },
        handleClick: (_view, _pos, event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (link && (!this.editor.isEditable || event.metaKey || event.ctrlKey)) {
            const href = link.getAttribute("href");
            if (href && /^(https?:|mailto:)/i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ transaction }) => {
        if (this.syncing) return;
        const doc = this.editor.state.doc;
        // Checkbox-only changes preserve every byte except the check character.
        const checks = this.checkboxChange(transaction.before, doc);
        const next = checks ?? this.serialize(doc);
        if (checks !== null) {
          const delta = next.length - this.source.length;
          if (delta === 0) this.rememberParts(doc, parseDocument(next));
        }
        this.source = next;
        this.positions = undefined;
        this.lastDoc = undefined;
        const selection = this.sourceSelection();
        callbacks.change(next, selection);
        this.reportSelection();
      },
      onSelectionUpdate: ({ transaction }) => { if (!this.syncing && !transaction.docChanged) this.reportSelection(); },
      onTransaction: () => {
        this.scheduleLineHighlight();
        if (!this.syncing) this.reportFormatting();
      },
    });
    this.rememberParts(this.editor.state.doc, parsed);
    if (typeof ResizeObserver !== "undefined") {
      this.highlightObserver = new ResizeObserver(() => this.scheduleLineHighlight());
      this.highlightObserver.observe(this.editor.view.dom);
    }
  }

  private rememberParts(doc: DocumentNode, parsed: ReturnType<typeof parseDocument>) {
    this.prefix = parsed.prefix;
    this.parts = new Map();
    doc.forEach((node, _pos, index) => {
      const part = parsed.parts[index];
      if (part) this.parts.set(node, { raw: part.raw, gap: part.gap });
    });
  }
  private checkboxChange(before: DocumentNode, after: DocumentNode): string | null {
    const oldTasks: DocumentNode[] = [], newTasks: DocumentNode[] = [];
    before.descendants(node => { if (node.type.name === "taskItem") oldTasks.push(node); });
    after.descendants(node => { if (node.type.name === "taskItem") newTasks.push(node); });
    if (!oldTasks.length || oldTasks.length !== newTasks.length) return null;
    const oldJSON = structuredClone(before.toJSON()), nextJSON = structuredClone(after.toJSON());
    function clearChecks(node: JSONContent) {
      if (node.type === "taskItem" && node.attrs) node.attrs.checked = false;
      node.content?.forEach(clearChecks);
    }
    clearChecks(oldJSON); clearChecks(nextJSON);
    if (JSON.stringify(oldJSON) !== JSON.stringify(nextJSON)) return null;
    const offsets = taskOffsets(this.source);
    if (offsets.length !== oldTasks.length) return null;
    const chars = this.source.split("");
    for (let i = 0; i < oldTasks.length; i++) if (oldTasks[i].attrs.checked !== newTasks[i].attrs.checked) chars[offsets[i]] = newTasks[i].attrs.checked ? "x" : " ";
    return chars.join("");
  }
  private serialize(doc: DocumentNode) {
    const nextParts = new Map<DocumentNode, Part>();
    const chunks: string[] = [];
    doc.forEach((node, _pos, index) => {
      const previous = this.parts.get(node) ?? [...this.parts].find(([old]) => old.eq(node))?.[1];
      const raw = previous?.raw ?? this.editor.markdown!.serialize({ type: "doc", content: [node.toJSON()] });
      const gap = previous?.gap || (index < doc.childCount - 1 ? "\n\n" : "");
      nextParts.set(node, { raw, gap });
      chunks.push(raw + gap);
    });
    this.parts = nextParts;
    return this.prefix + chunks.join("");
  }
  private mapping() {
    if (!this.positions || this.lastDoc !== this.editor.state.doc) {
      this.positions = documentPositions(this.editor.state.doc, this.source);
      this.lastDoc = this.editor.state.doc;
    }
    return this.positions;
  }
  sourceSelection() {
    if (this.editor.state.selection instanceof AllSelection) return { anchor: 0, head: this.source.length };
    const { anchor, head } = this.editor.state.selection;
    const map = this.mapping();
    return { anchor: map.toSource(anchor), head: map.toSource(head) };
  }
  activeFormatting(): FormatAction[] {
    const formats: [FormatAction, string][] = [
      ["bold", "bold"], ["italic", "italic"], ["strike", "strike"], ["code", "code"], ["codeBlock", "codeBlock"],
      ["bullet", "bulletList"], ["numbered", "orderedList"], ["task", "taskList"], ["quote", "blockquote"],
    ];
    return formats.filter(([, name]) => this.editor.isActive(name)).map(([action]) => action);
  }
  private reportFormatting() {
    this.callbacks.formatting?.(this.activeFormatting());
  }
  private reportSelection() {
    const { anchor, head } = this.sourceSelection();
    const level = this.editor.getAttributes("heading").level;
    this.callbacks.selection(anchor, head, this.editor.isActive("heading") ? `h${level}` as FormatAction : "paragraph");
  }
  setSource(source: string, anchor?: number, head = anchor) {
    if (source !== this.source) {
      this.syncing = true;
      try {
        const parsed = parseDocument(source);
        this.editor.commands.setContent(parsed.content, { emitUpdate: false });
        this.source = source;
        this.positions = undefined;
        this.rememberParts(this.editor.state.doc, parsed);
      } finally { this.syncing = false; }
    }
    if (anchor !== undefined) this.select(anchor, head ?? anchor, false);
  }
  setEditable(editable: boolean, spellcheck: boolean) {
    this.editor.setEditable(editable, false);
    this.editor.view.dom.setAttribute("aria-readonly", String(!editable));
    this.editor.view.dom.setAttribute("spellcheck", String(editable && spellcheck));
    this.editor.view.dom.setAttribute("aria-label", editable ? "Note editor" : "Note document");
  }
  setLineHighlight(enabled: boolean) {
    this.lineHighlight = enabled;
    this.editor.view.dom.classList.toggle("has-line-highlight", enabled);
    this.scheduleLineHighlight();
  }
  private scheduleLineHighlight() {
    cancelAnimationFrame(this.highlightFrame);
    if (!this.lineHighlight) return;
    this.highlightFrame = requestAnimationFrame(() => {
      const { view, state } = this.editor;
      const dom = view.dom;
      if (!dom.getClientRects().length) return;
      const caret = view.coordsAtPos(state.selection.head);
      const bounds = dom.getBoundingClientRect();
      dom.style.setProperty("--active-line-top", `${caret.top - bounds.top + dom.scrollTop}px`);
      dom.style.setProperty("--active-line-height", `${caret.bottom - caret.top}px`);
    });
  }
  setBookmarks(bookmarks: Bookmark[]) {
    this.bookmarks = bookmarks;
    this.editor.view.dispatch(this.editor.state.tr.setMeta("bookmarks", true));
  }
  select(from: number, to = from, focus = true) {
    const mapping = this.mapping();
    const doc = this.editor.state.doc;
    const clamp = (offset: number) => Math.max(0, Math.min(doc.content.size, mapping.toDocument(offset)));
    this.editor.view.dispatch(this.editor.state.tr.setSelection(TextSelection.between(doc.resolve(clamp(from)), doc.resolve(clamp(to)))).scrollIntoView());
    if (focus && this.editor.isEditable) this.editor.view.focus();
  }
  scrollSelectionIntoView() {
    // ProseMirror's scrollIntoView ignores selections when the Find input has
    // focus. Use document coordinates to move the actual reading viewport.
    const pane = this.editor.view.dom.closest<HTMLElement>(".document-pane");
    if (!pane) return;
    const match = this.editor.view.coordsAtPos(this.editor.state.selection.from);
    const bounds = pane.getBoundingClientRect();
    pane.scrollTo({
      top: pane.scrollTop + match.top - bounds.top - pane.clientTop - (pane.clientHeight - (match.bottom - match.top)) / 2,
      behavior: "instant",
    });
  }
  format(action: FormatAction) {
    if (!this.editor.isEditable) return;
    const chain = this.editor.chain().focus();
    if (/^h[1-6]$/.test(action)) chain.setHeading({ level: Number(action[1]) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
    else switch (action) {
      case "paragraph": chain.clearNodes().setParagraph().run(); break;
      case "bold": chain.toggleBold().run(); break;
      case "italic": chain.toggleItalic().run(); break;
      case "strike": chain.toggleStrike().run(); break;
      case "code": chain.toggleCode().run(); break;
      case "codeBlock": chain.toggleCodeBlock().run(); break;
      case "bullet": chain.toggleBulletList().run(); break;
      case "numbered": chain.toggleOrderedList().run(); break;
      case "task": chain.toggleTaskList().run(); break;
      case "quote": chain.toggleBlockquote().run(); break;
    }
    this.reportSelection();
  }
  destroy() {
    cancelAnimationFrame(this.highlightFrame);
    this.highlightObserver?.disconnect();
    this.editor.destroy();
  }
}
