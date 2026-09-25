import { Maximize2, Minimize2 } from "lucide-react";
import GalaxyMark from "./GalaxyMark";

export default function MobileViewControls({ focused, galaxy, onFocus, onGalaxy }: {
  focused: boolean; galaxy: boolean;
  onFocus: (focused: boolean) => void; onGalaxy: () => void;
}) {
  return <div className="mobile-view-controls" role="group" aria-label="Note view">
    <button className="icon-button" aria-label="Galaxy mode" aria-pressed={galaxy}
      title={galaxy ? "Turn Galaxy mode off" : "Turn Galaxy mode on"} onClick={onGalaxy}><GalaxyMark /></button>
    <button className="icon-button" aria-label={focused ? "Exit focus mode" : "Enter focus mode"}
      aria-pressed={focused} title={focused ? "Exit focus mode" : "Focus mode"} onClick={() => onFocus(!focused)}>
      {focused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
    </button>
  </div>;
}
