import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

export default function RenameStateDialog({ name: original, onRename, onClose }: {
  name: string; onRename: (name: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(original), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal(); input.current?.select();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="rename-dialog" aria-labelledby="rename-state-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={event => {
      event.preventDefault();
      if (!name.trim()) return;
      try { if (name.trim() !== original) onRename(name.trim()); onClose(); }
      catch (error) { setError(String(error).replace(/^Error: /, "")); }
    }}>
      <Pencil className="dialog-icon" size={24} />
      <h2 id="rename-state-title">Rename saved state</h2>
      <div className="rename-fields"><label>State name
        <input ref={input} value={name} maxLength={100} autoComplete="off"
          onChange={event => { setName(event.target.value); setError(""); }} />
      </label></div>
      {error && <p className="rename-error" role="alert">{error}</p>}
      <div className="dialog-buttons">
        <button type="button" onClick={onClose}>Cancel</button>
        <button className="primary" type="submit" disabled={!name.trim()}>Rename</button>
      </div>
    </form>
  </dialog>;
}
