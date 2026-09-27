import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, History, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import welcome from "../docs/welcome.md?raw";
import changelog from "../CHANGELOG.md?raw";
import "./builtinDocs.css";

const pages = {
  welcome: { title: "Welcome to Nova", text: welcome, icon: BookOpen },
  changelog: { title: "Changelog", text: changelog, icon: History },
};
type Page = keyof typeof pages;

function DocumentViewer({ initialPage, onClose }: { initialPage: Page; onClose: () => void }) {
  const [page, setPage] = useState(initialPage);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    title.current?.focus();
    return () => { element.close(); previous?.focus(); };
  }, []);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [page]);
  return createPortal(<dialog ref={dialog} className="settings-dialog builtin-doc-dialog" aria-labelledby={id}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={event => event.stopPropagation()}>
    <header className="settings-header">
      <div><h1 id={id} ref={title} tabIndex={-1}>{pages[page].title}</h1><p>Built into Nova · Available offline</p></div>
      <button className="icon-button" aria-label="Close built-in documents" onClick={onClose}><X size={18} /></button>
    </header>
    <nav className="builtin-doc-tabs" aria-label="Built-in documents">
      {(Object.keys(pages) as Page[]).map(key => <button key={key} aria-current={page === key ? "page" : undefined}
        onClick={() => setPage(key)}>{pages[key].title}</button>)}
    </nav>
    <div ref={body} className="builtin-doc-body" tabIndex={0} role="region" aria-label={pages[page].title}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        a: ({ href, children }) => <a href={href && !/^(?:[a-z]+:|\/\/|#)/i.test(href)
          ? new URL(href, "https://github.com/Sthakur27/Nova/blob/main/").href : href} target="_blank" rel="noreferrer">{children}</a>,
      }}>{pages[page].text}</ReactMarkdown>
    </div>
  </dialog>, document.body);
}

export default function BuiltinDocs() {
  const [page, setPage] = useState<Page | null>(null);
  const [expanded, setExpanded] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [expanded]);
  return <div className="builtin-doc-links" ref={container} data-panel-no-drag
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && expanded) {
        event.preventDefault(); event.stopPropagation(); setExpanded(false); trigger.current?.focus();
      }
    }}>
    <button ref={trigger} className="icon-button builtin-doc-trigger" aria-label="About Nova" title="About Nova"
      aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <BookOpen size={17} aria-hidden="true" />
    </button>
    {expanded && <div id={id} className="builtin-doc-menu" role="group" aria-label="About Nova">
      {(Object.keys(pages) as Page[]).map(key => {
        const Icon = pages[key].icon;
        return <button key={key} aria-haspopup="dialog" onClick={() => {
          trigger.current?.focus(); setExpanded(false); setPage(key);
        }}><Icon size={14} aria-hidden="true" /><span>{key === "welcome" ? "Welcome" : "Changelog"}</span></button>;
      })}
    </div>}
    {page && <DocumentViewer initialPage={page} onClose={() => setPage(null)} />}
  </div>;
}
