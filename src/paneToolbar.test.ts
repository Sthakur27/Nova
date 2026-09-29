import { expect, it } from "vitest";
import { availablePaneMode, readModeAvailable, paneMode, paneToolbar } from "./paneToolbar";
import { RICH_DOCUMENT_LIMIT } from "./documentLimits";

it("keeps controls for formatted Markdown and plain text available together", () => {
  const toolbar = paneToolbar([{ path: "note.md", mode: "edit", length: 20 }, { path: "empty.txt", mode: "source", length: 0 }]);
  expect(toolbar).toMatchObject({ hasMarkdown: true, hasFormatting: true, hasLineNumbers: true, edit: true, read: false, source: false });
});
it("maps shared Edit, Source, and Read to each file's supported view", () => {
  for (const mode of ["edit", "source", "read"] as const) {
    const views = ["note.md", "empty.txt"].map(path => ({ path, mode: paneMode(mode, path), length: 0 }));
    expect(paneToolbar(views)[mode]).toBe(true);
    expect(paneToolbar(views).hasFormatting).toBe(mode !== "read");
  }
  expect(paneMode("edit", "empty.txt")).toBe("source");
  expect(paneMode("edit", "empty.md")).toBe("edit");
});
it("shows no false selection for mixed reading/editing panes", () => {
  expect(paneToolbar([{ path: "one.md", mode: "read", length: 10 }, { path: "two.txt", mode: "source", length: 10 }])).toMatchObject({ read: false, edit: false, source: false, hasLineNumbers: true });
});
it("keeps line numbers for large Markdown source fallbacks and ignores empty groups", () => {
  expect(paneToolbar([{ path: "huge.md", mode: "edit", length: RICH_DOCUMENT_LIMIT + 1 }]).hasLineNumbers).toBe(true);
  expect(paneToolbar([])).toEqual({ hasMarkdown: false, hasEdit: false, hasFormatting: false, hasLineNumbers: false, read: false, edit: false, source: false });
});

it("normalizes restored Read modes for Markdown and other files while Read is hidden", () => {
  for (const path of ["note.md", "NOTE.MDX", "note.txt", "config.json"]) {
    const editing = /\.(md|mdx)$/i.test(path) ? "edit" : "source";
    expect(availablePaneMode("read", path, 30, false)).toBe(editing);
    expect(availablePaneMode("read", path, 30, true)).toBe("read");
    expect(availablePaneMode("source", path, 30, false)).toBe("source");
    expect(readModeAvailable(false, path, 30)).toBe(false);
  }
});
it("retains the large Markdown reader without enabling Read for other panes", () => {
  expect(readModeAvailable(false, "note.md", RICH_DOCUMENT_LIMIT)).toBe(false);
  expect(readModeAvailable(false, "note.md", RICH_DOCUMENT_LIMIT + 1)).toBe(true);
  expect(readModeAvailable(false, "note.txt", RICH_DOCUMENT_LIMIT + 1)).toBe(false);
  const views = [
    { path: "large.md", length: RICH_DOCUMENT_LIMIT + 1 },
    { path: "small.md", length: 12 },
    { path: "note.txt", length: 12 },
  ].map(view => ({ ...view, mode: availablePaneMode("read", view.path, view.length, false) }));
  expect(views.map(view => view.mode)).toEqual(["read", "edit", "source"]);
  expect(paneToolbar(views)).toMatchObject({read:false, edit:false, hasFormatting:true});
});

it.each([false, true])("offers Source and Read for large Markdown with Read preference %s", showReadMode => {
  for (const path of ["local/large.md", "cloud/large.MDX", "large.markdown"]) {
    const length = RICH_DOCUMENT_LIMIT + 1;
    expect(availablePaneMode("edit", path, length, showReadMode)).toBe("source");
    expect(availablePaneMode("read", path, length, showReadMode)).toBe("read");
    expect(readModeAvailable(showReadMode, path, length)).toBe(true);
    expect(paneToolbar([{ path, length, mode: "edit" }])).toMatchObject({ hasEdit: false, source: true, edit: false });
    expect(paneToolbar([{ path, length, mode: "read" }])).toMatchObject({ hasEdit: false, source: false, read: true });
    expect(availablePaneMode("edit", path, RICH_DOCUMENT_LIMIT, showReadMode)).toBe("edit");
    expect(paneToolbar([{ path, length: RICH_DOCUMENT_LIMIT, mode: "edit" }])).toMatchObject({ hasEdit: true, edit: true, source: false });
  }
});

it("keeps Edit for a rich-editable split and hides the duplicate for large Markdown with plain text", () => {
  const large = { path: "large.md", length: RICH_DOCUMENT_LIMIT + 1, mode: "source" as const };
  const plain = { path: "notes.txt", length: 20, mode: "source" as const };
  expect(paneToolbar([large, plain])).toMatchObject({ hasEdit: false, source: true, edit: false });
  const small = { path: "small.md", length: 20, mode: "edit" as const };
  expect(paneToolbar([large, plain, small])).toMatchObject({ hasEdit: true, edit: true, source: false });
  expect(paneToolbar([large, { ...small, mode: "source" }])).toMatchObject({ hasEdit: true, edit: false, source: true });
  expect(paneToolbar([plain])).toMatchObject({ hasEdit: true, edit: true, source: false });
});
