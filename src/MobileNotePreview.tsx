import { lazy, Suspense, useEffect, useState } from "react";
import { ChevronDown, FileText, Pencil, Plus } from "lucide-react";
import Editor, { type EditorSnapshot } from "./Editor";
import FileTitle from "./FileTitle";
import { supportsDocumentView } from "./documentLimits";
import type { EditorMode } from "./folders";
import type { DocumentData } from "./model";
import type { NoteTab } from "./tabs";
const LargeRead = lazy(() => import("./LargeRead"));
const noop = () => {};
export type MobilePreview = { note: DocumentData; snapshot?: EditorSnapshot; mode: EditorMode };

/** Inert visual copy, never registered as an editor or allowed to save a draft. */
export default function MobileNotePreview({ tab, count, load, showLineNumbers, showLineHighlight, wordWrap, readingLayout }: {
  tab: NoteTab; count: number; load: (tab: NoteTab) => Promise<MobilePreview>;
  showLineNumbers: boolean; showLineHighlight: boolean; wordWrap: boolean;
  readingLayout: "continuous" | "pages";
}) {
  const [loaded, setLoaded] = useState<MobilePreview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setFailed(false);
    void load(tab).then(value => { if (!cancelled) setLoaded(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [tab.root, tab.path, load]);
  const markdown = /\.(md|markdown|mdx)$/i.test(tab.path);
  const rich = loaded && markdown && supportsDocumentView(loaded.note.text.length) && !(loaded.mode === "read" && readingLayout === "pages");
  return <div className="pane-content note-preview" data-preview-path={tab.path}>
    <div className="mobile-file-bar">
      <div className="mobile-file-picker"><FileText size={17} /><span>{tab.path.split("/").at(-1)}</span><span className="mobile-file-count">{count}</span><ChevronDown size={16} /></div>
      <span className="icon-button"><Pencil size={17} /></span>
      <span className="mobile-new-note"><Plus size={19} /><span>New</span></span>
    </div>
    <div className="document-area">
      {!loaded ? <div className="note-preview-placeholder"><FileTitle path={tab.path} /><p>{failed ? "Preview unavailable" : "Opening note…"}</p></div>
        : loaded.mode === "read" && !rich ? <div className="read-pane"><article className="prose"><FileTitle path={tab.path} />
          <Suspense fallback={<p>Opening note…</p>}><LargeRead controlsContainer={null} text={loaded.note.text} markdown={markdown} bookmarks={loaded.note.bookmarks} layout={readingLayout} onToggleTask={noop} /></Suspense>
        </article></div>
        : <div className="write-pane"><Editor key={`${tab.path}:${loaded.note.revision}`} initial={loaded.note.text} snapshot={loaded.snapshot}
          filePath={tab.path} bookmarks={loaded.note.bookmarks} isMarkdown={markdown}
          documentMode={rich && loaded.mode !== "source" ? "read" : undefined}
          onChange={noop} onBookmarks={noop} onCursor={noop} onBookmark={noop} onSave={noop}
          showLineNumbers={showLineNumbers} showLineHighlight={showLineHighlight} wordWrap={wordWrap} spellcheck={false} /></div>}
    </div>
  </div>;
}
