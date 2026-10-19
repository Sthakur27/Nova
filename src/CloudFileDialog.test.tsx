// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CloudFileDialog, { type CloudFileReview } from "./CloudFileDialog";
const copy: CloudFileReview = { name:"Note.md",localText:"device text",localRevision:"1",remoteText:"Drive text",remoteRevision:"v1",remoteName:"Note.md",driveId:"id",account:"alice",parent:"space" };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const click = async (label: string) => { const button = [...host.querySelectorAll("button")].find(button => button.textContent === label)!; expect(button).toBeTruthy(); await act(async () => button.click()); };
it("reviews both copies before a confirmed replacement and requires new review after a stale-copy error", async () => {
  const replace = vi.fn(async () => { throw new Error("This file changed. Review both copies again."); });
  await act(async () => root.render(<CloudFileDialog name="Note.md" review={async () => copy} sync={async () => {}} replace={replace} onClose={() => {}} />));
  expect(host.textContent).not.toContain("Confirm replacement");
  await click("Review copies / sync details");
  expect(host.textContent).toContain("device text"); expect(host.textContent).toContain("Drive text");
  await click("Replace Drive copy with this version…"); expect(replace).not.toHaveBeenCalled();
  await click("Confirm replacement"); expect(replace).toHaveBeenCalledWith(copy, "push");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("changed");
  expect(host.textContent).not.toContain("Confirm replacement");
});
it("moves only the reviewed file to .deleted after confirmation and blocks duplicate submissions", async () => {
  let finish!: () => void;
  const archive = vi.fn(() => new Promise<void>(resolve => { finish = resolve; })), close = vi.fn();
  await act(async () => root.render(<CloudFileDialog name="Note.md" review={async () => copy} sync={async () => {}} replace={async () => {}} archive={archive} onClose={close} />));
  await click("Review copies / sync details"); await click("Move to .deleted…");
  expect(archive).not.toHaveBeenCalled(); await click("Move to .deleted");
  expect(archive).toHaveBeenCalledWith(copy);
  expect([...host.querySelectorAll("button")].every(button => button.disabled)).toBe(true);
  await act(async () => finish()); expect(close).toHaveBeenCalledOnce();
});
