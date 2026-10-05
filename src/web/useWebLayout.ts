import { useEffect, useState } from "react";

export default function useWebLayout() {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!mobile || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const resize = () => document.documentElement.style.setProperty("--web-viewport-height", `${viewport.height}px`);
    resize(); viewport.addEventListener("resize", resize);
    return () => { viewport.removeEventListener("resize", resize); document.documentElement.style.removeProperty("--web-viewport-height"); };
  }, [mobile]);
  useEffect(() => {
    if (!focused) return;
    const escape = (event: KeyboardEvent) => {
      // An open modal or editor search owns its first Escape.
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open], .cm-search, .formatted-find")) return;
      event.preventDefault(); setFocused(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [focused]);
  return { mobile, focused, setFocused };
}
