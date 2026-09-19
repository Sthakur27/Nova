import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers, type Panel, type ViewUpdate } from "@codemirror/view";
import { SearchCursor, SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, search, selectMatches, setSearchQuery } from "@codemirror/search";

type Match = { from: number; to: number };
export function searchMatches(state: EditorState, query: SearchQuery): Match[] {
  if (!query.valid) return [];
  const cursor = query.getCursor(state);
  const matches: Match[] = [];
  for (;;) {
    // Next/previous can visit overlapping literal matches, so count those too.
    const result = cursor instanceof SearchCursor ? cursor.nextOverlapping() : cursor.next();
    if (result.done) return matches;
    matches.push({ from: result.value.from, to: result.value.to });
  }
}

const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  previous: '<path d="m6 14 6-6 6 6"/>',
  next: '<path d="m6 10 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name: keyof typeof icons) {
  const span = document.createElement("span");
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  return span;
}
function button(label: string, action: () => void, glyph?: keyof typeof icons) {
  const el = document.createElement("button");
  el.type = "button";
  el.title = label;
  el.setAttribute("aria-label", label);
  if (glyph) el.append(icon(glyph));
  else el.textContent = label;
  el.addEventListener("click", action);
  return el;
}
function input(label: string) {
  const el = document.createElement("input");
  el.placeholder = label;
  el.setAttribute("aria-label", label);
  el.autocomplete = "off";
  el.spellcheck = false;
  return el;
}
class FindPanel implements Panel {
  dom = document.createElement("div");
  top = true;
  private field = input("Find in note");
  private replacement = input("Replace with");
  private count = document.createElement("span");
  private query: SearchQuery;
  private matches: Match[] = [];
  private previous: HTMLButtonElement;
  private next: HTMLButtonElement;
  private options: HTMLButtonElement[] = [];
  private replaceButtons: HTMLButtonElement[] = [];
  constructor(private view: EditorView) {
    this.query = getSearchQuery(view.state);
    this.dom.className = "nova-find";
    this.dom.setAttribute("role", "search");
    this.dom.setAttribute("aria-label", "Find in note");
    const row = document.createElement("div");
    row.className = "nova-find-row";
    const fieldWrap = document.createElement("div");
    fieldWrap.className = "nova-find-field";
    this.field.setAttribute("main-field", "true");
    this.field.addEventListener("input", () => this.commit(true));
    this.count.className = "nova-find-count";
    this.count.setAttribute("role", "status");
    this.count.setAttribute("aria-live", "polite");
    this.count.setAttribute("aria-atomic", "true");
    fieldWrap.append(icon("search"), this.field, this.count);
    this.previous = button("Previous match (Shift+Enter)", () => { findPrevious(view); }, "previous");
    this.next = button("Next match (Enter)", () => { findNext(view); }, "next");
    row.append(fieldWrap, this.previous, this.next, button("Close search (Esc)", () => { closeSearchPanel(view); }, "close"));
    const details = document.createElement("details");
    details.className = "nova-find-details";
    const summary = document.createElement("summary");
    summary.textContent = "Search options & replace";
    const options = document.createElement("div");
    options.className = "nova-find-options";
    for (const [key, label] of [["caseSensitive", "Match case"], ["wholeWord", "Whole word"], ["regexp", "Regex"]] as const) {
      const option = button(label, () => {
        option.setAttribute("aria-pressed", String(option.getAttribute("aria-pressed") !== "true"));
        this.commit(true);
      });
      option.dataset.option = key;
      this.options.push(option);
      options.append(option);
    }
    options.append(button("Select all matches", () => { selectMatches(view); view.focus(); }));
    details.append(summary, options);
    if (!view.state.readOnly) {
      const replaceRow = document.createElement("div");
      replaceRow.className = "nova-find-replace";
      this.replacement.addEventListener("input", () => this.commit(false));
      this.replaceButtons = [button("Replace", () => { replaceNext(view); }), button("Replace all", () => { replaceAll(view); })];
      replaceRow.append(this.replacement, ...this.replaceButtons);
      details.append(replaceRow);
    }
    this.dom.append(row, details);
    this.dom.addEventListener("keydown", event => {
      if (event.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); closeSearchPanel(view); }
      else if (event.key === "Enter" && event.target === this.field) {
        event.preventDefault();
        (event.shiftKey ? findPrevious : findNext)(view);
      } else if (event.key === "Enter" && event.target === this.replacement) {
        event.preventDefault(); replaceNext(view);
      } else if (runScopeHandlers(view, event, "search-panel")) event.preventDefault();
    });
    this.sync();
    this.refresh(true);
  }
  mount() { this.field.focus(); this.field.select(); }
  private commit(navigate: boolean) {
    const flags = Object.fromEntries(this.options.map(option => [option.dataset.option!, option.getAttribute("aria-pressed") === "true"]));
    const query = new SearchQuery({ ...flags, search: this.field.value, replace: this.replacement.value });
    if (query.eq(this.query)) return;
    const { selectionStart, selectionEnd, selectionDirection } = this.field;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    if (navigate && query.valid) {
      const from = this.view.state.selection.main.from;
      this.view.dispatch({ selection: { anchor: from } });
      findNext(this.view);
      // CodeMirror selects the search input after navigation. While typing,
      // preserve the caret so the next character extends the query.
      if (selectionStart !== null && selectionEnd !== null)
        this.field.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    }
  }
  private sync() {
    if (this.field.value !== this.query.search) this.field.value = this.query.search;
    if (this.replacement.value !== this.query.replace) this.replacement.value = this.query.replace;
    for (const option of this.options)
      option.setAttribute("aria-pressed", String(this.query[option.dataset.option as "caseSensitive" | "wholeWord" | "regexp"]));
  }
  update(update: ViewUpdate) {
    const query = getSearchQuery(update.state);
    const changed = !query.eq(this.query);
    if (changed) { this.query = query; this.sync(); }
    if (changed || update.docChanged || update.selectionSet) this.refresh(changed || update.docChanged);
  }
  private refresh(recount: boolean) {
    if (recount) this.matches = searchMatches(this.view.state, this.query);
    const selection = this.view.state.selection.main;
    const index = this.matches.findIndex(match => match.from === selection.from && match.to === selection.to);
    this.count.textContent = !this.query.search ? "" : !this.query.valid ? "Invalid regex" : !this.matches.length ? "No results" : `${index + 1} of ${this.matches.length}`;
    this.field.setAttribute("aria-invalid", String(!!this.query.search && !this.query.valid));
    for (const el of [this.previous, this.next, ...this.replaceButtons]) el.disabled = !this.matches.length;
  }
}
export const editorSearch = search({ top: true, createPanel: view => new FindPanel(view) });
