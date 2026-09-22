export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
  include: string;
  exclude: string;
};
export const defaultSearchOptions: SearchOptions = {
  caseSensitive: false, wholeWord: false, regexp: false, include: "", exclude: "",
};
export type SearchSpec = { pattern: string; caseSensitive: boolean; include: string; exclude: string };
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Comma-separated workspace-relative globs. Bare names match at any depth;
// a folder name also matches its descendants. **/ includes the root level.
export function globPattern(value: string): string {
  return value.split(",").map(part => part.trim().replace(/^\.\//, "").replace(/\/$/, ""))
    .filter(Boolean).map(glob => {
      let pattern = glob.includes("/") ? "^" : "(?:^|/)";
      for (let i = 0; i < glob.length; i++) {
        if (glob[i] === "*" && glob[i + 1] === "*") {
          i++;
          if (glob[i + 1] === "/") { i++; pattern += "(?:.*/)?"; }
          else pattern += ".*";
        } else if (glob[i] === "*") pattern += "[^/]*";
        else if (glob[i] === "?") pattern += "[^/]";
        else pattern += escape(glob[i]);
      }
      return pattern + "(?:/.*)?$";
    }).join("|");
}
export function searchSpec(query: string, options = defaultSearchOptions): SearchSpec {
  const source = options.regexp ? query.trim() : escape(query.trim());
  const pattern = options.wholeWord && source ? `\\b(?:${source})\\b` : source;
  // Validate before dispatching a search; the native engine reports unsupported expressions.
  new RegExp(pattern, options.caseSensitive ? "u" : "iu");
  return { pattern, caseSensitive: options.caseSensitive, include: globPattern(options.include), exclude: globPattern(options.exclude) };
}
export function searchMatcher(query: string, options = defaultSearchOptions) {
  const spec = searchSpec(query, options);
  const pattern = new RegExp(spec.pattern, options.caseSensitive ? "u" : "iu");
  const include = spec.include ? new RegExp(spec.include) : null;
  const exclude = spec.exclude ? new RegExp(spec.exclude) : null;
  return {
    matches: (text: string) => pattern.test(text),
    acceptsPath: (path: string) => (!include || include.test(path)) && (!exclude || !exclude.test(path)),
    pattern,
  };
}
