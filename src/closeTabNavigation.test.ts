import { expect, it, vi } from "vitest";
import { openAfterTabClose } from "./closeTabNavigation";
import { tabId, type NoteTab } from "./tabs";
const note = (path: string): NoteTab => ({root:"/notes",path,pinned:true});
it("skips unavailable adjacent tabs and opens a readable tab without reopening the closed one", async () => {
  const tabs=[note('missing.txt'),note('readable.txt'),note('closing-cloud.txt'),note('also-missing.txt')];
  const open=vi.fn(async (tab: NoteTab)=>tab.path==='readable.txt');
  expect(await openAfterTabClose(tabs,tabs[2],tabs.map(tabId),open)).toBe(true);
  expect(open.mock.calls.map(([tab])=>tab.path)).toEqual(['also-missing.txt','readable.txt']);
});
it("allows the editor to become empty when every remaining file is unavailable", async () => {
  const tabs=[note('missing.txt'),note('closing-cloud.txt')];
  expect(await openAfterTabClose(tabs,tabs[1],tabs.map(tabId),async()=>false)).toBe(false);
  expect(await openAfterTabClose([tabs[1]],tabs[1],[tabId(tabs[1])],async()=>{throw Error('must not reopen closed tab');})).toBe(false);
});
it("tries another pane only after the current pane's neighbors", async () => {
  const tabs=[note('own.txt'),note('closing.txt'),note('other.txt')];
  const open=vi.fn(async(tab:NoteTab)=>tab.path==='other.txt');
  await openAfterTabClose(tabs,tabs[1],[tabId(tabs[0]),tabId(tabs[1])],open);
  expect(open.mock.calls.map(([tab])=>tab.path)).toEqual(['own.txt','other.txt']);
});
