import { useEffect, useRef } from "react";

/** Offer reconnection once per visit, without reopening dismissed dialogs on every poll. */
export default function useConnectionPrompt(options: {
  connected: () => boolean; connecting: boolean; open: boolean; request: () => void;
}) {
  const latest = useRef(options); latest.current = options;
  useEffect(() => {
    let offered = false, wasConnected = false, away = false;
    const check = () => {
      const state = latest.current;
      if (state.connecting) return;
      const connected = state.connected();
      if (connected) { wasConnected = true; offered = false; return; }
      if (wasConnected) { offered = false; wasConnected = false; }
      if (document.hidden || !navigator.onLine) return;
      if (state.open) { offered = true; return; }
      if (offered || document.querySelector("dialog[open]")) return;
      offered = true; state.request();
    };
    const leave = () => { if (!latest.current.connecting) away = true; };
    const resume = () => {
      if (away && !latest.current.connecting) { offered = false; away = false; }
      check();
    };
    const visibility = () => { if (document.hidden) leave(); else resume(); };
    const online = () => { offered = false; check(); };
    check();
    const timer = setInterval(check, 1000);
    window.addEventListener("blur", leave); window.addEventListener("focus", resume);
    window.addEventListener("online", online); document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("blur", leave); window.removeEventListener("focus", resume);
      window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
}
