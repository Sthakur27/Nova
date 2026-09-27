import { Cloud, FolderOpen } from "lucide-react";

export default function FileLocationControls({ root, path, cloud, desktop, busy, onReveal, onOpenDrive, onMoveToCloud }: {
  root: string; path: string; cloud: boolean; desktop: boolean; busy: boolean;
  onReveal: () => void; onOpenDrive: () => void; onMoveToCloud: () => void;
}) {
  const unavailable = !desktop || !root || root === "demo" || !path || path === ".nova";
  const cloudLabel = cloud ? "Open in Google Drive" : "Move to Cloud";
  return <>
    <button className="icon-button toolbar-icon" aria-label="Open in File Location"
      title={root === "demo" ? "Sample notes have no file location" : "Open in File Location"}
      disabled={unavailable} onClick={onReveal}>
      <FolderOpen size={17} aria-hidden="true" />
    </button>
    <button className={`icon-button toolbar-icon${cloud ? "" : " cloud-location-local"}`}
      aria-label={cloudLabel} title={cloudLabel} aria-haspopup={cloud ? undefined : "dialog"}
      disabled={unavailable || busy} onClick={cloud ? onOpenDrive : onMoveToCloud}>
      <Cloud size={17} aria-hidden="true" />
    </button>
  </>;
}
