import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronDown,
  Download,
  LoaderCircle,
  Mic,
  Square,
  X,
} from "lucide-react";
import { desktop } from "./storage";
import { DictationSession, type VoicePhase } from "./dictation";

type Props = {
  disabled: boolean;
  onBegin: () => void;
  onText: (text: string) => void;
  onPartial?: (text: string) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
  onError: (error: string) => void;
};
export default function VoiceControl(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(desktop);
  const [setup, setSetup] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const dictateButton = useRef<HTMLButtonElement>(null);
  const setupRef = useRef<HTMLDivElement>(null);
  const downloadBusy = useRef(false);
  const [session] = useState(
    () =>
      new DictationSession(
        {
          start: (id) => invoke("speech_start", { sessionId: id }),
          finish: (id) => invoke<string>("speech_finish", { sessionId: id }),
          cancel: (id) => invoke("speech_cancel", { sessionId: id }),
        },
        (next) => {
          setPhase(next);
          latest.current.onBusy(next !== "idle");
        },
        (text) => latest.current.onText(text),
        (error) => {
          latest.current.onCancel();
          setMessage(error);
          latest.current.onError(error);
        },
        (text) => latest.current.onPartial?.(text),
      ),
  );
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const subscriptions = Promise.all([
      listen<number>("speech:download-progress", (event) => {
        if (!disposed) setProgress(event.payload);
      }),
      listen<{ sessionId: string; text: string }>("speech:partial", (event) => {
        if (!disposed) session.partial(event.payload.sessionId, event.payload.text);
      }),
      listen<{ sessionId: string }>("speech:capture-ended", (event) => {
        if (!disposed) session.captureEnded(event.payload.sessionId);
      }),
    ]);
    void subscriptions
      .then(() => invoke<{ ready: boolean }>("speech_status"))
      .then((status) => {
        if (!disposed) setReady(status.ready);
      })
      .catch((error) => {
        if (!disposed) setMessage(String(error));
      })
      .finally(() => {
        if (!disposed) setChecking(false);
      });
    return () => {
      disposed = true;
      void subscriptions
        .then((list) => list.forEach((fn) => fn()))
        .catch(() => {});
      void session.cancel();
    };
  }, [session]);
  useEffect(() => {
    if (phase !== "recording") return;
    setSeconds(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 120) void session.finish();
    }, 250);
    return () => clearInterval(timer);
  }, [phase, session]);
  useEffect(() => {
    if (setup) setupRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [setup]);
  useEffect(() => {
    // Capture before focused editors, inputs, or terminals consume the key.
    const key = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          event.isComposing || event.key.toLowerCase() !== "v") return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) dictateButton.current?.click();
    };
    window.addEventListener("keydown", key, { capture: true });
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (desktop) {
      void getCurrentWindow().listen("nova:dictate", () => dictateButton.current?.click())
        .then(fn => { if (disposed) fn(); else unlisten = fn; });
    }
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("keydown", key, { capture: true });
    };
  }, []);
  async function download() {
    if (downloadBusy.current) return;
    downloadBusy.current = true;
    setDownloading(true);
    setProgress(0);
    setMessage("");
    try {
      await invoke("speech_download");
      setReady(true);
      setMessage("Ready. Press Start dictation when you want to speak.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      downloadBusy.current = false;
      setDownloading(false);
    }
  }
  function start() {
    if (!desktop) {
      setSetup(true);
      return;
    }
    if (!ready) {
      setSetup(true);
      return;
    }
    if (session.id || props.disabled || downloading) return;
    setSetup(false);
    setMessage("");
    latest.current.onBegin();
    void session.start(crypto.randomUUID());
  }
  const active = phase !== "idle";
  const description = downloading ? `Downloading ${progress}%`
    : checking ? "Checking voice typing…"
    : phase === "recording" ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · Stop dictation`
    : phase === "starting" ? "Opening mic…"
    : phase === "transcribing" ? "Transcribing…"
    : "Dictate · on-device · English";
  return (
    <div className="voice-control">
      <button
        ref={dictateButton}
        aria-keyshortcuts="Meta+V"
        className={"voice-button toolbar-icon focus-toggle " + (active ? "voice-active" : "")}
        disabled={
          props.disabled ||
          checking ||
          downloading ||
          phase === "starting" ||
          phase === "transcribing"
        }
        aria-label={phase === "recording" ? "Stop dictation" : "Dictate"}
        aria-describedby="dictation-tooltip"
        onClick={() =>
          phase === "recording" ? void session.finish() : start()
        }
      >
        {phase === "recording" ? (
          <Square size={13} />
        ) : phase === "starting" || phase === "transcribing" || downloading ? (
          <LoaderCircle className="spin" size={14} />
        ) : (
          <Mic size={15} />
        )}
        <span className="focus-tooltip" id="dictation-tooltip" role="tooltip">
          <span>{description}</span>
          <span className="focus-tooltip-keys"><kbd>⌘</kbd><kbd>V</kbd></span>
        </span>
      </button>
      {!active && (
        <button
          className="icon-button"
          aria-label="Voice typing settings"
          title="Voice typing settings"
          onClick={() => setSetup((value) => !value)}
        >
          <ChevronDown size={12} />
        </button>
      )}
      {active && (
        <button
          className="icon-button"
          aria-label="Cancel dictation"
          title="Cancel and discard recording"
          onClick={() => {
            latest.current.onCancel();
            void session.cancel();
          }}
        >
          <X size={14} />
        </button>
      )}
      {setup && (
        <div
          className="voice-popover"
          role="dialog"
          aria-label="Voice typing setup"
          ref={setupRef}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setSetup(false);
            }
          }}
        >
          <div className="voice-heading">
            <Mic size={18} />
            <strong>Let your thoughts out.</strong>
            <button
              className="icon-button"
              aria-label="Close voice setup"
              onClick={() => setSetup(false)}
            >
              <X size={15} />
            </button>
          </div>
          {!desktop ? (
            <p>
              Voice typing is available in the Nova desktop app. Open Nova on
              your Mac or Windows computer to use your microphone.
            </p>
          ) : (
            <>
              <p>
                Words appear as you speak, with a short processing delay, at the
                insertion point where you started. Stop to finalize the text.
              </p>
              <div className="voice-details">
                <span>On-device · English</span>
                <span>Up to 2 minutes</span>
              </div>
              <p className="voice-privacy">
                Audio stays on this device and is discarded after transcription.
                The model loads only while dictating.
              </p>
              {!ready && (
                <p>
                  Download the small speech model once (78 MB from Hugging
                  Face). After that, dictation works offline.
                </p>
              )}
              {downloading && (
                <progress
                  max={100}
                  value={progress}
                  aria-label="Speech model download"
                />
              )}
              {message && (
                <p role="status" className="voice-message">
                  {message}
                </p>
              )}
              <button
                className="primary"
                disabled={downloading || checking || props.disabled}
                onClick={ready ? start : () => void download()}
              >
                {ready ? <Mic size={14} /> : <Download size={14} />}{" "}
                {downloading
                  ? `Downloading… ${progress}%`
                  : ready
                    ? "Start dictation"
                    : "Download speech model"}
              </button>
              {ready && (
                <button
                  className="voice-reinstall"
                  disabled={downloading}
                  onClick={() => void download()}
                >
                  Download model again
                </button>
              )}
              <small>
                Your system will ask for microphone access when you start.
              </small>
            </>
          )}
        </div>
      )}
      <span className="sr-only" role="status">
        {phase === "recording"
          ? "Recording. Words appear as you speak. Press Stop dictation to finish."
          : phase === "transcribing"
            ? "Transcribing on this device."
            : ""}
      </span>
    </div>
  );
}
