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
    if (anchor !== null && tr.docChanged) anchor = tr.changes.mapPos(anchor, 1);
    for (const effect of tr.effects)
      if (effect.is(setDictationAnchor)) anchor = effect.value;
    return anchor;
  },
});
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
  constructor(
    private transport: VoiceTransport,
    private onPhase: (phase: VoicePhase) => void,
    private onText: (text: string) => void,
    private onError: (error: string) => void,
  ) {}
  private setPhase(phase: VoicePhase) {
    this.phase = phase;
    this.onPhase(phase);
  }
  async start(id: string) {
    if (this.id) return;
    this.id = id;
    this.ended = false;
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
