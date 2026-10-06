import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./platform";

function linkAt(root: HTMLElement, target: EventTarget | null) {
  const link = target instanceof Element ? target.closest("a[href]") : null;
  const href = link?.getAttribute("href");
  return link && root.contains(link) && href && /^(https?:|mailto:)/i.test(href) ? href : null;
}

function openLink(href: string) {
  if (desktop) {
    void invoke("open_external_link", { url: href }).catch(error => window.alert(String(error)));
  } else {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

/** Keep link navigation outside the document transaction/undo history. */
export function installEditorLinks(root: HTMLElement) {
  const lifetime = new AbortController();
  let closeMenu = () => {};
  root.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || !root.contains(link) || event.button !== 0) return;
    event.preventDefault();
    const href = linkAt(root, event.target);
    if (!href) return;
    // Shift-click and dragging across a link still select editable text.
    if (event.shiftKey || (window.getSelection()?.toString() && !event.metaKey && !event.ctrlKey)) return;
    openLink(href);
  }, { signal: lifetime.signal });
  root.addEventListener("contextmenu", event => {
    closeMenu();
    const href = linkAt(root, event.target);
    if (!href) return;
    event.preventDefault();
    const menu = document.createElement("div");
    menu.className = "file-context-menu editor-link-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Link actions");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Open link";
    button.title = href;
    button.setAttribute("role", "menuitem");
    menu.append(button);
    document.body.append(menu);
    const rect = (event.target as Element).getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX || rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY || rect.bottom, window.innerHeight - menu.offsetHeight - 8))}px`;
    const listeners = new AbortController();
    const previousFocus = document.activeElement;
    closeMenu = () => {
      listeners.abort();
      const restoreFocus = menu.contains(document.activeElement);
      menu.remove();
      closeMenu = () => {};
      if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
    button.addEventListener("click", () => { closeMenu(); openLink(href); });
    document.addEventListener("pointerdown", e => { if (!menu.contains(e.target as Node)) closeMenu(); }, { capture: true, signal: listeners.signal });
    menu.addEventListener("keydown", e => {
      if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); closeMenu(); }
    });
    button.focus({ preventScroll: true });
    window.addEventListener("blur", () => closeMenu(), { signal: listeners.signal });
    window.addEventListener("resize", () => closeMenu(), { signal: listeners.signal });
    document.addEventListener("scroll", () => closeMenu(), { capture: true, signal: listeners.signal });
  }, { signal: lifetime.signal });
  return () => { closeMenu(); lifetime.abort(); };
}
