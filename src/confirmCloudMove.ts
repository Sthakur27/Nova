export function confirmCloudMove(path: string, space: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "settings-dialog sync-off-dialog";
    dialog.setAttribute("aria-label", "Move to Cloud");
    const title = document.createElement("h2");
    title.textContent = `Move ${path} to Cloud?`;
    const description = document.createElement("p");
    description.textContent = `This note will live in ${space}, autosave, and appear on your connected devices. Nova removes the original local file only after saving the Cloud copy on this device. Uploading may take longer if you are offline.`;
    const actions = document.createElement("div");
    const cancel = document.createElement("button"); cancel.textContent = "Cancel";
    const move = document.createElement("button"); move.textContent = "Move to Cloud";
    const finish = (value: boolean) => { dialog.close(); dialog.remove(); resolve(value); };
    cancel.onclick = () => finish(false); move.onclick = () => finish(true);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    actions.append(cancel, move); dialog.append(title, description, actions);
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}
