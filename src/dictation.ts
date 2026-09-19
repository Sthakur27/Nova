import {
  StateEffect,
  StateField,
  Transaction,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
export const setDictationAnchor = StateEffect.define<number | null>();
export const dictationAnchor = StateField.define<number | null>({
  create: () => null,
  update(anchor, tr) {
    if (anchor !== null && tr.docChanged) {
      const range = tr.startState.field(dictationPreview, false);
      const previewUpdate = tr.effects.some(effect => effect.is(setPreviewRange));
      let touched = false;
      if (range && !previewUpdate) tr.changes.iterChangedRanges((from, to) => {
        if (from < range.to && to > range.from) touched = true;
      });
      anchor = touched ? null : tr.changes.mapPos(anchor, 1);
    }
    for (const effect of tr.effects)
      if (effect.is(setDictationAnchor)) anchor = effect.value;
    return anchor;
  },
});
type PreviewRange = { from: number; to: number };
const setPreviewRange = StateEffect.define<PreviewRange | null>();
export const dictationPreview = StateField.define<PreviewRange | null>({
  create: () => null,
  update(range, tr) {
    if (range && tr.docChanged) {
      let touched = false;
      tr.changes.iterChangedRanges((from, to) => {
        if (from < range!.to && to > range!.from) touched = true;
      });
      // Once the user edits the live text, keep their version instead of replacing it.
      range = touched ? null : { from: tr.changes.mapPos(range.from, 1), to: tr.changes.mapPos(range.to, -1) };
    }
    for (const effect of tr.effects) {
      if (effect.is(setPreviewRange)) range = effect.value;
      if (effect.is(setDictationAnchor)) range = null;
    }
    return range;
  },
});
export function previewTransaction(state: EditorState, text: string): TransactionSpec | null {
  const range = state.field(dictationPreview);
  const at = range?.from ?? state.field(dictationAnchor);
  if (at === null || !text.trim()) return null;
  const to = range?.to ?? at;
  const before = state.sliceDoc(Math.max(0, at - 1), at);
  const after = state.sliceDoc(to, to + 1);
  const insert = (before && !/\s|[([{“‘]/u.test(before) && !/^[.,!?;:)/\]}]/u.test(text) ? " " : "") + text.trim() +
    (after && !/\s|[.,!?;:)\]}]/u.test(after) ? " " : "");
  return {
    changes: { from: at, to, insert },
    effects: setPreviewRange.of({ from: at, to: at + insert.length }),
    annotations: Transaction.addToHistory.of(false),
    scrollIntoView: state.selection.main.head === to,
  };
}
export function clearPreviewTransaction(state: EditorState): TransactionSpec | null {
  const range = state.field(dictationPreview);
  if (!range) return null;
  return {
    changes: { from: range.from, to: range.to },
    effects: [setDictationAnchor.of(range.from), setPreviewRange.of(null)],
    annotations: Transaction.addToHistory.of(false),
  };
}
export function transcriptTransaction(
  state: EditorState,
  transcript: string,
): TransactionSpec | null {
  const at = state.field(dictationAnchor),
    text = transcript.trim();
  if (at === null || !text) return null;
  const before = state.sliceDoc(Math.max(0, at - 1), at),
    after = state.sliceDoc(at, at + 1);
  const left =
    before && !/\s|[([{“‘]/u.test(before) && !/^[.,!?;:)/\]}]/u.test(text)
      ? " "
      : "";
  const right = after && !/\s|[.,!?;:)\]}]/u.test(after) ? " " : "";
  const insert = left + text + right;
  return {
    changes: { from: at, insert },
    selection: { anchor: at + insert.length },
    effects: setDictationAnchor.of(null),
    annotations: [
      Transaction.userEvent.of("input.dictation"),
      isolateHistory.of("full"),
    ],
    scrollIntoView: true,
  };
}
export type VoicePhase = "idle" | "starting" | "recording" | "transcribing";
export type VoiceTransport = {
  start: (id: string) => Promise<void>;
  finish: (id: string) => Promise<string>;
  cancel: (id: string) => Promise<void>;
};
/** A session ID prevents late IPC results from reaching a cancelled session. */
export class DictationSession {
  id: string | null = null;
  phase: VoicePhase = "idle";
  private ended = false;
  private lastPartial = "";
  constructor(
    private transport: VoiceTransport,
    private onPhase: (phase: VoicePhase) => void,
    private onText: (text: string) => void,
    private onError: (error: string) => void,
    private onPartial: (text: string) => void = () => {},
  ) {}
  private setPhase(phase: VoicePhase) {
    this.phase = phase;
    this.onPhase(phase);
  }
  async start(id: string) {
    if (this.id) return;
    this.id = id;
    this.ended = false;
    this.lastPartial = "";
    this.setPhase("starting");
    try {
      await this.transport.start(id);
      if (this.id !== id) {
        await this.transport.cancel(id);
        return;
      }
      this.setPhase("recording");
      if (this.ended) await this.finish();
    } catch (error) {
      if (this.id === id) {
        this.id = null;
        this.setPhase("idle");
        this.onError(String(error));
      }
    }
  }
  partial(id: string, text: string) {
    if (id === this.id && text !== this.lastPartial && (this.phase === "recording" || this.phase === "starting")) {
      this.lastPartial = text;
      this.onPartial(text);
    }
  }
  captureEnded(id: string) {
    if (id !== this.id) return;
    if (this.phase === "starting") this.ended = true;
    if (this.phase === "recording") void this.finish();
  }
  async finish() {
    const id = this.id;
    if (!id || this.phase !== "recording") return;
    this.setPhase("transcribing");
    try {
      const text = await this.transport.finish(id);
      if (this.id === id) this.onText(text);
    } catch (error) {
      if (this.id === id) this.onError(String(error));
    } finally {
      if (this.id === id) {
        this.id = null;
        this.setPhase("idle");
      }
    }
  }
  async cancel() {
    const id = this.id;
    this.id = null;
    this.setPhase("idle");
    if (id) {
      try {
        await this.transport.cancel(id);
      } catch (error) {
        this.onError(String(error));
      }
    }
  }
}
