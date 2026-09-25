import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from "react";

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

export function fileSwipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 60 && Math.abs(dy) <= 24 ? (dx < 0 ? 1 : -1) : 0;
}

export function canStartFileSwipe(event: ReactTouchEvent<HTMLElement>) {
  if (event.touches.length !== 1 || !window.getSelection()?.isCollapsed) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest('button, input, textarea, select, a, .file-heading')) return false;
  // Let tables and code blocks own their horizontal scrolling.
  for (let node: HTMLElement | null = target; node && node !== event.currentTarget; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowX;
    if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(overflow)) return false;
  }
  return true;
}
