import type { Bookmark } from "./model";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ReadChunk from "./ReadChunk";
import Markdown, { type TaskToggle } from "./Markdown";
import { pageForLine, type ReadPage } from "./readPages";

export type LargeReadHandle = { jump: (line: number) => void };

export default forwardRef<LargeReadHandle, { bookmarks?: Bookmark[]; text: string; markdown: boolean; layout: "continuous" | "pages"; controlsContainer: HTMLDivElement | null; onToggleTask?: TaskToggle }>(function LargeRead({ bookmarks, text, markdown, layout, controlsContainer, onToggleTask }, ref) {
  const [result, setResult] = useState<{ text: string; markdown: boolean; pages: ReadPage[] } | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<{ line: number } | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const previousLayout = useRef(layout);
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

  const jumpPage = layout === "pages" ? page : 0;
  useImperativeHandle(ref, () => ({ jump: line => setTarget({ line }) }), []);
  useEffect(() => {
    if (!pages || !target) return;
    const next = pageForLine(pages, target.line);
    setPage(next);
    if (layout === "pages" && jumpPage !== next) return;
    const scope = layout === "continuous" ? content.current?.querySelector(`[data-read-chunk="${next}"]`) : content.current;
    const nodes = Array.from(scope?.querySelectorAll<HTMLElement>("[data-line]") ?? []);
    const node = nodes.filter(n => Number(n.dataset.line) <= target.line).at(-1) ?? scope;
    node?.scrollIntoView({ block: "center", behavior: "instant" });
    node?.classList.add("jump-target");
    const timer = setTimeout(() => { node?.classList.remove("jump-target"); setTarget(null); }, 1700);
    return () => { clearTimeout(timer); node?.classList.remove("jump-target"); };
  }, [pages, target, jumpPage, layout]);

  useEffect(() => {
    if (previousLayout.current === layout) return;
    previousLayout.current = layout;
    if (pages) setTarget({ line: pages[Math.min(page, pages.length - 1)].line });
  }, [layout, pages, page]);

  useEffect(() => {
    const pane = content.current?.closest(".read-pane");
    if (layout !== "continuous" || !pane || !pages) return;
    let frame = 0;
    const track = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = pane.getBoundingClientRect().top;
        const chunks = content.current?.querySelectorAll<HTMLElement>("[data-read-chunk]");
        for (const chunk of chunks ?? []) {
          if (chunk.getBoundingClientRect().bottom > top + 1) {
            setPage(Number(chunk.dataset.readChunk));
            break;
          }
        }
      });
    };
    pane.addEventListener("scroll", track, { passive: true });
    return () => { cancelAnimationFrame(frame); pane.removeEventListener("scroll", track); };
  }, [layout, pages]);

  if (error) return <p role="alert">Could not render this note: {error} Your text is still available in {markdown ? "Source" : "Edit"} mode.</p>;
  if (!pages) return <p role="status">Preparing your note for reading…</p>;
  const currentPage = Math.min(page, pages.length - 1);
  const active = pages[currentPage];
  const changePage = (next: number) => {
    setTarget(null);
    setPage(next);
    content.current?.closest(".read-pane")?.scrollTo({ top: 0 });
  };
  return <>
    {layout === "pages" && controlsContainer && createPortal(<nav className="read-pagination" aria-label="Reading pages">
      <button aria-label="Previous page" title="Previous page" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={14} aria-hidden="true" /></button>
      <label>Page <input aria-label="Reading page" type="number" min={1} max={pages.length} value={currentPage + 1} onChange={event => {
        const next = Number(event.target.value);
        if (Number.isInteger(next) && next >= 1 && next <= pages.length) changePage(next - 1);
      }} /> of {pages.length}</label>
      <button aria-label="Next page" title="Next page" disabled={currentPage >= pages.length - 1} onClick={() => changePage(currentPage + 1)}><ChevronRight size={14} aria-hidden="true" /></button>
    </nav>, controlsContainer)}
    <div ref={content} className={markdown ? undefined : "plain-preview"}>
      {layout === "pages" ? <Markdown bookmarks={bookmarks} tree={active.tree} onToggleTask={onToggleTask} />
        : pages.map((chunk, index) => <ReadChunk bookmarks={bookmarks} key={index} page={chunk} index={index}
          forced={target != null && pageForLine(pages, target.line) === index} onToggleTask={onToggleTask} />)}
    </div>
  </>;
});
