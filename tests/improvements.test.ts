import { describe, expect, it } from "vitest";
import {
  Preferences,
  difference,
  mergeSettings,
} from "../src/core/preferences";
import { defaultSettings } from "../src/core/settings";
import { GraphCache, GRAPH_BUDGET } from "../src/core/cache";
import {
  MonitorEngine,
  MONITOR_KEY,
  parseTargets,
  quietNow,
  validateNotifications,
  monitorHit,
  barkPayload,
} from "../src/core/monitor";
import { createBackup, readBackup } from "../src/core/backup";
import { Workspace } from "../src/content/model";
import { Samples } from "../src/core/metrics";
import { toMarkdown } from "../src/core/markdown";
import { parseExactCount } from "../src/content/dom";
import { boundedText } from "../src/core/response";
import { fixtureTweets } from "./fixtures";
import { enhanceDictionaries } from "../src/ui/enhance-i18n";
import type { Settings } from "../src/core/types";
const memory = () => {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(key: string) {
      return structuredClone(data.get(key));
    },
    async set(key: string, value: unknown) {
      data.set(key, structuredClone(value));
    },
    async remove(key: string) {
      data.delete(key);
    },
  };
};
const sample = fixtureTweets()[0]!;
const settings = (): Settings => ({
  ...defaultSettings("en"),
  monitoring: {
    enabled: true,
    accounts: [sample.author.handle],
    keywords: [],
    minViews: 0,
    minVelocity: 0,
  },
  bark: {
    enabled: true,
    server: "https://example.invalid",
    deviceKey: "test_device",
  },
});
const hit = (id: string, at = Date.now()) => ({
  id,
  account: "owner",
  author: sample.author,
  views: 20000,
  velocity: 10000,
  reasons: [`account:@${sample.author.handle}`],
  at,
});
const actions = { jump: () => true, back() {}, fill: () => false };

