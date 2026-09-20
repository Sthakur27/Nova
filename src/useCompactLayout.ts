import { useEffect, useState } from "react";
import { mobile } from "./platform";

export function useCompactLayout() {
  const [compact, setCompact] = useState(() => mobile || window.matchMedia("(max-width: 800px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setCompact(mobile || media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!compact || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      // Follow the software keyboard without disabling pinch zoom.
      if (viewport.scale === 1) document.documentElement.style.setProperty("--mobile-height", `${viewport.height}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--mobile-height");
    };
  }, [compact]);
  return compact;
}
