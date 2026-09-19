/** The folded N used by the supernova button and empty state. */
export default function NovaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path opacity=".65" d="M5 26V6h6v20zM21 26V6h6v20z" />
      <path d="M5 6h6l16 20h-6z" />
    </svg>
  );
}
