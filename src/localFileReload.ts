import type { DocumentData } from "./model";
export class LocalChangeRetry extends Error {}
/** Recheck live state after every asynchronous read before replacing an editor. */
export async function prepareLocalReload(options: {
  read: () => Promise<DocumentData>;
  exists: () => boolean;
  revision: () => string | undefined;
  busy: () => boolean;
  dirty: () => boolean;
  recovered: () => Promise<boolean>;
}): Promise<DocumentData | "unchanged" | "protected" | "closed"> {
  const note = await options.read();
  if (!options.exists()) return "closed";
  if (options.revision() === note.revision) return "unchanged";
  if (options.busy()) throw new LocalChangeRetry("An operation interrupted the external change check; it will retry.");
  if (options.dirty()) return "protected";
  const recovered = await options.recovered();
  if (!options.exists()) return "closed";
  if (options.busy()) throw new LocalChangeRetry("An operation interrupted the external change check; it will retry.");
  if (options.dirty() || recovered) return "protected";
  return note;
}
