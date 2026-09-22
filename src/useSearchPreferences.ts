import { useEffect, useState, type SetStateAction } from "react";
import { defaultSearchOptions, type SearchOptions } from "./searchOptions";

type SearchPreferences = { options: SearchOptions; advanced: boolean };

// A multi-folder workspace has one search configuration, independent of folder
// order, the active document, and the Current tab / Everywhere scope toggle.
export function searchPreferencesKey(roots: string[]): string {
  return `nova-search-preferences-v1:${JSON.stringify([...new Set(roots)].sort())}`;
}

function readPreferences(key: string): SearchPreferences {
  const preferences = { options: { ...defaultSearchOptions }, advanced: false };
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return preferences;
    preferences.advanced = value.advanced === true;
    for (const option of ["caseSensitive", "wholeWord", "regexp"] as const) {
      if (typeof value.options?.[option] === "boolean") preferences.options[option] = value.options[option];
    }
    for (const option of ["include", "exclude"] as const) {
      if (typeof value.options?.[option] === "string") preferences.options[option] = value.options[option];
    }
  } catch { /* Missing, corrupt, or unavailable storage uses the defaults. */ }
  return preferences;
}

export function useSearchPreferences(roots: string[]) {
  const key = searchPreferencesKey(roots);
  const [saved, setSaved] = useState(() => ({ key, ...readPreferences(key) }));
  // Reset before committing a changed workspace, so its searches never run with
  // the previous workspace's filters or overwrite that workspace's preferences.
  if (saved.key !== key) setSaved({ key, ...readPreferences(key) });
  useEffect(() => {
    if (saved.key !== key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ options: saved.options, advanced: saved.advanced }));
    } catch { /* Search remains usable if storage is unavailable or full. */ }
  }, [key, saved]);

  const setOptions = (update: SetStateAction<SearchOptions>) => setSaved(previous => ({
    ...previous, options: typeof update === "function" ? update(previous.options) : update,
  }));
  const setAdvanced = (update: SetStateAction<boolean>) => setSaved(previous => ({
    ...previous, advanced: typeof update === "function" ? update(previous.advanced) : update,
  }));
  return { options: saved.options, advanced: saved.advanced, setOptions, setAdvanced };
}
