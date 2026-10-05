// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, createRef, forwardRef, useImperativeHandle, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import NoteEditor, { type NoteEditorHandle } from "./NoteEditor";
import { WebStore, noteKey, type WebNote } from "./store";

vi.mock("../Editor", () => ({ default: forwardRef(function MockEditor(props: { initial: string; onChange: () => void }, ref) {
  const [text, setText] = useState(props.initial);
  useImperativeHandle(ref, () => ({ text: () => text, marks: () => [] }));
  return <><textarea aria-label="Editor text" value={text} onChange={event => setText(event.target.value)}/><button onClick={props.onChange}>Persist edit</button></>;
}) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const store = new WebStore(crypto.randomUUID());
  const note: WebNote = { key: noteKey("alice", "note"), id: "note", account: "alice", space: "space", parent: "space", name: "Note.md", text: "initial", directory: "", bookmarks: [], revision: 1 };
  await store.mutate(note.key, () => note);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); const ref = createRef<NoteEditorHandle>();
  await act(async () => root.render(<NoteEditor ref={ref} note={note} store={store} onSaved={() => {}} onSaving={() => {}}/>));
  return { store, note, container, ref, cleanup: async () => { await act(async () => root.unmount()); container.remove(); await store.close(); } };
}
it("waits for local save completion before allowing navigation", async () => {
  const test = await mount();
  try {
    await act(async () => { Array.from(test.container.querySelectorAll("button")).find(button => button.textContent === "Persist edit")!.click(); });
    await test.ref.current!.flush();
    expect((await test.store.get(test.note.key))!.revision).toBe(2);
  } finally { await test.cleanup(); }
});
it("blocks navigation and retains the editor when browser storage fails", async () => {
  const test = await mount();
  vi.spyOn(test.store, "save").mockRejectedValue(new Error("Storage is full"));
  try {
    await act(async () => { Array.from(test.container.querySelectorAll("button")).find(button => button.textContent === "Persist edit")!.click(); });
    await expect(test.ref.current!.flush()).rejects.toThrow("Export your unsaved edits");
    expect(test.container.textContent).toContain("Not saved");
    expect(test.container.textContent).toContain("Storage is full");
    expect(test.container.querySelector("textarea")!.value).toBe("initial");
    expect((await test.store.get(test.note.key))!.revision).toBe(1);
  } finally { await test.cleanup(); }
});
