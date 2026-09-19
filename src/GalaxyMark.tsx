export default function GalaxyMark({ className, circled = false }: { className?: string; circled?: boolean }) {
  return (
    <svg className={className} width="24" height="24" viewBox={circled ? "-3 -3 30 30" : "0 0 24 24"} fill="none" aria-hidden="true">
      {circled && <circle cx="12" cy="12" r="14" stroke="currentColor" strokeWidth="1" />}
      <g transform="rotate(-30 12 12)" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <ellipse cx="12" cy="12" rx="9" ry="4.5" opacity=".4" />
        <path d="M3 12c0-3 5-5 9-3 5 2 2 6-2 5-3-.7-2-3 0-3M21 12c0 3-5 5-9 3-5-2-2-6 2-5 3 .7 2 3 0 3" />
      </g>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}
