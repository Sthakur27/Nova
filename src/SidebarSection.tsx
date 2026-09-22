import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePreference } from "./preferences";
import NovaMark from "./NovaMark";

export default function SidebarSection({ edge, label, compact, children, cornerControls }: {
  edge: "top" | "bottom";
  label: string;
  compact: boolean;
  children: ReactNode | ((toggle: ReactNode) => ReactNode);
  cornerControls?: ReactNode;
}) {
  const [expanded, setExpanded] = usePreference<boolean>(`navigation-${edge}-expanded`, true);
  const id = useId();
  const open = compact || expanded;
  const action = `${open ? "Collapse" : "Expand"} ${label}`;
  const pointsUp = edge === "top" ? open : !open;
  const button = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current) {
      button.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [open]);
  const brand = edge === "top" && open;
  const toggle = compact ? <span className="brand-emblem"><NovaMark className="brand-symbol" /></span> :
    <button ref={button} className={brand ? "brand-emblem brand-collapse" : "sidebar-section-toggle"}
      aria-label={action} aria-expanded={open} aria-controls={id}
      title={brand ? "Hide header" : undefined} aria-describedby={brand ? undefined : `${id}-tooltip`}
      onClick={() => { restoreFocus.current = true; setExpanded(!expanded); }}>
      {brand && <NovaMark className="brand-symbol" />}
      {pointsUp ? <ChevronUp className={brand ? "brand-collapse-chevron" : undefined} size={brand ? 18 : 12} /> : <ChevronDown size={12} />}
      {!brand && <span className="focus-tooltip" id={`${id}-tooltip`} role="tooltip">{action}</span>}
    </button>;

  return <div className="sidebar-section" data-edge={edge} data-expanded={open}>
    <div id={id} hidden={!open}>{typeof children === "function" ? children(open ? toggle : null) : children}</div>
    <div className={edge === "bottom" ? "sidebar-corner-controls" : "sidebar-section-corner"}>
      {!compact && (edge === "bottom" || !open) && toggle}
      {open && cornerControls}
    </div>
  </div>;
}
