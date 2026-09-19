import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { bookmarkField } from "./Editor";
import {
  DictationSession,
  dictationAnchor,
  setDictationAnchor,
  transcriptTransaction,
} from "./dictation";
function state(doc: string, at: number) {
  return EditorState.create({
    doc,
    extensions: [history(), dictationAnchor],
  }).update({ effects: setDictationAnchor.of(at) }).state;
}
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
describe("dictation insertion", () => {
  it("inserts at the anchored position after intervening edits and cursor moves", () => {
    let doc = state("Hello world", 5);
    doc = doc.update({
      changes: { from: 0, insert: "A: " },
      selection: { anchor: 0 },
    }).state;
    doc = doc.update(transcriptTransaction(doc, "beautiful")!).state;
    expect(doc.doc.toString()).toBe("A: Hello beautiful world");
  });
  it("does not insert spaces before punctuation or after an opening bracket", () => {
    let doc = state("(world)", 1);
    doc = doc.update(transcriptTransaction(doc, "hello")!).state;
    expect(doc.doc.toString()).toBe("(hello world)");
    doc = state("Hello!", 5);
    doc = doc.update(transcriptTransaction(doc, "there")!).state;
    expect(doc.doc.toString()).toBe("Hello there!");
  });
  it("clears the insertion anchor and ignores empty or cancelled results", () => {
    let doc = state("Text", 4);
    expect(transcriptTransaction(doc, "   ")).toBeNull();
    doc = doc.update(transcriptTransaction(doc, "more")!).state;
    expect(transcriptTransaction(doc, "duplicate")).toBeNull();
  });
  it("preserves bookmarks and allows one-step undo of the transcript", () => {
    let doc = EditorState.create({
      doc: "Hello target",
      extensions: [
        history(),
        dictationAnchor,
        bookmarkField.init(() => [
          { id: "b", name: "Saved", from: 6, to: 12, quote: "target" },
        ]),
      ],
    });
    doc = doc.update({ effects: setDictationAnchor.of(0) }).state;
    doc = doc.update(transcriptTransaction(doc, "A note.")!).state;
    expect(doc.field(bookmarkField)[0].from).toBe(14);
    expect(
      undo({
        state: doc,
        dispatch: (tr) => {
          doc = tr.state;
        },
      }),
    ).toBe(true);
    expect(doc.doc.toString()).toBe("Hello target");
    expect(doc.field(bookmarkField)[0].from).toBe(6);
  });
});
describe("dictation session lifecycle", () => {
  function setup(
    start = Promise.resolve(),
    finish = Promise.resolve("spoken words"),
  ) {
    const transport = {
      start: vi.fn(() => start),
      finish: vi.fn(() => finish),
      cancel: vi.fn(async () => {}),
    };
    const onText = vi.fn(),
      onError = vi.fn(),
      onPhase = vi.fn();
    return {
      session: new DictationSession(transport, onPhase, onText, onError),
      transport,
      onText,
      onError,
      onPhase,
    };
  }
  it("finishes only once when Stop and the microphone-end event race", async () => {
    const pending = deferred<string>();
    const t = setup(undefined, pending.promise);
    await t.session.start("a");
    const finish = t.session.finish();
    t.session.captureEnded("a");
    pending.resolve("hello");
    await finish;
    expect(t.transport.finish).toHaveBeenCalledTimes(1);
    expect(t.onText).toHaveBeenCalledWith("hello");
    expect(t.session.phase).toBe("idle");
  });
  it("discards a late transcript after cancellation", async () => {
    const pending = deferred<string>();
    const t = setup(undefined, pending.promise);
    await t.session.start("a");
    const finish = t.session.finish();
    await t.session.cancel();
    pending.resolve("late");
    await finish;
    expect(t.onText).not.toHaveBeenCalled();
    expect(t.transport.cancel).toHaveBeenCalledWith("a");
  });
  it("cleans up a microphone that finishes starting after Cancel", async () => {
    const pending = deferred<void>();
    const t = setup(pending.promise);
    const start = t.session.start("a");
    await t.session.cancel();
    pending.resolve();
    await start;
    expect(t.transport.cancel).toHaveBeenLastCalledWith("a");
    expect(t.session.phase).toBe("idle");
  });
  it("keeps errors actionable and ignores old session events", async () => {
    const t = setup(Promise.reject(new Error("Microphone permission denied")));
    await t.session.start("a");
    expect(t.onError).toHaveBeenCalledWith(
      "Error: Microphone permission denied",
    );
    expect(t.session.phase).toBe("idle");
    t.session.captureEnded("old");
    expect(t.transport.finish).not.toHaveBeenCalled();
  });
});
