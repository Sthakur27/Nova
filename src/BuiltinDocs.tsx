import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import welcome from "../docs/welcome.md?raw";
import changelog from "../CHANGELOG.md?raw";
import "./builtinDocs.css";

const pages = {
  welcome: { title: "Welcome to Nova", text: welcome },
  changelog: { title: "Changelog", text: changelog },
};
type Page = keyof typeof pages;

function DocumentViewer({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState<Page>("welcome");
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => { element.close(); previous?.focus(); };
  }, []);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [page]);
  return createPortal(<dialog ref={dialog} className="settings-dialog builtin-doc-dialog" aria-labelledby={id}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={event => event.stopPropagation()}>
    <header className="settings-header">
      <div><h1 id={id}>{pages[page].title}</h1><p>Built into Nova · Available offline</p></div>
      <button ref={closeButton} className="icon-button" aria-label="Close built-in documents" onClick={onClose}><X size={18} /></button>
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
  const [open, setOpen] = useState(false);
  return <>
    <button aria-label="About Nova" title="About Nova" aria-haspopup="dialog"
      onClick={event => { event.currentTarget.focus(); setOpen(true); }}>
      <BookOpen size={18} aria-hidden="true" />
    </button>
    {open && <DocumentViewer onClose={() => setOpen(false)} />}
  </>;
}
