import { normalizeExtension } from "./fileExtensions";
import { useEffect, useId, useRef, useState } from "react";
import TextWidthControl, { type TextWidth } from "./TextWidthControl";
import { Check, Settings2, X } from "lucide-react";

function Toggle({ title, description, checked, onChange }: {
  title: string; description: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  const id = useId();
  return <div className="settings-row">
    <div><label id={id}>{title}</label><p id={`${id}-description`}>{description}</p></div>
    <button type="button" className="settings-switch" role="switch" aria-checked={checked}
      aria-labelledby={id} aria-describedby={`${id}-description`} onClick={() => onChange(!checked)}>
      <span>{checked && <Check size={10} />}</span>
    </button>
  </div>;
}

type Props = {
  onClose: () => void;
  galaxy: boolean; onGalaxy: (value: boolean) => void;
  plasma: boolean; onPlasma: (value: boolean) => void;
  lineHighlight: boolean; onLineHighlight: (value: boolean) => void;
  lineNumbers: boolean; onLineNumbers: (value: boolean) => void;
  wordWrap: boolean; onWordWrap: (value: boolean) => void;
  spellcheck: boolean; onSpellcheck: (value: boolean) => void;
  bookmarks: boolean; onBookmarks: (value: boolean) => void;
  fontSize: string; onFontSize: (value: string) => void;
  textWidth: TextWidth; onTextWidth: (value: TextWidth) => void;
  defaultExtension: string; onDefaultExtension: (value: string) => void;
  storageError: boolean;
};
export default function Settings(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [extension, setExtension] = useState(props.defaultExtension);
  const [extensionError, setExtensionError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title"
    onCancel={props.onClose} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) props.onClose();
      }
    }}>
    <header className="settings-header">
      <div className="settings-emblem"><Settings2 size={21} /></div>
      <div><h1 id="settings-title">Settings</h1><p>Make yourself at home.</p></div>
      <button autoFocus className="icon-button" aria-label="Close settings" onClick={props.onClose}><X size={18} /></button>
    </header>
    <div className="settings-content">
      <section aria-labelledby="settings-appearance"><h2 id="settings-appearance">Appearance</h2>
        <Toggle title="Galaxy mode" description="Give your editor a translucent backdrop." checked={props.galaxy} onChange={props.onGalaxy} />
        <Toggle title="Energy effects" description="A little motion and glow around your workspace." checked={props.plasma} onChange={props.onPlasma} />
      </section>
      <section aria-labelledby="settings-editor"><h2 id="settings-editor">Editor</h2>
        <div className="settings-row"><div><label htmlFor="settings-font-size">Text size</label><p>Adjust the text in Edit and Source modes.</p></div>
          <select id="settings-font-size" value={props.fontSize} onChange={(e) => props.onFontSize(e.target.value)}>
            <option value="small">Small</option><option value="default">Default</option><option value="large">Large</option><option value="extra-large">Extra large</option>
          </select>
        </div>
        <div className="settings-row"><div><label htmlFor="settings-text-width">Text width</label><p>Set the text area in Edit, Source, and Read modes.</p></div>
          <TextWidthControl id="settings-text-width" value={props.textWidth} onChange={props.onTextWidth} />
        </div>
        <Toggle title="Line numbers" description="Find your place in longer notes." checked={props.lineNumbers} onChange={props.onLineNumbers} />
        <Toggle title="Line highlight" description="Highlight your current line while editing or reading." checked={props.lineHighlight} onChange={props.onLineHighlight} />
        <Toggle title="Word wrap" description="Keep long lines within the editor width." checked={props.wordWrap} onChange={props.onWordWrap} />
        <Toggle title="Spellcheck" description="Use your system’s spelling suggestions as you type." checked={props.spellcheck} onChange={props.onSpellcheck} />
      </section>
      <section aria-labelledby="settings-workspace"><h2 id="settings-workspace">Workspace</h2>
        <div className="settings-row"><div><label htmlFor="settings-extension">Default file extension</label><p id="settings-extension-help">Use any extension for new text files. Default: .txt.</p>
          {extensionError && <p id="settings-extension-error" role="alert">{extensionError}</p>}</div>
          <input id="settings-extension" type="text" value={extension} placeholder=".txt" spellCheck={false}
            aria-invalid={!!extensionError} aria-describedby={extensionError ? "settings-extension-help settings-extension-error" : "settings-extension-help"}
            onChange={event => {
              const value = event.target.value;
              setExtension(value);
              try { props.onDefaultExtension(normalizeExtension(value)); setExtensionError(""); }
              catch (error) { setExtensionError((error as Error).message); }
            }} onBlur={() => { if (!extensionError) setExtension(normalizeExtension(extension)); }} />
        </div>
        <Toggle title="Bookmarks panel" description="Keep your saved passages alongside your notes." checked={props.bookmarks} onChange={props.onBookmarks} />
      </section>
    </div>
    <footer className="settings-footer"><span role="status">{props.storageError ? "Changes apply now, but could not be saved on this device." : "Changes are saved automatically on this device."}</span><button onClick={props.onClose}>Done</button></footer>
  </dialog>;
}
