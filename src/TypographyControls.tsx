import PreferenceSelect from "./PreferenceSelect";

export const textSizes = ["small", "default", "large", "extra-large"] as const;
const sizeLabels = { small: "Small", default: "Default", large: "Large", "extra-large": "Extra large" };
export const editorFonts = ["default", "dm-sans", "lora", "system", "mono"] as const;
export type EditorFont = (typeof editorFonts)[number];
const fontLabels = { default: "Default", "dm-sans": "DM Sans", lora: "Lora", system: "System", mono: "Monospace" };

type ControlProps<T extends string> = {
  id?: string;
  toolbar?: boolean;
  value: T;
  onChange: (value: T) => void;
};

export function TextSizeControl(props: ControlProps<string>) {
  return <PreferenceSelect {...props} label="Text size" options={textSizes} labels={sizeLabels} />;
}

export function FontControl(props: ControlProps<EditorFont>) {
  return <PreferenceSelect {...props} label="Font" options={editorFonts} labels={fontLabels} />;
}
