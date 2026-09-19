import PreferenceSelect from "./PreferenceSelect";
export const textWidths = ["narrow", "default", "wide", "full"] as const;
export type TextWidth = (typeof textWidths)[number];
const labels: Record<TextWidth, string> = { narrow: "Narrow", default: "Default", wide: "Wide", full: "Full width" };

export default function TextWidthControl(props: {
  id?: string;
  toolbar?: boolean;
  value: TextWidth;
  onChange: (value: TextWidth) => void;
}) {
  return <PreferenceSelect {...props} label="Text width" options={textWidths} labels={labels} />;
}
