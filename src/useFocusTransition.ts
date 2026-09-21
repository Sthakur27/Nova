import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";

const duration = 480;
const easing = "cubic-bezier(.22, 1, .36, 1)";

/** Keep the saved focus state separate from the short visual transition. */
export function useFocusTransition(enabled: boolean) {
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), [enabled]);

  return useCallback((focused: boolean, update: () => void) => {
    cancel.current();
    if (!enabled || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }

    let cancelled = false;
    const animations: Animation[] = [];
    const root = document.documentElement;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) { update(); return; }
    shell.dataset.focusFlight = "true";
    root.dataset.novaFocusFlight = focused ? "enter" : "exit";
    const clean = () => {
      delete shell.dataset.focusFlight;
      delete root.dataset.novaFocusFlight;
    };
    let transition: ViewTransition | undefined;
    cancel.current = () => {
      cancelled = true;
      transition?.skipTransition();
      animations.forEach(animation => animation.cancel());
      clean();
    };

    if (typeof document.startViewTransition === "function") {
      transition = document.startViewTransition(() => {
        if (!cancelled) flushSync(update);
      });
      // A skipped capture still applies the state change; it need not surface an error.
      void transition.ready.catch(() => {});
      void transition.finished.catch(() => {}).finally(() => { if (!cancelled) clean(); });
      return;
    }

    // Older webviews slide the live controls, then ease the expanded writing pane.
    const panels = () => Array.from(shell.querySelectorAll<HTMLElement>(".sidebar, .bookmark-rail, .top-bars, .status-bar"))
      .filter(element => element.getClientRects().length > 0);
    const offset = (element: HTMLElement) => element.matches(".sidebar") ? "translateX(-48px)"
      : element.matches(".bookmark-rail") ? "translateX(48px)"
      : element.matches(".status-bar") ? "translateY(16px)" : "translateY(-24px)";
    const animatePanels = (entering: boolean) => panels().map(element => {
      const frames = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: offset(element) }];
      const animation = element.animate(entering ? frames : frames.reverse(), { duration: 180, easing, fill: "both" });
      animations.push(animation);
      return animation.finished.catch(() => {});
    });
    void (async () => {
      if (focused) await Promise.all(animatePanels(true));
      if (cancelled) return;
      const main = shell.querySelector<HTMLElement>(".main-panel");
      const before = main?.getBoundingClientRect();
      flushSync(update);
      animations.forEach(animation => animation.cancel());
      if (main && before) {
        const after = main.getBoundingClientRect();
        animations.push(main.animate([
          { transformOrigin: "top left", transform: `translateX(${before.left - after.left}px) scaleX(${before.width / after.width})`, opacity: .75 },
          { transformOrigin: "top left", transform: "none", opacity: 1 },
        ], { duration, easing }));
      }
      if (!focused) animatePanels(false);
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      animations.forEach(animation => animation.cancel());
      if (!cancelled) clean();
    })();
  }, [enabled]);
}
