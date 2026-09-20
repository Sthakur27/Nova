import { setSyncChoice, syncIncluded, type SyncChoice, type SyncPolicy } from "./syncPolicy";

export function stopsSync(policy: SyncPolicy | undefined, path: string, choice: SyncChoice, files: string[]): boolean {
  const next = setSyncChoice(policy, path, choice);
  return [path, ...files].some(file => syncIncluded(policy, file) && !syncIncluded(next, file));
}

/** Shared by the explorer, tab settings, folder defaults, and disconnect. */
export function confirmSyncOff(name: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "settings-dialog sync-off-dialog";
    dialog.setAttribute("aria-labelledby", "sync-off-title");
    dialog.setAttribute("aria-describedby", "sync-off-description");
    const title = document.createElement("h2");
    title.id = "sync-off-title";
    title.textContent = `Turn off sync for ${name}?`;
    const description = document.createElement("p");
    description.id = "sync-off-description";
    description.textContent = "Future changes from this device will stay local, and changes from Drive will stop downloading. Existing files in Google Drive and on this device will not be deleted. An upload already in progress may still finish. Other devices keep their own sync settings.";
    const actions = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.textContent = "Keep syncing";
    const stop = document.createElement("button");
    stop.textContent = "Turn off sync";
    let finished = false;
    const finish = (value: boolean) => {
      if (finished) return;
      finished = true;
      dialog.close(); dialog.remove(); resolve(value);
    };
    cancel.onclick = () => finish(false);
    stop.onclick = () => finish(true);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    actions.append(cancel, stop);
    dialog.append(title, description, actions);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
