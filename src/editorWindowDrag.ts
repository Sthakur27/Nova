import type { PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktop } from "./platform";

const controls = 'button, input, textarea, select, a, label, summary, [role="button"], [role="tab"], [role="slider"], [role="separator"], [role="menu"], [role="listbox"], [role="dialog"], .view-options-panel, [draggable="true"], [data-window-no-drag]';

/** Move the window from editor and toolbar backgrounds, preserving text and controls. */
export function startEditorWindowDrag(event: PointerEvent<HTMLDivElement>) {
  if (!desktop || event.defaultPrevented || event.pointerType !== "mouse" ||
      event.button !== 0 || !event.isPrimary || event.detail > 1 ||
      event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (!(target instanceof Element) || target.closest(controls)) return;
  // CodeMirror's content root includes the large blank areas above/below the
  // document. Its lines (including empty lines) must still support selection.
  if (target.closest('.cm-line, .cm-gutters, .cm-panel, .cm-tooltip, .document-content, .file-heading')) return;
  const editable = target.closest('[contenteditable]');
  if (editable && !(editable === target && editable.classList.contains("cm-content"))) return;

  // A scrollbar press targets the scrolling element, too. Exclude its native
  // scrollbar strip, including left-hand scrollbars in RTL configurations.
  for (let element: Element | null = target; element; element = element.parentElement) {
    if (element instanceof HTMLElement &&
        (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)) {
      const rect = element.getBoundingClientRect();
      const left = rect.left + element.clientLeft;
      const top = rect.top + element.clientTop;
      if (event.clientX < left || event.clientX >= left + element.clientWidth ||
          event.clientY < top || event.clientY >= top + element.clientHeight) return;
    }
    if (element === event.currentTarget) break;
  }

  // Start the native gesture on the initial press, as required on macOS. The
  // OS handles movement; no grab cursor or CSS drag region is necessary.
  event.preventDefault();
  event.stopPropagation();
  void getCurrentWindow().startDragging().catch(error => {
    console.warn("Could not drag the editor window", error);
  });
}
