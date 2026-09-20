import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./platform";

export function useBackgroundBlur(
  galaxy: boolean,
  center: boolean,
  panes: boolean,
  layout: { compact: boolean; mobileView: string; navigation: boolean; rail: boolean; focusMode: boolean; topBars: boolean; statusBar: boolean; terminalStarted: boolean; editorLayout?: string },
  onError: (message: string) => void,
) {
  const { compact, mobileView, navigation, rail, focusMode, topBars, statusBar, terminalStarted, editorLayout } = layout;
  useEffect(() => {
    if (!desktop) return;
    const preference = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const elements = [...document.querySelectorAll<HTMLElement>(".document-area, .sidebar, .bookmark-rail, .top-bars, .editor-group .note-tabs, .terminal-panel, .status-bar")];
    let frame = 0;
    let disposed = false;
    const sync = () => {
      const regions = galaxy && !preference.matches ? elements.flatMap(element => {
        if (!(element.matches(".document-area") ? center : panes)) return [];
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return [];
        // Normalized coordinates also account for webview zoom and display scale.
        return [{ x: rect.x / window.innerWidth, y: rect.y / window.innerHeight,
          width: rect.width / window.innerWidth, height: rect.height / window.innerHeight }];
      }) : [];
      void invoke("set_background_blur", { regions }).catch(error => {
        if (!disposed) onError(`Unable to change background blur: ${String(error)}`);
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const observer = new ResizeObserver(schedule);
    elements.forEach(element => observer.observe(element));
    window.addEventListener("resize", schedule);
    preference.addEventListener("change", schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      preference.removeEventListener("change", schedule);
    };
  }, [galaxy, center, panes, compact, mobileView, navigation, rail, focusMode, topBars, statusBar, terminalStarted, editorLayout, onError]);
}
