import { browser } from "wxt/browser";
import { defaultSettings, validateSettings } from "../core/settings";
import type { Settings } from "../core/types";
import type { StoragePort } from "../core/cache";
import { difference } from "../core/preferences";
import type { GraphPage } from "../core/types";
import { LIBRARY_KEY, type LibraryPort } from "../core/research";

export const localStoragePort: StoragePort = {
  async get(key) {
    return (await browser.storage.local.get(key))[key];
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await browser.storage.local.remove(key);
  },
};
export async function loadSettings(): Promise<Settings> {
  return validateSettings(
    (await localStoragePort.get("settings:v1")) ?? defaultSettings(),
  );
}
async function request<T>(message: unknown): Promise<T> {
  const result = await browser.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error ?? "saveFailed");
  return result.value as T;
}
export async function saveSettings(
  value: Settings,
  previous?: Settings,
): Promise<Settings> {
  const patch = difference(
    previous ?? (await loadSettings()),
    validateSettings(value),
  );
  return request<Settings>({ type: "xtrend:settings-update", patch });
}
export const remoteGraphCache = {
  get: (account: string, tweetId: string, kind: "repost" | "quote") =>
    request<GraphPage | null>({
      type: "xtrend:cache-get",
      account,
      tweetId,
      kind,
    }),
  put: (
    account: string,
    tweetId: string,
    kind: "repost" | "quote",
    page: GraphPage,
  ) =>
    request<void>({ type: "xtrend:cache-put", account, tweetId, kind, page }),
  clear: () => request<void>({ type: "xtrend:cache-clear" }),
};
export const remoteLibrary: LibraryPort = {
  list: () => request({ type: "xtrend:saved-list" }),
  save: (entry) => request({ type: "xtrend:saved-save", entry }),
  remove: (id) => request({ type: "xtrend:saved-remove", id }),
  restore: (entries) => request({ type: "xtrend:saved-restore", entries }),
  watch(changed) {
    const listener: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && changes[LIBRARY_KEY]) changed();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  },
};
export function watchSettings(fn: (settings: Settings) => void) {
  const listener: Parameters<
    typeof browser.storage.onChanged.addListener
  >[0] = (changes, area) => {
    if (area === "local" && changes["settings:v1"])
      fn(validateSettings(changes["settings:v1"].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
