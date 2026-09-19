import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { desktop } from "./storage";
import "@xterm/xterm/css/xterm.css";

export default function TerminalView({ root, open }: { root: string; open: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!desktop || !host.current) return;
    let disposed = false, ready = false, exited = false;
    const id = crypto.randomUUID();
    const term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'Menlo, Monaco, Consolas, monospace',
      scrollback: 5000, theme: { background: "#191a1e", foreground: "#d7d5df", cursor: "#cbb0ef", selectionBackground: "#a287c944" } });
    terminal.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    const fail = (reason: unknown) => { if (!disposed) setError(String(reason)); };
    const resize = () => {
      if (disposed || !host.current?.clientWidth || !host.current.clientHeight) return;
      fit.fit();
      if (ready) void invoke("terminal_resize", { id, cols: term.cols, rows: term.rows }).catch(fail);
    };
    resize();
    const output = new Channel<{ data: number[]; exited: boolean }>();
    output.onmessage = event => {
      if (disposed) return;
      if (event.data.length) term.write(new Uint8Array(event.data));
      if (event.exited) {
        exited = true;
        ready = false;
        term.writeln("\r\n[Shell exited. Use New terminal session to start again.]");
        void invoke("terminal_close", { id }).catch(fail);
      }
    };
    const start = invoke("terminal_open", { id, root: root === "demo" ? null : root, cols: term.cols, rows: term.rows, output });
    void start.then(() => {
      if (!disposed && !exited) {
        ready = true; resize();
        if (host.current?.clientHeight) term.focus();
      }
    }).catch(fail);
    // Serialize input so rapid keystrokes and pasted chunks reach the PTY in order.
    let pending = Promise.resolve();
    const input = term.onData(data => {
      if (ready) pending = pending.then(() => invoke<void>("terminal_write", { id, data })).catch(fail);
    });
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    return () => {
      disposed = true; ready = false;
      observer.disconnect(); input.dispose(); term.dispose(); terminal.current = null;
      void start.then(() => invoke("terminal_close", { id })).catch(() => {});
    };
  }, [root]);
  useEffect(() => { if (open) terminal.current?.focus(); }, [open]);
  if (!desktop) return <p className="terminal-message">The terminal is available in the Nova desktop app. Open Nova to run a shell in this folder.</p>;
  return <>
    {error && <p role="alert" className="terminal-message">{error}</p>}
    <div className="terminal-screen" ref={host} data-panel-no-drag />
  </>;
}
