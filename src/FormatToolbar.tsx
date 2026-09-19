import { Bold, Italic, Strikethrough, Code, List, ListOrdered, ListTodo, Quote, Undo2, Redo2 } from "lucide-react";
import { formatShortcuts, type FormatAction } from "./richMarkdown";
const mac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
function shortcut(key: string) {
  return key.replace("Mod", mac ? "⌘" : "Ctrl").replace("Alt", mac ? "⌥" : "Alt").replace("Shift", "⇧").replaceAll("-", " ").toUpperCase();
}
const controls = [
  { action: "bold", Icon: Bold, label: "Bold" },
  { action: "italic", Icon: Italic, label: "Italic" },
  { action: "strike", Icon: Strikethrough, label: "Strikethrough" },
  { action: "code", Icon: Code, label: "Inline code" },
  { action: "bullet", Icon: List, label: "Bullet list" },
  { action: "numbered", Icon: ListOrdered, label: "Numbered list" },
  { action: "task", Icon: ListTodo, label: "Task list" },
  { action: "quote", Icon: Quote, label: "Quote" },
] as const;
export default function FormatToolbar({ onFormat, style, onUndo, onRedo }: {
  onFormat: (action: FormatAction) => void;
  style: FormatAction;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="format-toolbar" role="toolbar" aria-label="Markdown formatting">
      <button type="button" aria-label="Undo" title={`Undo (${shortcut("Mod-z")})`}
        onMouseDown={e => e.preventDefault()} onClick={onUndo}><Undo2 size={15} /></button>
      <button type="button" aria-label="Redo" title={`Redo (${shortcut("Mod-Shift-z")})`}
        onMouseDown={e => e.preventDefault()} onClick={onRedo}><Redo2 size={15} /></button>
      <div className="format-divider" aria-hidden="true" />
      <select aria-label="Paragraph style" title={`Heading style (${shortcut("Mod-Alt-0")}–6)`}
        value={style} onChange={e => onFormat(e.target.value as FormatAction)}>
        <option value="paragraph">Normal text</option>
        {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={`h${level}`}>Heading {level}</option>)}
      </select>
      <div className="format-divider" aria-hidden="true" />
      {controls.map(({ action, Icon, label }) => {
        const key = formatShortcuts.find(binding => binding.action === action)?.key;
        return <button type="button" key={action} title={key ? `${label} (${shortcut(key)})` : label}
          aria-label={label} onMouseDown={e => e.preventDefault()} onClick={() => onFormat(action)}>
          <Icon size={15} />
        </button>;
      })}
    </div>
  );
}
