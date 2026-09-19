export const textWidths = ["narrow", "default", "wide", "full"] as const;
export type TextWidth = (typeof textWidths)[number];

export default function TextWidthControl({ id, value, onChange }: {
  id?: string;
  value: TextWidth;
  onChange: (value: TextWidth) => void;
}) {
  return <select id={id} aria-label="Text width" value={value}
    onChange={(event) => onChange(event.target.value as TextWidth)}>
    <option value="narrow">Narrow</option>
    <option value="default">Default</option>
    <option value="wide">Wide</option>
    <option value="full">Full width</option>
  </select>;
}
