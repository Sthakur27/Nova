import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { webServiceWorker } from "./web-shell";

it("only caches the application shell and never intercepts Google or token traffic", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const addAll = vi.fn(async () => {}); const match = vi.fn(async () => new Response("cached shell"));
  const cache = { open: vi.fn(async () => ({ addAll, match })), keys: vi.fn(async () => []) };
  const self = { location: { origin: "https://nova.example" }, addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; } };
  runInNewContext(webServiceWorker("build", ["/index.html", "/assets/app.js"]), { self, caches: cache, URL, fetch: vi.fn() });
  const waitUntil = vi.fn(); handlers.install({ waitUntil }); await waitUntil.mock.calls[0][0];
  expect(addAll).toHaveBeenCalledWith(["/index.html", "/assets/app.js"]);
  const respondWith = vi.fn();
  handlers.fetch({ request: { method: "GET", url: "https://www.googleapis.com/drive/v3/files", mode: "cors" }, respondWith });
  handlers.fetch({ request: { method: "POST", url: "https://nova.example/token", mode: "cors" }, respondWith });
  handlers.fetch({ request: { method: "GET", url: "https://nova.example/private-notes", mode: "cors" }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
  handlers.fetch({ request: { method: "GET", url: "https://nova.example/", mode: "navigate" }, respondWith });
  expect(await (await respondWith.mock.calls[0][0]).text()).toBe("cached shell");
});
