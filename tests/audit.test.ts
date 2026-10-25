import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTweet } from "../src/core/normalize";
import {
  cleanHit,
  MonitorEngine,
  monitorHit,
  parseTargets,
  validateMonitoring,
} from "../src/core/monitor";
import { defaultSettings } from "../src/core/settings";
import { fixtureTweets, NOW, rawTweet } from "./fixtures";
import type { MonitorHit } from "../src/core/features";
import { ARTICLE, fillReply, tweetId } from "../src/content/dom";

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
const sample = () => fixtureTweets(NOW)[0]!;
const watch = () => ({
  enabled: true,
  accounts: [sample().author.handle],
  keywords: [],
  minViews: 0,
  minVelocity: 0,
});
const hit = (): MonitorHit => ({
  id: sample().id,
  account: "owner",
  author: sample().author,
  url: sample().url,
  views: 148000,
  velocity: 74000,
  reasons: [`account:@${sample().author.handle}`],
  at: NOW,
});

describe("full audit regressions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not create a new monitor match from a stale view reading", () => {
    expect(monitorHit(sample(), watch(), "owner", NOW + 300001)).toBeNull();
  });
  it("rejects fractional or unsafe view counts instead of displaying them as real views", () => {
    for (const views of [1.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(cleanHit({ ...hit(), views })).toBeNull();
  });
  it("does not assign the current time to malformed or future matches", () => {
    for (const at of [undefined, NaN, Infinity, -1, NOW + 1])
      expect(cleanHit({ ...hit(), at })).toBeNull();
  });
  it("rejects stale and future incoming monitor messages before recording or sending", async () => {
    const storage = memory(),
      config = { ...defaultSettings("en"), monitoring: watch() },
      engine = new MonitorEngine(
        storage,
        async () => config,
        async () => "off",
        () => NOW,
      );
    expect(await engine.record({ ...hit(), at: NOW - 300001 })).toBeNull();
    expect(await engine.record({ ...hit(), at: NOW + 1 })).toBeNull();
    expect(await engine.list()).toHaveLength(0);
  });
  it("does not lose a qualifying ninth watch condition when earlier matches fail their thresholds", () => {
    const words = Array.from({ length: 9 }, (_, i) => `word${i}`);
    const config = {
      ...watch(),
      accounts: [],
      keywords: words.slice(0, 8),
      minViews: 1000000,
      targets: [
        {
          kind: "keyword" as const,
          value: words[8]!,
          minViews: 0,
          minVelocity: 0,
        },
      ],
    };
    const result = monitorHit(
      { ...sample(), text: words.join(" ") },
      config,
      "owner",
      NOW,
    );
    expect(result).not.toBeNull();
    expect(result?.reasons).toContain("keyword:word8");
  });
  it("keeps an @ prefix when it is part of a watched keyword", () => {
    expect(parseTargets("keyword | @ＧＲＯＫ | 0 | 0")[0]?.value).toBe("@grok");
    expect(
      validateMonitoring({
        ...watch(),
        targets: [
          { kind: "keyword", value: "@ＧＲＯＫ", minViews: 0, minVelocity: 0 },
        ],
      }).targets?.[0]?.value,
    ).toBe("@grok");
  });
  it("rejects malformed account targets when loading saved settings", () => {
    expect(
      validateMonitoring({
        enabled: true,
        targets: [
          {
            kind: "account",
            value: "bad account!",
            minViews: 0,
            minVelocity: 0,
          },
        ],
      }).enabled,
    ).toBe(false);
  });
  it("does not send queued notifications after monitoring itself has been disabled", async () => {
    let now = NOW,
      sends = 0;
    const storage = memory();
    let config = {
      ...defaultSettings("en"),
      monitoring: watch(),
      bark: {
        enabled: true,
        server: "https://example.invalid",
        deviceKey: "test_only",
      },
      notifications: {
        ...defaultSettings("en").notifications,
        mergeMinutes: 1,
      },
    };
    const engine = new MonitorEngine(
      storage,
      async () => config,
      async () => {
        sends++;
        return "sent";
      },
      () => now,
    );
    expect((await engine.record(hit()))?.pushStatus).toBe("queued");
    config = {
      ...config,
      monitoring: { ...config.monitoring, enabled: false },
    };
    now += 61000;
    await engine.flush();
    expect(sends).toBe(0);
    expect((await engine.list())[0]?.pushStatus).toBe("off");
  });
  it("tolerates malformed media and URL entity fields without losing the valid post", () => {
    for (const invalid of [{}, [null, 1, "invalid"]]) {
      const raw = rawTweet();
      Object.assign(raw.legacy, {
        entities: { urls: invalid },
        extended_entities: { media: invalid },
      });
      expect(() => normalizeTweet(raw, NOW)).not.toThrow();
      expect(normalizeTweet(raw, NOW)?.counts.views).toBe(48000);
    }
  });
  it("never fills a different post whose ID merely starts with the selected ID", () => {
    const post = sample(),
      editor = { focus() {} },
      article = {
        querySelector: () => ({
          closest: () => ({ getAttribute: () => `/reader/status/${post.id}` }),
        }),
        closest: () => ({ querySelector: () => editor }),
      };
    vi.stubGlobal("location", { pathname: `/reader/status/${post.id}0` });
    vi.stubGlobal("document", {
      querySelector: () => null,
      querySelectorAll: () => [article],
      createRange: () => ({ selectNodeContents() {} }),
      execCommand: () => true,
    });
    vi.stubGlobal("window", { getSelection: () => null });
    expect(fillReply(post, "draft")).toBe(false);
  });
  it("never identifies an unrelated reply dialog by empty or duplicated post text", () => {
    const editor = { focus() {} },
      dialog = {
        textContent: "Repeated text",
        querySelector: (selector: string) =>
          selector.startsWith("[data-testid") ? editor : null,
        querySelectorAll: () => [],
      };
    vi.stubGlobal("document", {
      querySelector: () => dialog,
      createRange: () => ({ selectNodeContents() {} }),
      execCommand: () => true,
    });
    vi.stubGlobal("window", { getSelection: () => null });
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    for (const text of ["", "Repeated text"])
      expect(fillReply({ ...sample(), text }, "draft")).toBe(false);
  });
  it("fills only the explicitly identified dialog and only inserts text", () => {
    const post = sample(),
      editor = { focus() {} },
      insert = vi.fn(() => true),
      dialog = {
        querySelector: () => editor,
        querySelectorAll: () => [
          { getAttribute: () => `/reader/status/${post.id}` },
        ],
      };
    vi.stubGlobal("document", {
      querySelector: () => dialog,
      createRange: () => ({ selectNodeContents() {} }),
      execCommand: insert,
    });
    vi.stubGlobal("window", { getSelection: () => null });
    expect(fillReply(post, "review this draft")).toBe(true);
    expect(insert).toHaveBeenCalledExactlyOnceWith(
      "insertText",
      false,
      "review this draft",
    );
  });
  it("never accepts test-only article markers as a real X post", () => {
    const element = {
      querySelector: () => null,
      hasAttribute: () => true,
      getAttribute: () => "12345",
    } as unknown as Element;
    expect(tweetId(element)).toBeNull();
    expect(ARTICLE).not.toContain("fixture");
  });
  it("keeps the original reading time separate from the time a match was detected", async () => {
    vi.setSystemTime(NOW + 60000);
    const incoming = monitorHit(sample(), watch(), "owner")!;
    expect(incoming.observedAt).toBe(NOW);
    const engine = new MonitorEngine(
      memory(),
      async () => ({ ...defaultSettings("en"), monitoring: watch() }),
      async () => "off",
    );
    const record = await engine.record(incoming);
    expect(record?.observedAt).toBe(NOW);
    expect(record?.at).toBe(NOW + 60000);
  });
  it("cannot disguise a stale or future source reading with a new match timestamp", async () => {
    const engine = new MonitorEngine(
      memory(),
      async () => ({ ...defaultSettings("en"), monitoring: watch() }),
      async () => "off",
    );
    expect(
      await engine.record({ ...hit(), observedAt: NOW - 300001 }),
    ).toBeNull();
    expect(await engine.record({ ...hit(), observedAt: NOW + 1 })).toBeNull();
  });
});
