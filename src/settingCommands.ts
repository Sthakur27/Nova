export type SettingConfiguration = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

export type SettingCommand = {
  id: string;
  label: string;
  description: string;
  keywords?: string;
} & ({ configuration: SettingConfiguration; run?: never } | { run: () => void; configuration?: never });

export function toggleSetting(id: string, label: string, value: boolean, set: (value: boolean) => void, keywords = ""): SettingCommand {
  return {
    id, label,
    description: `Currently ${value ? "on" : "off"} · Configure…`,
    keywords: `settings preferences toggle show hide enable disable ${keywords}`,
    configuration: {
      label, value: value ? "on" : "off",
      options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }],
      onChange: next => set(next === "on"),
    },
  };
}

export function settingChoices<T extends string>(id: string, label: string, value: T, options: readonly T[], set: (value: T) => void, labels?: Partial<Record<T, string>>, keywords = ""): SettingCommand[] {
  const display = (option: T) => labels?.[option] ?? option.replaceAll("-", " ").replace(/^./, letter => letter.toUpperCase());
  return [{
    id, label,
    description: `Currently ${display(value)} · Configure…`,
    keywords: `settings preferences ${keywords} ${options.map(display).join(" ")}`,
    configuration: {
      label, value,
      options: options.map(option => ({ value: option, label: display(option) })),
      onChange: next => { if (options.includes(next as T)) set(next as T); },
    },
  }];
}
