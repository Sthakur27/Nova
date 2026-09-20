import { useEffect, useRef } from "react";

export type CloseTabChoice = "save" | "discard" | "cancel";

export default function CloseTabDialog({ path, onChoose }: { path: string; onChoose: (choice: CloseTabChoice) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="rename-dialog" aria-labelledby="close-tab-title"
    onCancel={event => { event.preventDefault(); onChoose("cancel"); }}
    onKeyDown={event => event.stopPropagation()}>
    <h2 id="close-tab-title">Save changes?</h2>
    <p>Save changes to “{path.split("/").at(-1)}” before closing? Discarding will permanently remove your unsaved changes.</p>
    <div className="dialog-buttons">
      <button onClick={() => onChoose("cancel")}>Cancel</button>
      <button onClick={() => onChoose("discard")}>Discard</button>
      <button className="primary" onClick={() => onChoose("save")}>Save</button>
    </div>
  </dialog>;
}
