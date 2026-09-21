import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Palette from "./Palette";

it.each(["everywhere", "current"] as const)(
  "opens %s search with filenames without reading the editor document",
  (scope) => {
    const getActiveText = vi.fn(() => {
      throw new Error("Opening search must not serialize the document");
    });
    const markup = renderToStaticMarkup(
      <Palette
        folders={[{ root: "/notes", name: "Notes", files: [{ path: "Draft.md", name: "Draft.md" }] }]}
        activeNote={{ root: "/notes", path: "Draft.md", bookmarks: [] }}
        getActiveText={getActiveText}
        scope={scope}
        onScopeChange={() => {}}
        onNavigateCurrent={() => {}}
        onClose={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(markup).toContain("Draft.md");
    expect(markup).toContain("Search files, bookmarks, text, and settings");
    expect(getActiveText).not.toHaveBeenCalled();
  },
);
