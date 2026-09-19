import { useState } from "react";

// Keep existing keys so settings and the quick controls share saved preferences.
export function usePreference<T extends string | boolean>(key: string, fallback: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`nova:${key}:v1`);
      if (typeof fallback === "boolean")
        return (stored === "on" ? true : stored === "off" ? false : fallback) as T;
      return stored !== null && (!allowed || allowed.includes(stored as T)) ? stored as T : fallback;
    } catch { return fallback; }
  });
  const [error, setError] = useState(false);
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(`nova:${key}:v1`, typeof next === "boolean" ? next ? "on" : "off" : next);
      setError(false);
    } catch { setError(true); }
  };
  return [value, update, error] as const;
}
