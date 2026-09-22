import { galaxyPerformanceLabels, galaxyPerformanceModes, type GalaxyPerformance } from "./galaxyPerformance";
import { confirmCloudReset } from "./confirmCloudReset";
import AppUpdate from "./AppUpdate";
import type { useAppUpdate } from "./useAppUpdate";
import { FontControl, TextSizeControl, type EditorFont } from "./TypographyControls";
import LineSpacingControl, { type LineSpacing } from "./LineSpacingControl";
import { commonExtensions } from "./fileExtensions";
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
  showHidden?: boolean; onShowHidden?: (value: boolean) => void;
  onResetLocal?: () => Promise<void>; resetDisabled?: boolean;
  updater?: ReturnType<typeof useAppUpdate>;
  onClose: () => void;
  syncConnected?: boolean; onSyncSetup?: () => void;
  onOpenDrive?: () => void; openDriveDisabled?: boolean;
  galaxyPerformance: GalaxyPerformance; onGalaxyPerformance: (value: GalaxyPerformance) => void;
  galaxy: boolean; onGalaxy: (value: boolean) => void;
  tooltips: boolean; onTooltips: (value: boolean) => void;
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
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const resetPending = useRef(false);
  const close = () => { if (!resetPending.current) props.onClose(); };
  async function reset() {
    if (!props.onResetLocal || resetPending.current) return;
    resetPending.current = true;
    try {
      if (!await confirmCloudReset()) return;
      setResetting(true); setResetError("");
      await props.onResetLocal();
    } catch (error) { setResetError(String(error)); }
    finally { resetPending.current = false; setResetting(false); }
  }
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title"
    onCancel={event => { event.preventDefault(); close(); }} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }
    }}>
    <header className="settings-header">
      <div className="settings-emblem"><Settings2 size={21} /></div>
      <div><h1 id="settings-title">Settings</h1><p>Make yourself at home.</p></div>
      <button autoFocus className="icon-button" aria-label="Close settings" onClick={close} disabled={resetting}><X size={18} /></button>
    </header>
    <div className="settings-content" aria-busy={resetting}>
      <fieldset disabled={resetting} style={{border:0, padding:0, margin:0, minWidth:0}}>
      {props.updater && <AppUpdate updater={props.updater} />}
      <section aria-labelledby="settings-appearance"><h2 id="settings-appearance">Appearance</h2>
        {props.onShowHidden && <Toggle title="Show hidden files and folders" description="Show dotfiles and dotfolders in navigation." checked={props.showHidden ?? false} onChange={props.onShowHidden} />}
        <Toggle title="Show tooltips" description="Show helpful hints when hovering over controls." checked={props.tooltips} onChange={props.onTooltips} />
        <Toggle title="Galaxy mode" description="A translucent backdrop with motion and glow around your workspace." checked={props.galaxy} onChange={props.onGalaxy} />
        <div className="settings-row"><div><label htmlFor="settings-galaxy-performance">Galaxy performance</label>
          <p id="settings-galaxy-performance-help">High performance keeps hovered and focused glows moving at up to 60 FPS. Saver uses up to 24 FPS and settles effects when you pause.</p></div>
          <select id="settings-galaxy-performance" value={props.galaxyPerformance} aria-describedby="settings-galaxy-performance-help"
            onChange={event => props.onGalaxyPerformance(event.target.value as GalaxyPerformance)}>
            {galaxyPerformanceModes.map(mode => <option key={mode} value={mode}>{galaxyPerformanceLabels[mode]}</option>)}
          </select>
        </div>
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
        <div className="settings-row"><div><label htmlFor="settings-extension">Default file extension</label><p id="settings-extension-help">Choose the format for new files. Default: .md.</p></div>
          <select id="settings-extension" value={props.defaultExtension} aria-describedby="settings-extension-help"
            onChange={event => props.onDefaultExtension(event.target.value)}>
            {commonExtensions.map(([extension, label]) => <option key={extension} value={extension}>{label} ({extension})</option>)}
            {!commonExtensions.some(([extension]) => extension === props.defaultExtension) &&
              <option value={props.defaultExtension}>Custom ({props.defaultExtension})</option>}
          </select>
        </div>
        <Toggle title="Bookmarks panel" description="Keep your saved passages alongside your notes." checked={props.bookmarks} onChange={props.onBookmarks} />
      </section>
      {props.onResetLocal && <section aria-labelledby="settings-reset"><h2 id="settings-reset">Reset local data</h2>
        <div className="settings-row"><div><label>Start fresh from Google Drive</label><p>Download your Cloud notes again and clear this device’s saved note state.</p></div>
          <button disabled={props.resetDisabled || resetting} onClick={() => void reset()}>{resetting ? "Resetting…" : "Reset from Google Drive…"}</button>
        </div>
        {resetting && <p role="status">Downloading fresh copies from Google Drive. Keep Nova open.</p>}
        {resetError && <p role="alert">{resetError}</p>}
      </section>}
      </fieldset>
    </div>
    <footer className="settings-footer"><span role="status">{props.storageError ? "Changes apply now, but could not be saved on this device." : "Changes are saved automatically on this device."}</span><button onClick={close} disabled={resetting}>Done</button></footer>
  </dialog>;
}
