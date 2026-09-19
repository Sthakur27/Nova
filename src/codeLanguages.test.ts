import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext, type CompletionSource } from "@codemirror/autocomplete";
import { codeExtensions, codeLanguage, syntaxDiagnostics, SYNTAX_CHECK_LIMIT } from "./codeLanguages";

function state(path: string, doc: string) {
  return EditorState.create({ doc, extensions: codeExtensions(path) });
}

describe("code language support", () => {
  it.each([
    ["main.py", "Python"], ["C:\\code\\MAIN.JAVA", "Java"],
    ["types.d.ts", "TypeScript"], ["app.tsx", "TSX"], ["index.mjs", "JavaScript"],
    ["app.jsx", "JSX"], ["config.json", "JSON"], ["index.html", "HTML"], ["style.css", "CSS"],
  ])("detects %s", (path, name) => expect(codeLanguage(path)?.name).toBe(name));

  it.each(["notes.md", "notes.txt", "unknown", "file.custom"])('leaves %s as prose', path => {
    expect(codeLanguage(path)).toBeUndefined();
    expect(codeExtensions(path)).toEqual([]);
  });

  it.each([
    ["main.py", "def greet(name):\n    return name\n", "def greet(:\n    return\n"],
    ["main.ts", "const value: number = 1;", "const value: = ;"],
    ["Main.java", "class Main { int value = 1; }", "class Main { int value = ; }"],
    ["app.tsx", "const App = () => <div>Hello</div>;", "const App = () => <div>"],
  ])("checks syntax in %s", (path, valid, invalid) => {
    expect(syntaxDiagnostics(state(path, valid))).toEqual([]);
    const errors = syntaxDiagnostics(state(path, invalid));
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error.from).toBeGreaterThanOrEqual(0);
      expect(error.to).toBeLessThanOrEqual(invalid.length);
      expect(error.severity).toBe("error");
    }
  });

  it.each([
    ["main.py", "def greet(name):\n    return name\n\ngre", "greet"],
    ["main.ts", "const greeting = 1;\ngre", "greeting"],
    ["Main.java", "class Main { pub", "public"],
  ])("offers completions for %s", async (path, doc, label) => {
    const editor = state(path, doc);
    const sources = editor.languageDataAt<CompletionSource>("autocomplete", doc.length);
    const results = await Promise.all(sources.map(source => source(new CompletionContext(editor, doc.length, true))));
    expect(results.flatMap(result => result?.options ?? []).some(option => option.label === label)).toBe(true);
  });

  it("bounds diagnostic work on large files", () => {
    expect(syntaxDiagnostics(state("main.py", "# comment\n".repeat(SYNTAX_CHECK_LIMIT / 10 + 1)))).toEqual([]);
  });
});
