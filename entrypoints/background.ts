import { browser } from "wxt/browser";
import {
  nativeTabMessage,
  cleanupNativeTabs,
} from "../src/platform/native-tabs";
import {
  MonitorEngine,
  postBark,
  validateBark,
  barkServer,
} from "../src/core/monitor";
import { GraphCache } from "../src/core/cache";
import { cleanGraph } from "../src/core/wire";
import { Preferences } from "../src/core/preferences";
import { loadSettings, localStoragePort } from "../src/platform/storage";
import { barkPermission } from "../src/platform/monitoring";

export default defineBackground(() => {
  const preferences = new Preferences(localStoragePort),
    cache = new GraphCache(localStoragePort);
  const engine = new MonitorEngine(
    localStoragePort,
    loadSettings,
    (hit, settings, batch) =>
      postBark(hit, settings, barkPermission, fetch, batch),
  );
  const pages = new Map<
    number,
    {
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
    }
  >();
  const maintenance = () =>
    Promise.all([engine.flush(), cache.prune(), cleanupNativeTabs()]);
  void maintenance().catch(() => {});
  browser.alarms.create("xtrend-local-maintenance", { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "xtrend-local-maintenance")
      void maintenance().catch(() => {});
  });
  browser.tabs.onRemoved.addListener((id) => {
    pages.delete(id);
    void cleanupNativeTabs(id).catch(() => {});
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !message ||
      typeof message.type !== "string" ||
      !message.type.startsWith("xtrend:")
    )
      return;
    const value = message as Record<string, any>;
    const extension =
      sender.id === browser.runtime.id &&
      !!sender.url?.startsWith(browser.runtime.getURL("/"));
    const page =
      sender.id === browser.runtime.id &&
      sender.frameId === 0 &&
      sender.tab?.id !== undefined &&
      /^https:\/\/(x\.com|pro\.x\.com)\//.test(sender.url ?? "");
    const work = async () => {
      if (!extension && !page) throw new Error("operationFailed");
      if (value.type.startsWith("xtrend:native-") && page)
        return nativeTabMessage(value, sender);
      if (value.type === "xtrend:settings-update")
        return preferences.update(value.patch);
      if (value.type === "xtrend:bark-config") {
        if (!extension || !value.bark || typeof value.bark !== "object")
          throw new Error("operationFailed");
        const previous = await preferences.read(),
          next = validateBark({ ...previous.bark, ...value.bark });
        if (
          next.enabled &&
          !(await barkPermission(barkServer(next.server).origin + "/*"))
        )
          throw new Error("permissionDenied");
        return preferences.update({ bark: next }, true);
      }
      if (value.type === "xtrend:cache-clear") return cache.clear();
      if (["xtrend:cache-get", "xtrend:cache-put"].includes(value.type)) {
        if (
          typeof value.account !== "string" ||
          !/^\w{1,50}$/.test(value.account) ||
          typeof value.tweetId !== "string" ||
          !/^\d{1,30}$/.test(value.tweetId) ||
          !["repost", "quote"].includes(value.kind)
        )
          throw new Error("operationFailed");
        if (value.type === "xtrend:cache-get")
          return cache.get(value.account, value.tweetId, value.kind);
        const clean = cleanGraph(value.page);
        if (!clean) throw new Error("operationFailed");
        return cache.put(value.account, value.tweetId, value.kind, clean);
      }
      if (value.type === "xtrend:health-report" && page) {
        const v = value.health ?? {},
          capabilities = v.capabilities ?? {};
        pages.set(sender.tab!.id!, {
          site: new URL(sender.url!).hostname,
          posts: Number.isInteger(v.posts)
            ? Math.min(1500, Math.max(0, v.posts))
            : 0,
          lastRead:
            typeof v.lastRead === "number" && v.lastRead <= Date.now()
              ? v.lastRead
              : 0,
          capabilities: {
            reposts: capabilities.reposts === true,
            quotes: capabilities.quotes === true,
            grok: capabilities.grok === true,
            temporary: capabilities.temporary === true,
          },
          error: ["monitorFailed", "connectionFailed"].includes(v.error)
            ? v.error
            : "",
        });
        return null;
      }
      if (value.type === "xtrend:monitor-hit" && page)
        return engine.record(value.hit);
      if (!extension) throw new Error("operationFailed");
      if (value.type === "xtrend:diagnostics") {
        await cache.prune();
        const records = await engine.list(),
          settings = await preferences.read(),
          stored = await browser.storage.local.get(null);
        return {
          version: browser.runtime.getManifest().version,
          checkedAt: Date.now(),
          storageBytes: new TextEncoder().encode(JSON.stringify(stored)).length,
          monitorCount: records.length,
          barkEnabled: settings.bark.enabled,
          barkPermitted: settings.bark.enabled
            ? await barkPermission(
                barkServer(settings.bark.server).origin + "/*",
              )
            : false,
          pages: [...pages.values()],
        };
      }
      if (value.type === "xtrend:monitor-list") return engine.list();
      if (value.type === "xtrend:monitor-clear") return engine.clear();
      if (value.type === "xtrend:monitor-flush") return engine.flush();
      if (
        value.type === "xtrend:monitor-retry" &&
        typeof value.key === "string" &&
        value.key.length <= 100
      )
        return engine.retry(value.key);
      if (value.type === "xtrend:bark-test")
        return engine.test({
          id: "0",
          account: "test",
          author: { name: "Xtrend test", handle: "xtrend" },
          url: "https://x.com/",
          views: null,
          velocity: null,
          reasons: ["keyword:connection-test"],
          at: Date.now(),
        });
      throw new Error("operationFailed");
    };
    void work()
      .then((result) => sendResponse({ ok: true, value: result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error &&
            [
              "barkDisabled",
              "permissionDenied",
              "settingsTooLarge",
              "invalidRequest",
              "invalidPrompt",
              "temporaryUnavailable",
              "refreshConnection",
              "rateLimited",
              "accessDenied",
              "requestFailed",
              "cancelled",
              "unrecognizedResponse",
            ].includes(error.message)
              ? error.message
              : "operationFailed",
        }),
      );
    return true;
  });
});
