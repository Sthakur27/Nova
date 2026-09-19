import PreferenceSelect from "./PreferenceSelect";
export const lineSpacings = ["compact", "default", "relaxed", "spacious"] as const;
export type LineSpacing = (typeof lineSpacings)[number];
const labels: Record<LineSpacing, string> = { compact: "Compact", default: "Default", relaxed: "Relaxed", spacious: "Spacious" };

export default function LineSpacingControl(props: {
  id?: string;
  toolbar?: boolean;
  value: LineSpacing;
  onChange: (value: LineSpacing) => void;
}) {
  return <PreferenceSelect {...props} label="Line spacing" options={lineSpacings} labels={labels} />;
}
