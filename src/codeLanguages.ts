import type { Extension, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,
  completeAnyWord, completeFromList, snippetCompletion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import {
  bracketMatching, ensureSyntaxTree, foldGutter, foldKeymap,
  indentOnInput, syntaxTree, type LanguageSupport,
} from "@codemirror/language";
import { linter, lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { java } from "@codemirror/lang-java";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";

const languages = [
  { name: "Python", extensions: ["py", "pyw", "pyi"], load: python,
    keywords: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield" },
  { name: "TypeScript", extensions: ["ts", "mts", "cts"], load: () => javascript({ typescript: true }), keywords: "interface type enum implements private protected public readonly abstract declare keyof infer satisfies" },
  { name: "TSX", extensions: ["tsx"], load: () => javascript({ typescript: true, jsx: true }), keywords: "interface type enum implements readonly satisfies" },
  { name: "JavaScript", extensions: ["js", "mjs", "cjs"], load: javascript, keywords: "" },
  { name: "JSX", extensions: ["jsx"], load: () => javascript({ jsx: true }), keywords: "" },
  { name: "Java", extensions: ["java"], load: java,
    keywords: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits yield true false null" },
  { name: "JSON", extensions: ["json", "map"], load: json, keywords: "true false null" },
  { name: "HTML", extensions: ["html", "htm"], load: html, keywords: "" },
  { name: "CSS", extensions: ["css"], load: css, keywords: "" },
];

export function codeLanguage(path = "") {
  const extension = path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase();
  return languages.find(language => language.extensions.includes(extension ?? ""));
}

// Keep parser diagnostics bounded so large files remain usable. These are
// grammar recovery errors, not compiler/type-checker diagnostics.
export const SYNTAX_CHECK_LIMIT = 200_000;
export function syntaxDiagnostics(state: EditorState): Diagnostic[] {
  if (state.doc.length > SYNTAX_CHECK_LIMIT) return [];
  const tree = ensureSyntaxTree(state, state.doc.length, 25);
  if (!tree) return [];
  const diagnostics: Diagnostic[] = [];
  const cursor = tree.cursor();
  do {
    if (!cursor.type.isError) continue;
    const from = Math.min(cursor.from, Math.max(0, state.doc.length - 1));
    diagnostics.push({
      from, to: Math.min(state.doc.length, Math.max(cursor.to, from + 1)),
      severity: "error", source: "Syntax",
      message: cursor.from === cursor.to ? "Missing or incomplete syntax." : "Unexpected syntax.",
    });
  } while (diagnostics.length < 100 && cursor.next());
  return diagnostics;
}

function inCode(context: CompletionContext) {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  return !/Comment|String|TemplateText/.test(node.name);
}

export function codeExtensions(path?: string): Extension {
  const definition = codeLanguage(path);
  if (!definition) return [];
  const support: LanguageSupport = definition.load();
  const words = completeFromList([
    ...definition.keywords.split(" ").filter(Boolean).map(label => ({ label, type: "keyword" })),
    ...(definition.name === "Python" ? [
      snippetCompletion("def ${name}(${args}):\n\t${pass}", { label: "def", detail: "function", type: "keyword" }),
      snippetCompletion("class ${Name}:\n\tdef __init__(self${args}):\n\t\t${pass}", { label: "class", detail: "class", type: "keyword" }),
    ] : definition.name === "Java" ? [
      snippetCompletion("public class ${Name} {\n\t${}\n}", { label: "class", detail: "public class", type: "keyword" }),
      snippetCompletion("public static void main(String[] args) {\n\t${}\n}", { label: "main", detail: "entry point", type: "function" }),
    ] : []),
  ]);
  const jsonLint = jsonParseLinter();
  return [
    support,
    support.language.data.of({ autocomplete: (context: CompletionContext) => inCode(context) ? words(context) : null }),
    support.language.data.of({ autocomplete: (context: CompletionContext) => inCode(context) ? completeAnyWord(context) : null }),
    autocompletion(), closeBrackets(), bracketMatching(), indentOnInput(), foldGutter(),
    lintGutter(),
    linter(view => view.state.doc.length > SYNTAX_CHECK_LIMIT ? [] :
      definition.name === "JSON" ? jsonLint(view) : syntaxDiagnostics(view.state), {
      delay: 400,
      needsRefresh: update => syntaxTree(update.startState) !== syntaxTree(update.state),
    }),
    keymap.of([...completionKeymap, ...closeBracketsKeymap, ...foldKeymap, ...lintKeymap, indentWithTab]),
  ];
}
