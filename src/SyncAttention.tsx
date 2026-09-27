import { AlertCircle, ArrowRight } from "lucide-react";

export default function SyncAttention({ error, onReview }: { error?: string; onReview: () => void }) {
  if (!error) return null;
  return <button className="sync-attention" onClick={onReview} title={error}
    aria-label="Sync needs attention. Review sync issues">
    <AlertCircle size={13} aria-hidden="true"/>
    <span>Sync needs attention · Review</span>
    <ArrowRight size={12} aria-hidden="true"/>
  </button>;
}
