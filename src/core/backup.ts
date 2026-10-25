import type { Settings } from "./types";
import { validateSettings } from "./settings";

export function createBackup(settings: Settings): string {
  const { bark: _bark, ...preferences } = validateSettings(settings);
  return JSON.stringify(
    { format: "xtrend-settings", version: 1, preferences },
    null,
    2,
  );
}
export function readBackup(text: string): Partial<Settings> {
  if (new TextEncoder().encode(text).length > 750000)
    throw new Error("invalidBackup");
  let value: { format?: string; version?: number; preferences?: unknown };
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("invalidBackup");
  }
  if (
    value?.format !== "xtrend-settings" ||
    value.version !== 1 ||
    !value.preferences ||
    typeof value.preferences !== "object" ||
    Array.isArray(value.preferences)
  )
    throw new Error("invalidBackup");
  const clean = validateSettings(value.preferences),
    { bark: _bark, ...safe } = clean;
  return { ...safe, monitoring: { ...safe.monitoring, enabled: false } };
}
