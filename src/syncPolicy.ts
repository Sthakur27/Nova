/** Selection only: inclusion is not evidence that a file has been uploaded. */
export type SyncPolicy = { version: 1; rules: Record<string, boolean> };
export type SyncChoice = "inherit" | "include" | "exclude";
export function syncIncluded(policy: SyncPolicy | undefined, path: string): boolean {
  let current = path;
  for (;;) {
    const rule = policy?.rules[current];
    if (typeof rule === "boolean") return rule;
    if (!current) return false;
    const slash = current.lastIndexOf("/");
    current = slash < 0 ? "" : current.slice(0, slash);
  }
}
export function syncChoice(policy: SyncPolicy | undefined, path: string): SyncChoice {
  const rule = policy?.rules[path];
  return typeof rule !== "boolean" ? "inherit" : rule ? "include" : "exclude";
}
export function setSyncChoice(policy: SyncPolicy | undefined, path: string, choice: SyncChoice): SyncPolicy {
  const rules = { ...policy?.rules };
  if (choice === "inherit") delete rules[path];
  else rules[path] = choice === "include";
  return { version: 1, rules };
}
export function syncEntries(paths: string[]): { path: string; directory: boolean }[] {
  const entries = new Map<string, boolean>();
  for (const path of paths) {
    entries.set(path, false);
    for (let slash = path.indexOf("/"); slash >= 0; slash = path.indexOf("/", slash + 1)) {
      entries.set(path.slice(0, slash), true);
    }
  }
  return [...entries].map(([path, directory]) => ({ path, directory })).sort((a, b) => {
    const left = a.path.split("/"), right = b.path.split("/");
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      if (left[i] !== right[i]) return left[i].localeCompare(right[i]);
    }
    return left.length - right.length;
  });
}
export function parseSyncPolicy(value: unknown): SyncPolicy {
  if (!value || typeof value !== "object") throw new Error("Invalid sync choices.");
  const policy = value as Partial<SyncPolicy>;
  if (policy.version !== 1 || !policy.rules || typeof policy.rules !== "object" || Array.isArray(policy.rules)
    || Object.entries(policy.rules).some(([path, rule]) => typeof rule !== "boolean" || (path !== "" &&
      (/[\\\\:\x00-\x1f\x7f]/.test(path) || path.split("/").some(part => !part || part === "." || part === ".." || part === ".nova"))))) {
    throw new Error("Unsupported or invalid sync choices. No files will be synced.");
  }
  return { version: 1, rules: { ...policy.rules } };
}
