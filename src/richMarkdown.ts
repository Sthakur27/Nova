import { syntaxTree } from "@codemirror/language";
import { EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
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
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "bullet"
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
    const old =
      /^(?:#{1,6}\s+|[-+*]\s+(?:\[[ xX]\]\s+)?|>\s?)/.exec(line.text)?.[0] ??
      "";
    changes.push({
      from: line.from,
      to: line.from + old.length,
      insert: prefix,
    });
  }
  return state.update({ changes, userEvent: "input" });
}
