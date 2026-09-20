import { syntaxTree } from "@codemirror/language";
import { indentMore, indentLess } from "@codemirror/commands";
import { EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type KeyBinding,
} from "@codemirror/view";

class Bullet extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.textContent = "•";
    el.className = "md-bullet";
    return el;
  }
}
class Task extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: Task) {
    return this.checked === other.checked;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.checked = this.checked;
    el.setAttribute("aria-label", "Toggle task");
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", () => {
      const pos = view.posAtDOM(el);
      if (/^\[[ xX]\]$/.test(view.state.doc.sliceString(pos, pos + 3)))
        view.dispatch({
          changes: {
            from: pos + 1,
            to: pos + 2,
            insert: this.checked ? " " : "x",
          },
          userEvent: "input",
        });
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}
function render(view: EditorView) {
  const ranges: Range<Decoration>[] = [];
  const hidden: Range<Decoration>[] = [];
  const lines = new Set<number>();
  const seen = new Set<string>();
  const hide = (from: number, to: number) => {
    if (to > from) {
      const r = Decoration.replace({}).range(from, to);
      ranges.push(r);
      hidden.push(r);
    }
  };
  for (const visible of view.visibleRanges)
    syntaxTree(view.state).iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        const name = node.name,
          from = node.from,
          to = node.to;
        const id = name + ":" + from + ":" + to;
        if (seen.has(id)) return;
        seen.add(id);
        if (name === "TaskMarker") {
          const r = Decoration.replace({
            widget: new Task(
              view.state.doc.sliceString(from, to).toLowerCase() === "[x]",
            ),
          }).range(from, to);
          ranges.push(r);
          hidden.push(r);
        }
        const heading = /^ATXHeading([1-6])$/.exec(name);
        if (heading && !lines.has(from)) {
          lines.add(from);
          ranges.push(
            Decoration.line({ class: `md-heading md-h${heading[1]}` }).range(
              view.state.doc.lineAt(from).from,
            ),
          );
        }
        const cls: Record<string, string> = {
          StrongEmphasis: "md-strong",
          Emphasis: "md-em",
          Strikethrough: "md-strike",
          InlineCode: "md-code",
          Link: "md-link",
        };
        if (cls[name])
          ranges.push(Decoration.mark({ class: cls[name] }).range(from, to));
        if (name === "HeaderMark" || name === "QuoteMark")
          hide(
            from,
            to + (view.state.doc.sliceString(to, to + 1) === " " ? 1 : 0),
          );
        if (
          ["EmphasisMark", "StrikethroughMark"].includes(name) ||
          (name === "CodeMark" && node.node.parent?.name === "InlineCode")
        )
          hide(from, to);
        if (
          name === "ListMark" &&
          /^[-+*]$/.test(view.state.doc.sliceString(from, to))
        ) {
          const r = Decoration.replace({ widget: new Bullet() }).range(
            from,
            to,
          );
          ranges.push(r);
          hidden.push(r);
        }
        if (name === "Blockquote")
          for (
            let pos = view.state.doc.lineAt(Math.max(from, visible.from)).from;
            pos <= Math.min(to, visible.to);
          ) {
            const line = view.state.doc.lineAt(pos);
            if (!lines.has(pos)) {
              lines.add(pos);
              ranges.push(Decoration.line({ class: "md-quote" }).range(pos));
            }
            if (line.to === view.state.doc.length) break;
            pos = line.to + 1;
          }
        if (name === "Link") {
          const text = view.state.doc.sliceString(from, to);
          const close = text.lastIndexOf("](");
          if (
            text.startsWith("[") &&
            close > 0 &&
            text.endsWith(")") &&
            !text.slice(close).includes("\n")
          ) {
            hide(from, from + 1);
            hide(from + close, to);
            return false;
          }
        }
      },
    });
  return {
    decorations: Decoration.set(ranges, true),
    atomic: Decoration.set(hidden, true),
  };
}
export const richMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      const r = render(view);
      this.decorations = r.decorations;
      this.atomic = r.atomic;
    }
    update(update: import("@codemirror/view").ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        const r = render(update.view);
        this.decorations = r.decorations;
        this.atomic = r.atomic;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.atomic ?? Decoration.none,
      ),
  },
);

export type FormatAction =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "bullet"
  | "numbered"
  | "task"
  | "quote";