describe("shared settings safety", () => {
  it("merges different windows without resetting another window’s changes", async () => {
    const storage = memory(),
      prefs = new Preferences(storage);
    await Promise.all([
      prefs.update({ rising: 2000 }),
      prefs.update({ language: "zh" }),
    ]);
    expect(await prefs.read()).toMatchObject({ rising: 2000, language: "zh" });
  });
  it("ordinary stale settings cannot reenable Bark or change its destination", async () => {
    const storage = memory(),
      prefs = new Preferences(storage);
    await prefs.update({ bark: settings().bark }, true);
    const old = await prefs.read();
    await prefs.update({ bark: { enabled: false } });
    await prefs.update({
      ...old,
      rising: 2222,
      bark: { ...old.bark, server: "https://other.invalid" },
    });
    expect((await prefs.read()).bark).toEqual({ ...old.bark, enabled: false });
  });
  it("only changed nested fields are written and deleted column rules can be removed", () => {
    const a = defaultSettings("en"),
      b = { ...a, rankingFields: { ...a.rankingFields, username: true } };
    expect(difference(a, b)).toEqual({ rankingFields: { username: true } });
    const c = {
      ...a,
      columnRules: {
        "pro-column-1": { rankingLimit: 3, minimumViews: 5, monitor: false },
      },
    };
    expect(mergeSettings(c, difference(c, a)).columnRules).toEqual({});
  });
  it("rejects an oversize settings change without damaging the previous settings", async () => {
    const store = memory(),
      prefs = new Preferences(store);
    await prefs.update({ rising: 1234 });
    const huge = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      label: "a".repeat(100),
      terms: Array.from(
        { length: 20 },
        (_, n) => String(n).padStart(2, "0") + "界".repeat(126),
      ),
      match: "any",
      severity: 2,
      enabled: true,
    }));
    await expect(
      prefs.update({ filtering: { customRules: huge, importedRules: huge } }),
    ).rejects.toThrow("settingsTooLarge");
    expect((await prefs.read()).rising).toBe(1234);
  });
  it("ignores prototype properties in incoming patches", () => {
    const value = mergeSettings(
      defaultSettings("en"),
      JSON.parse('{"__proto__":{"polluted":true},"language":"ja"}'),
    );
    expect(value.language).toBe("ja");
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
describe("cache and privacy cleanup", () => {
  it("reading unchanged monitor records does not produce a storage event loop", async () => {
    const store = memory();
    let changes = 0;
    const port = {
      ...store,
      async set(key: string, value: unknown) {
        changes++;
        await store.set(key, value);
      },
      async remove(key: string) {
        changes++;
        await store.remove(key);
      },
    };
    const engine = new MonitorEngine(
      port,
      async () => defaultSettings("en"),
      async () => "off",
    );
    await engine.list();
    await engine.list();
    expect(changes).toBe(0);
  });
  it("retains both writes from independent cache clients", async () => {
    const storage = memory(),
      a = new GraphCache(storage),
      b = new GraphCache(storage);
    await Promise.all([
      a.put("owner", "1", "repost", {
        relations: [],
        cursor: null,
        observedAt: Date.now(),
      }),
      b.put("owner", "2", "repost", {
        relations: [],
        cursor: null,
        observedAt: Date.now(),
      }),
    ]);
    expect(await storage.get("graph-cache:v1")).toHaveLength(2);
  });
  it("clears expired monitor records from the actual store on read", async () => {
    let now = Date.now();
    const store = memory(),
      engine = new MonitorEngine(
        store,
        async () => settings(),
        async () => "sent",
        () => now,
      );
    await engine.record(hit("1", now));
    now += 31 * 86400000;
    expect(await engine.list()).toHaveLength(0);
    expect(await store.get(MONITOR_KEY)).toBeUndefined();
  });
  it("does not create a monitoring history key when unused", async () => {
    const store = memory(),
      engine = new MonitorEngine(
        store,
        async () => defaultSettings("en"),
        async () => "off",
      );
    await engine.flush();
    await engine.list();
    expect(await store.get(MONITOR_KEY)).toBeUndefined();
  });
  it("reserves graph space bounded to at most 5MB", () => {
    expect(GRAPH_BUDGET).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
  it("prunes an older cache that exceeds the new budget", async () => {
    const store = memory();
    await store.set(
      "graph-cache:v1",
      Array.from({ length: 100 }, (_, i) => ({
        account: "owner",
        tweetId: String(i),
        kind: "quote",
        touchedAt: Date.now() - i,
        page: {
          cursor: null,
          observedAt: Date.now(),
          relations: [
            {
              kind: "quote",
              author: sample.author,
              tweet: { ...sample, text: "x".repeat(50000) },
            },
          ],
        },
      })),
    );
    await new GraphCache(store).prune();
    expect(
      new TextEncoder().encode(
        JSON.stringify(await store.get("graph-cache:v1")),
      ).length,
    ).toBeLessThanOrEqual(GRAPH_BUDGET);
  });
});
describe("notification delivery controls", () => {
  it("bounds merged Unicode notification payloads without including post text", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      ...hit(String(i)),
      url: `https://x.com/fixture/status/${i}`,
      author: { name: "界".repeat(200), handle: "fixture" },
      reasons: ["keyword:" + "界".repeat(100)],
    }));
    const payload = barkPayload(entries[0]!, settings(), entries);
    expect(
      new TextEncoder().encode(JSON.stringify(payload)).length,
    ).toBeLessThanOrEqual(3500);
    expect(payload.body).toContain("…");
    expect(payload.body).not.toContain(sample.text);
  });
  it("counts failed attempts and persists the limit across worker restarts", async () => {
    let now = Date.now(),
      sent = 0;
    const store = memory(),
      send = async () => {
        sent++;
        return "failed" as const;
      };
    for (let i = 0; i < 6; i++) {
      const engine = new MonitorEngine(
        store,
        async () => settings(),
        send,
        () => now,
      );
      await engine.record(hit(String(i + 1), now));
      now += 1000;
    }
    expect(sent).toBe(1);
    const entry = (
      await new MonitorEngine(
        store,
        async () => settings(),
        send,
        () => now,
      ).list()
    )[0]!;
    expect(entry.pushStatus).toBe("backoff");
  });
  it("limits test sends together with automatic and retry sends", async () => {
    const store = memory();
    let sends = 0;
    const engine = new MonitorEngine(
      store,
      async () => settings(),
      async () => {
        sends++;
        return "sent";
      },
    );
    for (let i = 0; i < 5; i++)
      await engine.test({ ...hit("0"), url: "https://x.com/" });
    expect(await engine.test({ ...hit("0"), url: "https://x.com/" })).toBe(
      "limited",
    );
    expect(sends).toBe(5);
  });
  it("holds quiet-hour matches locally and sends them only after the period ends", async () => {
    let now = new Date(2026, 9, 24, 23, 0).getTime(),
      count = 0;
    const config = {
        ...settings(),
        notifications: { ...validateNotifications(null), quietEnabled: true },
      },
      store = memory(),
      engine = new MonitorEngine(
        store,
        async () => config,
        async () => {
          count++;
          return "sent";
        },
        () => now,
      );
    expect((await engine.record(hit("1", now)))?.pushStatus).toBe("quiet");
    await engine.flush();
    expect(count).toBe(0);
    now = new Date(2026, 9, 25, 8, 1).getTime();
    await engine.flush();
    expect(count).toBe(1);
  });
  it("handles quiet intervals that do not cross midnight and disabled intervals", () => {
    const n = {
      ...validateNotifications(null),
      quietEnabled: true,
      quietStart: "09:00",
      quietEnd: "10:00",
    };
    expect(quietNow(n, new Date(2026, 9, 24, 9, 15).getTime())).toBe(true);
    expect(quietNow({ ...n, quietEnd: "09:00" }, Date.now())).toBe(false);
  });
  it("merges at most ten due matches in one request and never sends bodies", async () => {
    let now = Date.now();
    const batches: number[] = [],
      config = {
        ...settings(),
        notifications: { ...validateNotifications(null), mergeMinutes: 1 },
      },
      engine = new MonitorEngine(
        memory(),
        async () => config,
        async (_hit, _settings, batch) => {
          batches.push(batch!.length);
          expect(JSON.stringify(batch)).not.toContain(sample.text);
          return "sent";
        },
        () => now,
      );
    for (let i = 0; i < 12; i++) await engine.record(hit(String(i + 1), now));
    expect(batches).toEqual([]);
    now += 61000;
    await engine.flush();
    expect(batches).toEqual([10, 2]);
  });
  it("does not flush pending notifications after Bark is disabled", async () => {
    let config = {
        ...settings(),
        notifications: { ...validateNotifications(null), mergeMinutes: 1 },
      },
      sends = 0,
      now = Date.now();
    const engine = new MonitorEngine(
      memory(),
      async () => config,
      async () => {
        sends++;
        return "sent";
      },
      () => now,
    );
    await engine.record(hit("1", now));
    config = { ...config, bark: { ...config.bark, enabled: false } };
    now += 61000;
    await engine.flush();
    expect(sends).toBe(0);
    expect((await engine.list())[0]?.pushStatus).toBe("off");
  });
  it("applies individual account thresholds instead of the common values", () => {
    const config = {
      ...settings().monitoring,
      minViews: 999999999,
      targets: parseTargets(`account | ${sample.author.handle} | 1 | 0`),
    };
    expect(monitorHit(sample, config, "owner")).not.toBeNull();
    expect(() => parseTargets("account | invalid handle | 1 | 0")).toThrow();
    expect(() => parseTargets("keyword | ai | -1 | 0")).toThrow();
  });
});
describe("bounded page tools", () => {
  it("never turns compact or grouped uncertain counts into a small exact number", () => {
    for (const value of [
      "12K Views",
      "12 K Views",
      "10万 次查看",
      "10 万 次查看",
      "1.2M Views",
      "2 million views",
      "1 234 views",
    ])
      expect(parseExactCount(value)).toBeNull();
    expect(parseExactCount("12,345 Views")).toBe(12345);
    expect(parseExactCount("0 Replies")).toBe(0);
  });
  it("ignores an old decreasing read rather than resetting valid growth", () => {
    const samples = new Samples();
    samples.update({
      ...sample,
      observedAt: 1000,
      counts: { ...sample.counts, views: 100 },
    });
    samples.update({
      ...sample,
      observedAt: 61000,
      counts: { ...sample.counts, views: 200 },
    });
    samples.update({
      ...sample,
      observedAt: 2000,
      counts: { ...sample.counts, views: 1 },
    });
    expect(samples.get(sample.id)).toBe(6000);
  });
  it("evicts samples and trend points with old tweets", () => {
    const model = new Workspace(
      defaultSettings("en"),
      memory(),
      async () => {},
      actions,
    );
    try {
      for (let i = 0; i < 1600; i++)
        model.upsert({ ...sample, id: String(i + 1) }, false);
      expect(model.samples.size).toBe(1500);
      expect(model.get("1")).toBeUndefined();
    } finally {
      model.destroy();
    }
  });
  it("keeps at most sixty actual readings and exposes the measurement interval", () => {
    const samples = new Samples();
    for (let i = 0; i < 100; i++)
      samples.update({
        ...sample,
        observedAt: i * 60000,
        counts: { ...sample.counts, views: i * 100 },
      });
    expect(samples.info(sample.id).points).toHaveLength(60);
    expect(samples.info(sample.id).interval).toEqual({
      from: 98 * 60000,
      to: 99 * 60000,
    });
  });
  it("keeps column ranking and monitoring choices separate", async () => {
    const reports: string[] = [],
      config = {
        ...settings(),
        columnRules: {
          "pro-column-1": { rankingLimit: 2, minimumViews: 3, monitor: false },
        },
      },
      model = new Workspace(config, memory(), async () => {}, {
        ...actions,
        monitor: async (h) => {
          reports.push(h.id);
        },
      });
    try {
      model.upsert(sample, false);
      model.place(sample.id, "pro-column-1");
      model.seen(sample.id);
      model.columns(["pro-column-1", "pro-column-2"]);
      model.column("pro-column-2");
      expect(model.snapshot().ranked).toHaveLength(0);
      model.column("pro-column-1");
      expect(model.snapshot().ranked).toHaveLength(1);
      expect(model.rankingSettings().rankingLimit).toBe(2);
      expect(reports).toHaveLength(0);
    } finally {
      model.destroy();
    }
  });
  it("clears manual selections and temporary restores on navigation reset", () => {
    const model = new Workspace(
      defaultSettings("en"),
      memory(),
      async () => {},
      actions,
    );
    try {
      model.upsert(sample);
      model.filtered([{ id: sample.id, reason: "blacklist" }]);
      model.restore(sample.id);
      model.select(sample.id);
      expect(model.selected()).toHaveLength(1);
      expect(model.isRestored(sample.id)).toBe(true);
      model.reset();
      expect(model.selected()).toHaveLength(0);
      expect(model.isRestored(sample.id)).toBe(false);
    } finally {
      model.destroy();
    }
  });
  it("cancels oversized streamed bodies before reading all chunks", async () => {
    let count = 0,
      cancelled = false;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          count++;
          controller.enqueue(new Uint8Array(100));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    await expect(boundedText(response, 150)).rejects.toThrow(
      "responseTooLarge",
    );
    expect(count).toBeLessThanOrEqual(4);
    expect(cancelled).toBe(true);
  });
  it("roundtrips UTF-8 across chunk boundaries in bounded responses", async () => {
    const bytes = new TextEncoder().encode("中文🙂");
    const response = new Response(
      new ReadableStream({
        start(c) {
          for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
          c.close();
        },
      }),
    );
    expect(await boundedText(response, 100)).toBe("中文🙂");
  });
});
describe("portable settings and language completeness", () => {
  it("localizes Markdown notices and preserves literal headings and ordered lists", () => {
    const text = toMarkdown(
      { ...sample, text: "# Heading\n1. Item", complete: false },
      "zh",
    );
    expect(text).toContain("\\# Heading");
    expect(text).toContain("1\\. Item");
    expect(text).toContain("正文不完整");
    expect(text).not.toContain("Incomplete text");
  });
  it("excludes credentials and records from backups and restores with monitoring off", () => {
    const config = settings(),
      text = createBackup(config);
    expect(text).not.toContain(config.bark.deviceKey);
    expect(text).not.toContain("deviceKey");
    const imported = readBackup(text);
    expect(imported).not.toHaveProperty("bark");
    expect(imported.monitoring?.enabled).toBe(false);
    expect(imported.monitoring?.accounts).toEqual(config.monitoring.accounts);
  });
  it("rejects unrelated and oversized backup files", () => {
    expect(() => readBackup("{}")).toThrow("invalidBackup");
    expect(() => readBackup("x".repeat(750001))).toThrow("invalidBackup");
  });
  it("provides complete new controls in three languages", () => {
    expect(Object.keys(enhanceDictionaries.zh).sort()).toEqual(
      Object.keys(enhanceDictionaries.en).sort(),
    );
    expect(Object.keys(enhanceDictionaries.ja).sort()).toEqual(
      Object.keys(enhanceDictionaries.en).sort(),
    );
  });
});
