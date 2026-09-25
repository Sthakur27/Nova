import { useState, type ReactNode } from "react";

export default function FocusTabs({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return <div className="focus-tabs" data-enabled={enabled} data-open={enabled && (hovered || focused)}
    tabIndex={enabled ? 0 : undefined} role={enabled ? "region" : undefined}
    aria-label={enabled ? "Show open notes" : undefined}
    onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    {children}
  </div>;
}
