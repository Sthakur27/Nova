import { useCallback, useEffect, useRef, useState } from "react";

export const RECONNECT_DELAY = 60 * 60 * 1000;
export function needsDriveReconnect(message: string) {
  return /Google access expired|Google did not return access|Could not read the Google connection|Could not read saved connection/i.test(message);
}

/** Share dismissal across windows and reloads, without prompting for ordinary offline errors. */
export default function useReconnectPrompt(options: {
  account: string; needed: () => boolean; busy: boolean; blocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const latest = useRef(options); latest.current = options;
  const until = useRef<Record<string, number>>({});
  const key = useCallback(() => `nova-reconnect-dismissed-v1:${latest.current.account}`, []);
  const dismiss = useCallback(() => {
    const storageKey = key(), deadline = Date.now() + RECONNECT_DELAY;
    until.current[storageKey] = deadline;
    try { localStorage.setItem(storageKey, String(deadline)); } catch { /* Keep the in-memory cooldown. */ }
    setOpen(false);
  }, [key]);
  useEffect(() => {
    const check = () => {
      const state = latest.current;
      if (!state.needed()) { setOpen(false); return; }
      const storageKey = key();
      let deadline = until.current[storageKey] ?? 0;
      try {
        const saved = Number(localStorage.getItem(storageKey));
        if (Number.isFinite(saved) && saved <= Date.now() + RECONNECT_DELAY) deadline = Math.max(deadline, saved);
      } catch { /* Storage can be unavailable. */ }
      if (deadline > Date.now()) { setOpen(false); return; }
      if (state.busy || state.blocked || document.hidden || !navigator.onLine || document.querySelector("dialog[open]")) return;
      setOpen(true);
    };
    check();
    const timer = setInterval(check, 1000);
    window.addEventListener("focus", check); window.addEventListener("online", check);
    window.addEventListener("storage", check); document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer); window.removeEventListener("focus", check); window.removeEventListener("online", check);
      window.removeEventListener("storage", check); document.removeEventListener("visibilitychange", check);
    };
  }, [key]);
  return { open, dismiss };
}
