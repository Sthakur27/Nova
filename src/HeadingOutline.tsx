import { useEffect, useState } from "react";
import type { OutlineHeading } from "./markdownOutline";
import "./headingOutline.css";

export default function HeadingOutline({ text, markdown, hasDocument, onJump }: {
  text: string; markdown: boolean; hasDocument: boolean; onJump: (from: number) => void;
}) {
  const [visible, setVisible] = useState({ text, count: 200 });
  const visibleCount = visible.text === text ? visible.count : 200;
  const [result, setResult] = useState<{ text: string; headings?: OutlineHeading[]; error?: string } | null>(null);
  useEffect(() => {
    if (!markdown || !hasDocument) return;
    let worker: Worker | undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL("./headingOutline.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }: MessageEvent<{ headings?: OutlineHeading[]; error?: string }>) => {
          if (!cancelled) setResult({ text, ...data });
          worker?.terminate();
        };
        worker.onerror = () => {
          if (!cancelled) setResult({ text, error: "Unable to prepare this note’s outline." });
          worker?.terminate();
        };
        worker.postMessage(text);
      } catch {
        if (!cancelled) setResult({ text, error: "Unable to prepare this note’s outline." });
        worker?.terminate();
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); worker?.terminate(); };
  }, [text, markdown, hasDocument]);
  const current = result?.text === text ? result : null;
  const message = !hasDocument ? "Open a note to see its outline." : !markdown ? "Headings are available in Markdown notes."
    : !current ? "Preparing outline…" : current.error ?? (!current.headings?.length ? "No headings in this note yet." : null);
  return <nav className="heading-outline" aria-label="Note outline">
    <h2>Outline</h2>
    {message ? <p className="rail-intro" role="status">{message}</p> : <ol>
      {current?.headings?.slice(0, visibleCount).map(heading => <li key={heading.from}>
        <button style={{ paddingInlineStart: `${8 + (heading.level - 1) * 12}px` }}
          title={`Heading ${heading.level}, line ${heading.line}: ${heading.title}`}
          aria-label={`${heading.title}, heading level ${heading.level}, line ${heading.line}`}
          onClick={() => onJump(heading.from)}>
          <span className="outline-level" aria-hidden="true">H{heading.level}</span>
          <span>{heading.title}</span>
        </button>
      </li>)}
    </ol>}
    {!message && current?.headings && current.headings.length > visibleCount && <button
      onClick={() => setVisible({ text, count: visibleCount + 200 })}>Show more headings ({current.headings.length - visibleCount} remaining)</button>}
  </nav>;
}
