import { Blend, PanelsTopLeft } from "lucide-react";

type Background = "on" | "off" | "frosted";
export default function SidebarAppearance({ background, backgrounds, labels, onBackground, frosted, onFrosted, supportsFrosted }: {
  background: Background; backgrounds: readonly Background[]; labels: Record<Background, string>;
  onBackground: (value: Background) => void; frosted: boolean; onFrosted: (value: boolean) => void; supportsFrosted: boolean;
}) {
  return <>
    {supportsFrosted && <button className="sidebar-action" aria-label="Frosted panels" aria-pressed={frosted}
      onClick={() => onFrosted(!frosted)}>
      <PanelsTopLeft size={15} aria-hidden="true" />
    </button>}
    <button className="sidebar-action" aria-label={`Editor background: ${labels[background]}`}
      onClick={() => onBackground(backgrounds[(backgrounds.indexOf(background) + 1) % backgrounds.length])}>
      <Blend size={15} aria-hidden="true" />
    </button>
  </>;
}
