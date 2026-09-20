export function confirmCloudReset(): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "settings-dialog sync-off-dialog";
    dialog.setAttribute("aria-labelledby", "cloud-reset-title");
    dialog.setAttribute("aria-describedby", "cloud-reset-description");
    const title = document.createElement("h2");
    title.id = "cloud-reset-title";
    title.textContent = "Reset from Google Drive?";
    const description = document.createElement("p");
    description.id = "cloud-reset-description";
    description.textContent = "Replace all notes on this device with fresh copies from your connected Google Drive account? Changes not yet uploaded, recovery drafts, bookmarks, stars, and open tabs will be discarded. Notes deleted only on this device will return if they still exist in Drive. Google Drive files will not be changed. Your sign-in and appearance settings will be kept.";
    const actions = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const stop = document.createElement("button");
    stop.textContent = "Reset from Google Drive";
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