export function formatTransaction(state: EditorState, action: FormatAction) {
  const { from, to } = state.selection.main;
  const wrappers: Partial<Record<FormatAction, string>> = {
    bold: "**",
    italic: "*",
    strike: "~~",
    code: "`",
  };
  const wrap = wrappers[action];
  if (wrap) {
    const selected = state.doc.sliceString(from, to);
    if (
      from >= wrap.length &&
      state.doc.sliceString(from - wrap.length, from) === wrap &&
      state.doc.sliceString(to, to + wrap.length) === wrap
    )
      return state.update({
        changes: [
          { from: from - wrap.length, to: from, insert: "" },
          { from: to, to: to + wrap.length, insert: "" },
        ],
        selection: { anchor: from - wrap.length, head: to - wrap.length },
        userEvent: "input",
      });
    const text = selected || "text";
    return state.update({
      changes: { from, to, insert: wrap + text + wrap },
      selection: {
        anchor: from + wrap.length,
        head: from + wrap.length + text.length,
      },
      userEvent: "input",
    });
  }
  const prefix = {
    paragraph: "",
    h1: "# ",
    h2: "## ",
    h3: "### ",
    h4: "#### ",
    h5: "##### ",
    h6: "###### ",
    numbered: "1. ",
    bullet: "- ",
    task: "- [ ] ",
    quote: "> ",
  }[action as Exclude<FormatAction, "bold" | "italic" | "strike" | "code">];
  const first = state.doc.lineAt(from),
    last = state.doc.lineAt(
      to > from && state.doc.lineAt(to).from === to ? to - 1 : to,
    );
  const changes = [];
  for (let n = first.number; n <= last.number; n++) {
    const line = state.doc.line(n);
    const indent = /^[ \t]*/.exec(line.text)![0].length;
    const old =
      /^(?:#{1,6}\s+|[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/.exec(line.text.slice(indent))?.[0] ??
      "";
    changes.push({
      from: line.from + indent,
      to: line.from + indent + old.length,
      insert: action === "numbered" ? `${n - first.number + 1}. ` : prefix,
    });
  }
  const changeSet = state.changes(changes);
  return state.update({
    changes: changeSet,
    // A cursor at the start of a line belongs after its new block marker.
    selection: state.selection.map(changeSet, 1),
    userEvent: "input",
  });
}

export function indentationKeymap(enabled: () => boolean): KeyBinding[] {
  return [{
    key: "Tab",
    run: view => enabled() && indentMore(view),
    shift: view => enabled() && indentLess(view),
  }];
}

export function paragraphStyle(state: EditorState): FormatAction {
  const line = state.doc.lineAt(state.selection.main.head).text;
  const heading = /^(#{1,6})\s/.exec(line);
  return heading ? `h${heading[1].length}` as FormatAction : "paragraph";
}
export const formatShortcuts: { key: string; action: FormatAction }[] = [
  { key: "Mod-b", action: "bold" },
  { key: "Mod-i", action: "italic" },
  { key: "Mod-Shift-x", action: "strike" },
  { key: "Mod-Alt-0", action: "paragraph" },
  ...([1, 2, 3, 4, 5, 6] as const).map(level => ({ key: `Mod-Alt-${level}`, action: `h${level}` as FormatAction })),
  { key: "Mod-Shift-7", action: "numbered" },
  { key: "Mod-Shift-8", action: "bullet" },
  { key: "Mod-Shift-9", action: "quote" },
];
export function formattingKeymap(enabled: () => boolean): KeyBinding[] {
  return formatShortcuts.map(({ key, action }) => ({ key, run: view => {
    if (!enabled()) return false;
    view.dispatch(formatTransaction(view.state, action));
    return true;
  } }));
}

/** Formats enclosing the entire source selection, excluding Markdown delimiters. */
export function activeFormatting(state: EditorState): FormatAction[] {
  const { from, to } = state.selection.main;
  const formats = new Set<FormatAction>();
  const names: Record<string, FormatAction> = {
    StrongEmphasis: "bold", Emphasis: "italic", Strikethrough: "strike", InlineCode: "code",
    BulletList: "bullet", OrderedList: "numbered", Task: "task", Blockquote: "quote",
  };
  for (let node = syntaxTree(state).resolveInner(from, 1); node; node = node.parent!) {
    const action = names[node.name];
    if (!action || to > node.to) continue;
    const inline = ["bold", "italic", "strike", "code"].includes(action);
    const start = inline ? node.firstChild?.to ?? node.from : node.from;
    const end = inline ? node.lastChild?.from ?? node.to : node.to;
    if (from >= start && to <= end) formats.add(action);
  }
  if (formats.has("task")) formats.delete("bullet");
  return [...formats];
}
