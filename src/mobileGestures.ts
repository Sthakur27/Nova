import type { PointerEvent as ReactPointerEvent } from "react";

export function dismissNoteKeyboard() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]')) active.blur();
}

export function dismissKeyboardOutsideEditor(event: Pick<ReactPointerEvent<HTMLElement>, "target" | "preventDefault">) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  // Formatting must retain the editor selection; editable descendants position the caret.
  if (target.closest('.format-toolbar, dialog, input, textarea, select, .file-heading, .mobile-file-bar')) return;
  const editable = target.closest('[contenteditable="true"]');
  if (editable && editable !== target) return;
  // A tap on the editable root's empty padding should not put the caret at the end.
  if (editable === target) event.preventDefault();
  dismissNoteKeyboard();
}
