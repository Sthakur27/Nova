import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Markdown, { type TaskToggle } from "./Markdown";
import { pageForLine, type ReadPage } from "./readPages";

export type LargeReadHandle = { jump: (line: number) => void };

export default forwardRef<LargeReadHandle, { text: string; markdown: boolean; controlsContainer: HTMLDivElement | null; onToggleTask?: TaskToggle }>(function LargeRead({ text, markdown, controlsContainer, onToggleTask }, ref) {
  const [result, setResult] = useState<{ text: string; markdown: boolean; pages: ReadPage[] } | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<{ line: number } | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const pages = result?.text === text && result.markdown === markdown ? result.pages : null;

  useEffect(() => {
    setResult(null);
    setError("");
    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL("./readPages.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<{ pages?: ReadPage[]; error?: string }>) => {
        if (data.pages) setResult({ text, markdown, pages: data.pages });
        else setError(data.error || "Unable to prepare this note.");
        worker?.terminate();
      };
      worker.onerror = event => { setError(event.message || "Unable to prepare this note. Reopen Read mode to try again."); worker?.terminate(); };
      worker.postMessage({ text, markdown });
    } catch (error) {
      setError(String(error));
    }
    return () => worker?.terminate();
  }, [text, markdown]);

  useImperativeHandle(ref, () => ({ jump: line => setTarget({ line }) }), []);
  useEffect(() => {
    if (!pages || !target) return;
    const next = pageForLine(pages, target.line);
    if (page !== next) { setPage(next); return; }
    const nodes = Array.from(content.current?.querySelectorAll<HTMLElement>("[data-line]") ?? []);
    const node = nodes.filter(n => Number(n.dataset.line) <= target.line).at(-1) ?? content.current;
    node?.scrollIntoView({ block: "center" });
    node?.classList.add("jump-target");
    const timer = setTimeout(() => node?.classList.remove("jump-target"), 1700);
    return () => { clearTimeout(timer); node?.classList.remove("jump-target"); };
  }, [pages, target, page]);

  if (error) return <p role="alert">Could not render this note: {error} Your text is still available in {markdown ? "Source" : "Edit"} mode.</p>;
  if (!pages) return <p role="status">Preparing your note for reading…</p>;
  const active = pages[Math.min(page, pages.length - 1)];
  const changePage = (next: number) => {
    setTarget(null);
    setPage(next);
    content.current?.closest(".read-pane")?.scrollTo({ top: 0 });
  };
  return <>
    {controlsContainer && createPortal(<nav className="read-pagination" aria-label="Reading pages">
      <button aria-label="Previous page" title="Previous page" disabled={page === 0} onClick={() => changePage(page - 1)}><ChevronLeft size={14} aria-hidden="true" /></button>
      <label>Page <input aria-label="Reading page" type="number" min={1} max={pages.length} value={page + 1} onChange={event => {
        const next = Number(event.target.value);
        if (Number.isInteger(next) && next >= 1 && next <= pages.length) changePage(next - 1);
      }} /> of {pages.length}</label>
      <button aria-label="Next page" title="Next page" disabled={page >= pages.length - 1} onClick={() => changePage(page + 1)}><ChevronRight size={14} aria-hidden="true" /></button>
    </nav>, controlsContainer)}
    <div ref={content} className={markdown ? undefined : "plain-preview"}>
      <Markdown tree={active.tree} onToggleTask={onToggleTask} />
    </div>
  </>;
});
