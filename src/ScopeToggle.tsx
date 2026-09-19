import type { SearchScope } from "./currentSearch";

export default function ScopeToggle({ scope, onChange, label, currentLabel = "Current tab", allLabel = "Everywhere", disabled = false }: {
  scope: SearchScope;
  onChange: (scope: SearchScope) => void;
  label: string;
  currentLabel?: string;
  allLabel?: string;
  disabled?: boolean;
}) {
  return <div className="scope-toggle" role="group" aria-label={label}>
    <button type="button" aria-pressed={scope === "current"} disabled={disabled} onClick={() => onChange("current")}>{currentLabel}</button>
    <button type="button" aria-pressed={scope === "everywhere"} onClick={() => onChange("everywhere")}>{allLabel}</button>
  </div>;
}
