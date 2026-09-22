import { expect, it, vi } from "vitest";
import { readNote, saveNote, saveBookmarks } from "./storage";
import { invoke } from "./resetLocalState";
import { codeLanguage } from "./codeLanguages";
vi.mock("./resetLocalState", () => ({invoke: vi.fn(), localResetInProgress: () => false}));
it("routes normal editor reads and explicit saves through protected registry commands", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({text:"{\r\n}", revision:"old"});
  expect(await readNote("/notes", ".nova")).toEqual({text:"{\n}", revision:"old", bookmarks:[]});
  expect(invoke).toHaveBeenLastCalledWith("read_registry_document", {root:"/notes"});
  vi.mocked(invoke).mockRejectedValueOnce("Invalid sync choices");
  await expect(saveNote("/notes", ".nova", '{"syncPolicy":false}', "old")).rejects.toBe("Invalid sync choices");
  expect(invoke).toHaveBeenLastCalledWith("save_registry_document", {root:"/notes",text:'{"syncPolicy":false}',revision:"old"});
  vi.mocked(invoke).mockResolvedValueOnce("new");
  expect(await saveNote("/notes", ".nova", "{}", "old")).toBe("new");
  const count = vi.mocked(invoke).mock.calls.length;
  await saveBookmarks("/notes", ".nova", []);
  expect(invoke).toHaveBeenCalledTimes(count);
  expect(codeLanguage(".nova")?.name).toBe("JSON");
});
