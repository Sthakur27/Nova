export function confirmCloudDeletion(path: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "settings-dialog sync-off-dialog";
    dialog.setAttribute("aria-labelledby", "cloud-deletion-title");
    dialog.setAttribute("aria-describedby", "cloud-deletion-description");
    const title = document.createElement("h2");
    title.id = "cloud-deletion-title";
    title.textContent = "Delete the local copy?";
    const description = document.createElement("p");
    description.id = "cloud-deletion-description";
    description.textContent = `Acknowledge the Drive deletion and permanently delete “${path}” from this device, including its bookmarks and star? This cannot be undone in Nova. A copy moved elsewhere in Drive or still in Drive Trash will be left there.`;
    const actions = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const stop = document.createElement("button");
    stop.textContent = "Delete local copy";
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
