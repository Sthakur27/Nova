import { useId, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePreference } from "./preferences";

export default function SidebarSection({ edge, label, compact, children }: {
  edge: "top" | "bottom";
  label: string;
  compact: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = usePreference<boolean>(`navigation-${edge}-expanded`, true);
  const id = useId();
  const open = compact || expanded;
  const action = `${open ? "Collapse" : "Expand"} ${label}`;
  const pointsUp = edge === "top" ? open : !open;

  return <div className="sidebar-section" data-edge={edge} data-expanded={open}>
    <div id={id} hidden={!open}>{children}</div>
    {!compact && <div className="panel-toggle-zone sidebar-section-toggle" data-expanded={open}>
      <button className="panel-toggle" aria-label={action} aria-expanded={open} aria-controls={id}
        aria-describedby={`${id}-tooltip`} onClick={() => setExpanded(!expanded)}>
        {pointsUp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        <span className="focus-tooltip" id={`${id}-tooltip`} role="tooltip">{action}</span>
      </button>
    </div>}
  </div>;
}
