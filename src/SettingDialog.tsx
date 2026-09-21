import { useEffect, useRef } from "react";
import { Settings2, X } from "lucide-react";
import type { SettingConfiguration } from "./settingCommands";

export default function SettingDialog({ configuration, onClose, onOpenSettings, storageError }: {
  configuration: SettingConfiguration;
  onClose: () => void;
  onOpenSettings: () => void;
  storageError: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    element.querySelector("select")?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="setting-dialog-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header className="settings-header">
      <div className="settings-emblem"><Settings2 size={21} /></div>
      <div><h1 id="setting-dialog-title">{configuration.label}</h1><p>Applies across your workspace.</p></div>
      <button className="icon-button" aria-label="Close setting" onClick={onClose}><X size={18} /></button>
    </header>
    <div className="settings-content">
      <div className="settings-row">
        <div><label htmlFor="setting-dialog-value">{configuration.label}</label><p>Changes apply immediately.</p></div>
        <select id="setting-dialog-value" value={configuration.value} onChange={event => configuration.onChange(event.target.value)}>
          {configuration.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
    <footer className="settings-footer">
      <span role="status">{storageError ? "Applied, but could not be saved on this device." : `Current: ${configuration.options.find(option => option.value === configuration.value)?.label}. Saved automatically.`}</span>
      <button onClick={onOpenSettings}>All settings</button>
      <button onClick={onClose}>Done</button>
    </footer>
  </dialog>;
}
