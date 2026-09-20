import { useEffect, useLayoutEffect, useState } from "react";
import { mobile } from "./platform";

export function useCompactLayout() {
  const [compact, setCompact] = useState(() => mobile || window.matchMedia("(max-width: 800px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setCompact(mobile || media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (!compact || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let fullHeight = window.innerHeight;
    let width = window.innerWidth;
    const update = () => {
      // Ignore pinch zoom: its smaller viewport is not a software keyboard.
      if (viewport.scale !== 1) return;
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        fullHeight = window.innerHeight;
      }
      fullHeight = Math.max(fullHeight, window.innerHeight, viewport.height);
      const focused = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      const covered = fullHeight - viewport.height;
      // iOS can overlay only its input accessory tray without resizing.
      const keyboard = !!focused || covered > 100;
      root.dataset.mobileKeyboard = String(keyboard);
      root.style.setProperty("--mobile-height", `${viewport.height}px`);
      // Keep the extra scroll canvas fixed while the keyboard changes height.
      // Otherwise the text itself moves when its padding is recalculated.
      if (!keyboard) {
        const pane = document.querySelector<HTMLElement>(".document-area");
        if (pane?.clientHeight) root.style.setProperty("--mobile-scroll-space", `${Math.max(0, pane.clientHeight - 160)}px`);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    const pane = document.querySelector(".document-area");
    if (pane) observer.observe(pane);
    viewport.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      observer.disconnect();
      viewport.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete root.dataset.mobileKeyboard;
      root.style.removeProperty("--mobile-height");
      root.style.removeProperty("--mobile-scroll-space");
    };
  }, [compact]);
  return compact;
}
