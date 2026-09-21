import { useLayoutEffect } from "react";

// Native title hints also come from rendered Markdown and editor decorations,
// so handle them at the document boundary along with app controls and portals.
export function useTooltips(enabled: boolean) {
  useLayoutEffect(() => {
    if (enabled) return;
    const body = document.body;
    body.dataset.tooltips = "hidden";
    const titles = new Map<Element, string>();
    const suppress = (element: Element) => {
      const title = element.getAttribute("title");
      if (title !== null) {
        titles.set(element, title);
        element.removeAttribute("title");
      }
    };
    const scan = (node: Node) => {
      if (!(node instanceof Element)) return;
      suppress(node);
      node.querySelectorAll("[title]").forEach(suppress);
    };
    const restore = (element: Element, title: string) => {
      if (!element.hasAttribute("title")) element.setAttribute("title", title);
    };
    const observer = new MutationObserver(records => {
      // Disconnect during our own edits so they cannot overwrite saved titles.
      observer.disconnect();
      const changed = new Set(records.filter(record => record.type === "attributes").map(record => record.target as Element));
      for (const element of changed) {
        if (element.hasAttribute("title")) suppress(element);
        else titles.delete(element);
      }
      for (const record of records) {
        if (record.type === "childList") record.addedNodes.forEach(scan);
      }
      for (const [element, title] of titles) {
        if (!body.contains(element)) {
          restore(element, title);
          titles.delete(element);
        }
      }
      observe();
    });
    const observe = () => observer.observe(body, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["title"],
    });
    scan(body);
    observe();
    return () => {
      // Apply pending title changes before restoring (e.g. a simultaneous render).
      const pending = observer.takeRecords();
      observer.disconnect();
      for (const record of pending) {
        if (record.type === "attributes") titles.delete(record.target as Element);
      }
      titles.forEach((title, element) => restore(element, title));
      delete body.dataset.tooltips;
    };
  }, [enabled]);
}
