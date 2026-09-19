import type { FormatAction } from "./richMarkdown";
export default function FormatToolbar({
  onFormat,
}: {
  onFormat: (action: FormatAction) => void;
}) {
  return (
    <div
      className="format-toolbar"
      role="toolbar"
      aria-label="Markdown formatting"
    >
      <select
        aria-label="Paragraph style"
        value=""
        onChange={(e) => onFormat(e.target.value as FormatAction)}
      >
        <option value="" disabled>
          Text style
        </option>
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      {(
        [
          ["bold", "B", "Bold"],
          ["italic", "I", "Italic"],
          ["strike", "S", "Strikethrough"],
          ["code", "<>", "Inline code"],
          ["bullet", "• List", "Bullet list"],
          ["task", "☐", "Task list"],
          ["quote", "❝", "Quote"],
        ] as const
      ).map(([action, label, title]) => (
        <button
          key={action}
          title={title}
          aria-label={title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(action)}
        >
          {label}
        </button>
      ))}
      <span>Markdown, styled as you type</span>
    </div>
  );
}
