import { useEffect, useRef } from "react";

export type CloseTabChoice = "save" | "discard" | "cancel";

export default function CloseTabDialog({ path, onChoose }: { path: string; onChoose: (choice: CloseTabChoice) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    title.current?.focus();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="rename-dialog close-tab-dialog" aria-labelledby="close-tab-title" aria-describedby="close-tab-description"
    onCancel={event => { event.preventDefault(); onChoose("cancel"); }}
    onKeyDown={event => event.stopPropagation()}>
    <h2 ref={title} tabIndex={-1} id="close-tab-title">Save changes?</h2>
    <p id="close-tab-description">Save changes to “{path.split("/").at(-1)}” before closing? Discarding will permanently remove your unsaved changes.</p>
    <div className="dialog-buttons">
      <button onClick={() => onChoose("cancel")}>Cancel</button>
      <button className="close-tab-discard" onClick={() => onChoose("discard")}>Discard</button>
      <button className="close-tab-save" onClick={() => onChoose("save")}>Save</button>
    </div>
  </dialog>;
}
