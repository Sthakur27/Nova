// Rich editing builds a DOM and source-position mapping for the entire note.
// Keep larger notes in CodeMirror and the worker-backed chunked reader.
export const RICH_DOCUMENT_LIMIT = 500_000;

export function supportsDocumentView(...lengths: number[]): boolean {
  return lengths.every(length => length <= RICH_DOCUMENT_LIMIT);
}
