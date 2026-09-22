import { closedDirectories } from "./folders";
import type { Workspace } from "./model";

export function fileAncestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function revealFile(folder: Workspace, path: string): Workspace {
  const ancestors = fileAncestors(path);
  return {
    ...folder,
    collapsed: false,
    ...(folder.directories ? {
      directories: [...new Set([...folder.directories, ...ancestors])],
      expandedDirectories: [...new Set([...(folder.expandedDirectories ?? []), ...ancestors])],
    } : {
      closedDirectories: closedDirectories(folder).filter(directory => !ancestors.includes(directory)),
    }),
  };
}
