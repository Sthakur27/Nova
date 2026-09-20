import { FontControl, TextSizeControl, type EditorFont } from "./TypographyControls";
import LineSpacingControl, { type LineSpacing } from "./LineSpacingControl";
import { normalizeExtension } from "./fileExtensions";
import { useEffect, useId, useRef, useState } from "react";
import TextWidthControl, { type TextWidth } from "./TextWidthControl";
import { Check, ExternalLink, Settings2, X } from "lucide-react";

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
  syncConnected?: boolean; onSyncSetup?: () => void;
  onOpenDrive?: () => void; openDriveDisabled?: boolean;
  galaxy: boolean; onGalaxy: (value: boolean) => void;
  lineHighlight: boolean; onLineHighlight: (value: boolean) => void;
  lineNumbers: boolean; onLineNumbers: (value: boolean) => void;
  wordWrap: boolean; onWordWrap: (value: boolean) => void;
  spellcheck: boolean; onSpellcheck: (value: boolean) => void;
  bookmarks: boolean; onBookmarks: (value: boolean) => void;
  editorFont: EditorFont; onEditorFont: (value: EditorFont) => void;
  fontSize: string; onFontSize: (value: string) => void;
  lineSpacing: LineSpacing; onLineSpacing: (value: LineSpacing) => void;
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
        <Toggle title="Galaxy mode" description="A translucent backdrop with motion and glow around your workspace." checked={props.galaxy} onChange={props.onGalaxy} />
      </section>
      <section aria-labelledby="settings-editor"><h2 id="settings-editor">Editor</h2>
        <div className="settings-row"><div><label htmlFor="settings-font">Font</label><p>Choose the text font. Default keeps the original typography.</p></div>
          <FontControl id="settings-font" value={props.editorFont} onChange={props.onEditorFont} />
        </div>
        <div className="settings-row"><div><label htmlFor="settings-font-size">Text size</label><p>Adjust the text in Edit, Source, and Read modes.</p></div>
          <TextSizeControl id="settings-font-size" value={props.fontSize} onChange={props.onFontSize} />
        </div>
        <div className="settings-row"><div><label htmlFor="settings-text-width">Text width</label><p>Set the text area in Edit, Source, and Read modes.</p></div>
          <TextWidthControl id="settings-text-width" value={props.textWidth} onChange={props.onTextWidth} />
        </div>
        <div className="settings-row"><div><label htmlFor="settings-line-spacing">Line spacing</label><p>Adjust the space between lines in Edit, Source, and Read modes.</p></div>
          <LineSpacingControl id="settings-line-spacing" value={props.lineSpacing} onChange={props.onLineSpacing} />
        </div>
        <Toggle title="Line numbers" description="Find your place in longer notes." checked={props.lineNumbers} onChange={props.onLineNumbers} />
        <Toggle title="Line highlight" description="Highlight your current line while editing or reading." checked={props.lineHighlight} onChange={props.onLineHighlight} />
        <Toggle title="Word wrap" description="Keep long lines within the editor width." checked={props.wordWrap} onChange={props.onWordWrap} />
        <Toggle title="Spellcheck" description="Use your system’s spelling suggestions as you type." checked={props.spellcheck} onChange={props.onSpellcheck} />
      </section>
      {props.onSyncSetup && <section aria-labelledby="settings-sync"><h2 id="settings-sync">Google Drive</h2>
        <div className="settings-row"><div><label>Optional sync</label><p>{props.syncConnected ? "Manage your connected account and file choices." : "Connect an account to enable sync controls in your workspace."}</p></div>
          <button onClick={props.onSyncSetup}>{props.syncConnected ? "Manage sync" : "Set up sync"}</button>
        </div>
        {props.syncConnected && props.onOpenDrive && <div className="settings-row">
          <div><label>Workspace folder</label><p>View this workspace’s files in Google Drive.</p></div>
          <button className="settings-drive-link" disabled={props.openDriveDisabled} onClick={props.onOpenDrive}>
            <ExternalLink size={15} aria-hidden="true" />Open in Drive
          </button>
        </div>}
      </section>}
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
