import type { Settings } from "./types";
import type { StoragePort } from "./cache";
import { defaultSettings, validateSettings } from "./settings";

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object
    ? Partial<Settings[K]>
    : Settings[K];
};
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function difference(
  before: unknown,
  after: unknown,
): Record<string, unknown> {
  if (!plain(before) || !plain(after)) return {};
  return Object.fromEntries(
    [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(
      (key) => {
        const value = after[key];
        if (!(key in after)) return [[key, null]];
        if (JSON.stringify(value) === JSON.stringify(before[key])) return [];
        return [
          [
            key,
            plain(value) && plain(before[key])
              ? difference(before[key], value)
              : value,
          ],
        ];
      },
    ),
  );
}
export function mergeSettings(base: Settings, patch: unknown): Settings {
  const merge = (a: unknown, b: unknown): unknown =>
    plain(a) && plain(b)
      ? Object.fromEntries(
          [...new Set([...Object.keys(a), ...Object.keys(b)])]
            .filter(
              (k) => !["__proto__", "constructor", "prototype"].includes(k),
            )
            .map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]]),
        )
      : b;
  return validateSettings(merge(base, plain(patch) ? patch : {}));
}
export class Preferences {
  private queue = Promise.resolve();
  constructor(private storage: StoragePort) {}
  read = async () =>
    validateSettings(
      (await this.storage.get("settings:v1")) ?? defaultSettings(),
    );
  update(patch: unknown, allowBark = false): Promise<Settings> {
    const task = this.queue.then(async () => {
      const previous = await this.read(),
        next = mergeSettings(previous, patch);
      // Only the dedicated, permission-checked popup operation can turn Bark on or change its destination.
      if (!allowBark)
        next.bark = {
          ...previous.bark,
          enabled:
            plain(patch) && plain(patch.bark) && patch.bark.enabled === false
              ? false
              : previous.bark.enabled,
        };
      if (new TextEncoder().encode(JSON.stringify(next)).length > 750000)
        throw new Error("settingsTooLarge");
      await this.storage.set("settings:v1", next);
      return next;
    });
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
}
