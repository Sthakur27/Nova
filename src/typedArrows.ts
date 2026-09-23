import { Prec, StateEffect, StateField } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { isolateHistory, undo } from "@codemirror/commands";

/** Plain-text typing only; paste, dictation, and loaded files stay literal. */
export function typedArrows(enabled: () => boolean) {
  const converted = StateEffect.define<boolean>();
  const canRestore = StateField.define<boolean>({
    create: () => false,
    update(value, tr) {
      if (tr.docChanged || tr.selection) value = false;
      for (const effect of tr.effects) if (effect.is(converted)) value = effect.value;
      return value;
    },
  });
  return [
    canRestore,
    EditorView.inputHandler.of((view, from, to, text, insert) => {
      if (!enabled() || view.state.readOnly || view.composing || from !== to || from === 0
        || view.state.selection.ranges.length !== 1 || text.length !== 1) return false;
      const pair = view.state.sliceDoc(from - 1, from) + text;
      const arrow = pair === "->" ? "→" : pair === "<-" ? "←" : null;
      if (!arrow) return false;
      view.dispatch(insert());
      // Keep the literal pair in history so Undo restores it in one step.
      view.dispatch({
        changes: { from: from - 1, to: from + 1, insert: arrow },
        selection: { anchor: from },
        effects: converted.of(true),
        annotations: isolateHistory.of("full"),
        userEvent: "input.type",
      });
      return true;
    }),
    Prec.high(keymap.of([{ key: "Backspace", run: view =>
      enabled() && !view.state.readOnly && view.state.field(canRestore) && undo(view),
    }])),
  ];
}
