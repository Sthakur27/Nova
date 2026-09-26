import { useEffect, useState } from "react";

type Background = "on" | "off" | "frosted";
const labels = { on: "Translucent", off: "Black", frosted: "Frosted" };

/** Capture before rich-editor formatting or terminal bindings consume these keys. */
export function useAppearanceShortcuts({ enabled, mac, supportsFrosted, background, frosted,
  onBackground, onFrosted, onGalaxy }: {
  enabled: boolean; mac: boolean; supportsFrosted: boolean; background: Background; frosted: boolean;
  onBackground: (value: Background) => void; onFrosted: (value: boolean) => void; onGalaxy: (value: boolean) => void;
}) {
  const [feedback, setFeedback] = useState<{ text: string } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    if (!enabled) return;
    const key = (event: KeyboardEvent) => {
      const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const action = event.key.toLowerCase();
      if (!modifier || event.altKey || event.shiftKey || event.isComposing || event.defaultPrevented
        || (action !== "e" && !(action === "l" && supportsFrosted))
        || document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      onGalaxy(true);
      if (action === "e") {
        const modes: Background[] = supportsFrosted ? ["on", "off", "frosted"] : ["on", "off"];
        const current = !supportsFrosted && background === "frosted" ? "off" : background;
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        onBackground(next);
        setFeedback({ text: `Editor: ${labels[next]}` });
      } else {
        onFrosted(!frosted);
        setFeedback({ text: `Panels: ${frosted ? "Black" : "Frosted"}` });
      }
    };
    window.addEventListener("keydown", key, { capture: true });
    return () => window.removeEventListener("keydown", key, { capture: true });
  }, [enabled, mac, supportsFrosted, background, frosted, onBackground, onFrosted, onGalaxy]);
  return feedback?.text;
}
