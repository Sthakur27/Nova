import type { MouseEvent as ReactMouseEvent } from "react";

export function dismissNoteKeyboard() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]')) active.blur();
}

export function dismissKeyboardOutsideEditor(event: Pick<ReactMouseEvent<HTMLElement>, "target" | "preventDefault">) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  // Only text entry and formatting controls keep the keyboard. Exempting
  // whole dialogs or file bars leaves it open when tapping their backgrounds
  // or navigation actions. Do not cancel those actions while dismissing.
  if (target.closest('input, textarea, select, label, .format-toolbar button')) return;
  const editable = target.closest('[contenteditable="true"]');
  if (editable && editable !== target) return;
  // A tap on the editable root's empty padding should not put the caret at the end.
  if (editable === target) event.preventDefault();
  dismissNoteKeyboard();
}
