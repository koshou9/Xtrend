import type { LibraryPort } from "../core/research";
import { remoteLibrary } from "./storage";
import { browser } from "wxt/browser";
import type {
  BarkSettings,
  MonitorEvent,
  MonitorHit,
  PushStatus,
} from "../core/features";
import { barkServer, validBark } from "../core/monitor";
import { aiEndpoint, type AiSettings } from "../core/ai";

export interface HubServices {
  configureAi?(ai: AiSettings, key: string): Promise<void>;
  authorizeAi?(ai: AiSettings): Promise<boolean>;
  checkGrok?(): Promise<boolean>;
  readonly preview?: boolean;
  readonly library?: LibraryPort;
  events(): Promise<MonitorEvent[]>;
  clearEvents(): Promise<void>;
  authorizeBark(config: BarkSettings): Promise<boolean>;
  testBark(): Promise<PushStatus>;
  retry(key: string): Promise<MonitorEvent>;
  watchEvents?(changed: () => void): () => void;
  configureBark(config: BarkSettings): Promise<void>;
  diagnostics(): Promise<Diagnostics>;
  flush(): Promise<void>;
}
export interface Diagnostics {
  version: string;
  checkedAt: number;
  storageBytes: number;
  monitorCount: number;
  barkEnabled: boolean;
  barkPermitted: boolean;
  pages: {
    site: string;
    posts: number;
    lastRead: number;
    capabilities: {
      reposts: boolean;
      quotes: boolean;
      grok: boolean;
      temporary: boolean;
    };
    error: string;
  }[];
}
let supportsDataConsent: boolean | null = import.meta.env.FIREFOX ? null : true;
if (import.meta.env.FIREFOX && browser.permissions?.getAll)
  void browser.permissions
    .getAll()
    .then((value) => {
      supportsDataConsent = Array.isArray((value as any).data_collection);
    })
    .catch(() => {
      supportsDataConsent = false;
    });
export async function barkPermission(origin: string): Promise<boolean> {
  if (!(await browser.permissions.contains({ origins: [origin] })))
    return false;
  if (!import.meta.env.FIREFOX) return true;
  const permissions = await browser.permissions.getAll();
  return (
    Array.isArray((permissions as any).data_collection) &&
    (permissions as any).data_collection.includes("websiteContent")
  );
}
async function message<T>(value: unknown): Promise<T> {
  const result = await browser.runtime.sendMessage(value);
  if (!result?.ok) throw new Error(result?.error ?? "operationFailed");
  return result.value as T;
}
export const hubServices: HubServices = {
  configureAi: (ai, key) => message({ type: "xtrend:ai-config", ai, key }),
  authorizeAi(ai) {
    if (ai.provider === "grok") return Promise.resolve(true);
    const origin = aiEndpoint(ai[ai.provider].endpoint).origin;
    return browser.permissions.request({
      origins: [origin + "/*"],
      ...(import.meta.env.FIREFOX
        ? { data_collection: ["websiteContent"] }
        : {}),
    } as Parameters<typeof browser.permissions.request>[0]);
  },
  async checkGrok() {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) return false;
    try {
      return (
        (await browser.tabs.sendMessage(tab.id, {
          type: "xtrend:grok-check",
        })) === true
      );
    } catch {
      return false;
    }
  },
  library: remoteLibrary,
  configureBark: (bark) => message({ type: "xtrend:bark-config", bark }),
  diagnostics: () => message({ type: "xtrend:diagnostics" }),
  flush: () => message({ type: "xtrend:monitor-flush" }),
  events: () => message({ type: "xtrend:monitor-list" }),
  clearEvents: () => message({ type: "xtrend:monitor-clear" }),
  authorizeBark(config) {
    if (!validBark(config)) return Promise.reject(new Error("invalidBark"));
    if (supportsDataConsent === null)
      return Promise.reject(new Error("permissionPending"));
    if (!supportsDataConsent)
      return Promise.reject(new Error("firefoxUpgrade"));
    // Request synchronously in the user's click handler, before storage or other awaits.
    const permissions = {
      origins: [barkServer(config.server).origin + "/*"],
      ...(import.meta.env.FIREFOX
        ? { data_collection: ["websiteContent"] }
        : {}),
    };
    return browser.permissions.request(
      permissions as Parameters<typeof browser.permissions.request>[0],
    );
  },
  testBark: () => message({ type: "xtrend:bark-test" }),
  retry: (key) => message({ type: "xtrend:monitor-retry", key }),
  watchEvents(changed) {
    const listener: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      if (area === "local" && changes["monitor-events:v1"]) changed();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  },
};
export async function reportMonitor(hit: MonitorHit): Promise<void> {
  const entry = await message({ type: "xtrend:monitor-hit", hit });
  if (!entry) throw new Error("notRecorded");
}
