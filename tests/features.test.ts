import { describe, expect, it } from "vitest";
import {
  activeRules,
  defaultFiltering,
  filterReason,
  importRules,
  validateFiltering,
  validateRule,
} from "../src/core/filtering";
import {
  contrast,
  PALETTES,
  paletteVariables,
  validPalette,
  validateAppearance,
} from "../src/core/palette";
import {
  barkPayload,
  barkServer,
  cleanHit,
  defaultMonitoring,
  eligibleHit,
  MonitorEngine,
  monitorHit,
  postBark,
  validateMonitoring,
} from "../src/core/monitor";
import { defaultSettings, validateSettings } from "../src/core/settings";
import { normalizeTweet } from "../src/core/normalize";
import { cleanTweet } from "../src/core/wire";
import { Workspace } from "../src/content/model";
import { hubDictionaries } from "../src/ui/hub-i18n";
import { fixtureTweets, rawTweet } from "./fixtures";
import type { MonitorHit, MonitorEvent } from "../src/core/features";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";

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
const sample = () => fixtureTweets()[0]!;
const monitoring = () => ({
  ...defaultMonitoring(),
  enabled: true,
  accounts: [sample().author.handle],
  minViews: 10000,
});
const hit = (id = "1"): MonitorHit => ({
  id,
  account: "local_owner",
  author: { name: "Fixture author", handle: sample().author.handle },
  url: `https://x.com/${sample().author.handle}/status/${id}`,
  views: 20000,
  velocity: 10000,
  reasons: [`account:@${sample().author.handle}`],
  at: Date.now(),
});

describe("real local reply rules", () => {
  it("ships exactly 1 / 23 / 26 actually enabled rules for the three strengths", () => {
    const f = defaultFiltering();
    expect(activeRules({ ...f, strength: "loose" })).toHaveLength(1);
    expect(activeRules(f)).toHaveLength(23);
    expect(activeRules({ ...f, strength: "strict" })).toHaveLength(26);
  });
  it("does nothing while disabled and preserves a legitimate discussion", () => {
    expect(
      filterReason(
        { ...sample(), text: "full video in my bio" },
        defaultFiltering(),
      ),
    ).toBeNull();
    expect(
      filterReason(
        {
          ...sample(),
          text: "Thanks for the analysis. Advertising is an interesting business model.",
        },
        { ...defaultFiltering(), enabled: true },
      ),
    ).toBeNull();
  });
  it("really matches spam at standard strength and generic bait only at strict strength", () => {
    const f = { ...defaultFiltering(), enabled: true };
    expect(filterReason({ ...sample(), text: "Full video in my bio" }, f)).toBe(
      "builtin-5",
    );
    expect(filterReason({ ...sample(), text: "check my bio" }, f)).toBeNull();
    expect(
      filterReason(
        { ...sample(), text: "check my bio" },
        { ...f, strength: "strict" },
      ),
    ).toBe("builtin-25");
  });
  it("applies whitelist before blacklist and phrase matching", () => {
    const f = {
      ...defaultFiltering(),
      enabled: true,
      whitelist: [sample().author.handle],
      blacklist: [sample().author.handle],
    };
    expect(
      filterReason({ ...sample(), text: "full video in my bio" }, f),
    ).toBeNull();
    expect(filterReason(sample(), { ...f, whitelist: [] })).toBe("blacklist");
  });
  it("supports plain-text any/all rules without executing patterns", () => {
    const rule = validateRule(
      {
        id: "fixture",
        label: "Local",
        terms: ["ＡＩ", "offer"],
        match: "all",
        severity: 2,
      },
      "custom",
    )!;
    const f = { ...defaultFiltering(), enabled: true, customRules: [rule] };
    expect(filterReason({ ...sample(), text: "AI OFFER" }, f)).toBe(rule.id);
    expect(filterReason({ ...sample(), text: "AI discussion" }, f)).toBeNull();
  });
  it("keeps rule IDs stable across repeated saves and respects disabled built-ins", () => {
    const rule = validateRule(
      { id: "stable", label: "Test", terms: ["phrase"] },
      "custom",
    )!;
    const f = validateFiltering(
      validateFiltering({
        ...defaultFiltering(),
        customRules: [rule],
        disabledBuiltinIds: ["builtin-5"],
      }),
    );
    expect(f.customRules[0]?.id).toBe(rule.id);
    expect(activeRules(f).some((r) => r.id === "builtin-5")).toBe(false);
  });
  it("imports only bounded declarative JSON rules", () => {
    const text = JSON.stringify({
      version: 1,
      rules: [
        {
          id: "a",
          label: "<script>not executed</script>",
          terms: ["literal .*"],
          match: "any",
        },
      ],
    });
    expect(importRules(text)[0]?.terms).toEqual(["literal .*"]);
    for (const value of [
      "not json",
      '{"version":2,"rules":[]}',
      JSON.stringify({ version: 1, rules: [{ terms: [] }] }),
      "x".repeat(100001),
    ])
      expect(() => importRules(value)).toThrow("invalidRules");
  });
  it("keeps explicit reply relationships through structured data and bridge validation", () => {
    const raw = rawTweet();
    (raw.legacy as any).in_reply_to_status_id_str = "123";
    const tweet = normalizeTweet(raw)!;
    expect(tweet.replyTo).toBe("123");
    expect(cleanTweet(tweet)?.replyTo).toBe("123");
  });
});
describe("custom color cards", () => {
  it("applies every preset with readable light and dark colors", () => {
    for (const p of PALETTES)
      for (const dark of [false, true]) {
        const v = paletteVariables({ selected: p.id, custom: [] }, dark);
        expect(contrast(v["--paper"]!, v["--ink"]!)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrast(v["--paper"]!, v["--accent"]!)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
  });
  it("rejects unreadable or executable color values", () => {
    expect(
      validPalette({
        id: "a",
        name: "Test",
        paper: "#ffffff",
        ink: "#ffffff",
        accent: "#eeeeee",
      }),
    ).toBe(false);
    expect(
      validPalette({
        id: "a",
        name: "Test",
        paper: "url(https://tracker.test)",
        ink: "#000000",
        accent: "#000000",
      }),
    ).toBe(false);
  });
  it("persists real custom colors and safely falls back after deletion", () => {
    const card = {
      id: "custom",
      name: "My blue",
      paper: "#ffffff",
      ink: "#111111",
      accent: "#173d8b",
    };
    const a = validateAppearance({ selected: card.id, custom: [card] });
    expect(paletteVariables(a, false)["--accent"]).toBe(card.accent);
    expect(validateAppearance({ selected: card.id, custom: [] }).selected).toBe(
      "warm",
    );
  });
  it("drops unrelated imported fields and bounds custom card count", () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({
      ...PALETTES[0]!,
      id: `c${i}`,
      secret: "must not persist",
    }));
    const a = validateAppearance({ selected: "c0", custom: cards });
    expect(a.custom).toHaveLength(12);
    expect(JSON.stringify(a)).not.toContain("must not persist");
  });
});
describe("private passive monitoring", () => {
  it("requires a watch condition and matches account OR keyword, then both thresholds", () => {
    expect(validateMonitoring({ enabled: true }).enabled).toBe(false);
    expect(monitorHit(sample(), monitoring(), "owner")).not.toBeNull();
    expect(
      monitorHit(sample(), { ...monitoring(), minViews: 99999999 }, "owner"),
    ).toBeNull();
    expect(
      monitorHit(sample(), { ...monitoring(), minVelocity: 99999999 }, "owner"),
    ).toBeNull();
    expect(
      monitorHit(
        { ...sample(), text: "An ＡＩ update" },
        { ...monitoring(), accounts: [], keywords: ["ai"] },
        "owner",
      )?.reasons,
    ).toEqual(["keyword:ai"]);
  });
  it("does not invent unknown metrics to satisfy a threshold", () => {
    expect(
      monitorHit(
        { ...sample(), counts: { ...sample().counts, views: null } },
        monitoring(),
        "owner",
      ),
    ).toBeNull();
  });
  it("never puts the post body or arbitrary links into hits and push payloads", () => {
    const settings = {
      ...defaultSettings("en"),
      monitoring: monitoring(),
      bark: {
        enabled: true,
        server: "https://push.example.test",
        deviceKey: "fixture_key",
      },
    };
    const tweet = {
        ...sample(),
        text: "PRIVATE FULL BODY that must stay local",
      },
      value = monitorHit(tweet, monitoring(), "owner")!;
    expect(JSON.stringify(value)).not.toContain(tweet.text);
    const clean = cleanHit({
      ...value,
      url: "javascript:alert(1)",
      text: tweet.text,
    })!;
    expect(clean.url).toBe(tweet.url);
    const body = JSON.stringify(barkPayload(clean, settings));
    expect(body).not.toContain(tweet.text);
    expect(body).toContain(tweet.author.name);
  });
  it("only observes viewport-exposed records and never polls X from its display timer", async () => {
    const observed: MonitorHit[] = [];
    const settings = { ...defaultSettings("en"), monitoring: monitoring() };
    const model = new Workspace(settings, memory(), async () => {}, {
      jump: () => true,
      back() {},
      fill: () => false,
      monitor: async (value) => {
        observed.push(value);
      },
    });
    try {
      const tweet = sample();
      model.upsert(tweet, false);
      expect(observed).toHaveLength(0);
      model.seen(tweet.id);
      await Promise.resolve();
      expect(observed).toHaveLength(1);
      model.ingest({
        tweets: [tweet],
        capabilities: {
          reposts: false,
          quotes: false,
          grok: false,
          temporary: false,
        },
      });
      expect(observed).toHaveLength(1);
    } finally {
      model.destroy();
    }
  });
  it("deduplicates across concurrent messages and worker restarts", async () => {
    const storage = memory(),
      settings = {
        ...defaultSettings("en"),
        monitoring: monitoring(),
        bark: {
          enabled: true,
          server: "https://push.example.test",
          deviceKey: "fixture_key",
        },
      };
    let sends = 0;
    const send = async () => {
      sends++;
      return "sent" as const;
    };
    const engine = new MonitorEngine(storage, async () => settings, send);
    await Promise.all([engine.record(hit()), engine.record(hit())]);
    await new MonitorEngine(storage, async () => settings, send).record(hit());
    expect(sends).toBe(1);
    expect(await engine.list()).toHaveLength(1);
    await engine.retry("local_owner:1");
    expect(sends).toBe(1);
  });
  it("stores matches locally while Bark is off and does not push old hits when it is enabled later", async () => {
    const storage = memory();
    let settings = { ...defaultSettings("en"), monitoring: monitoring() },
      sends = 0;
    const engine = new MonitorEngine(
      storage,
      async () => settings,
      async () => {
        sends++;
        return "sent";
      },
    );
    await engine.record(hit());
    settings = {
      ...settings,
      bark: {
        enabled: true,
        server: "https://push.example.test",
        deviceKey: "fixture_key",
      },
    };
    await engine.record(hit());
    expect(sends).toBe(0);
    expect((await engine.list())[0]?.pushStatus).toBe("off");
  });
  it("limits pushes but keeps excess matches and permits explicit retry after cooldown", async () => {
    let now = Date.now();
    const settings = {
      ...defaultSettings("en"),
      monitoring: monitoring(),
      bark: {
        enabled: true,
        server: "https://push.example.test",
        deviceKey: "fixture_key",
      },
    };
    let sends = 0;
    const engine = new MonitorEngine(
      memory(),
      async () => settings,
      async () => {
        sends++;
        return "sent";
      },
      () => now,
    );
    for (let i = 1; i <= 6; i++)
      await engine.record({ ...hit(String(i)), at: now });
    expect(sends).toBe(5);
    expect((await engine.list())[0]?.pushStatus).toBe("limited");
    now += 61000;
    expect((await engine.retry("local_owner:6")).pushStatus).toBe("sent");
    expect(sends).toBe(6);
  });
  it("bounds private history, expires old records and clears only its own store", async () => {
    let now = Date.now();
    const storage = memory(),
      settings = { ...defaultSettings("en"), monitoring: monitoring() },
      engine = new MonitorEngine(
        storage,
        async () => settings,
        async () => "off",
        () => now,
      );
    await storage.set("unrelated", "keep");
    for (let i = 1; i <= 205; i++)
      await engine.record({ ...hit(String(i)), at: now });
    expect(await engine.list()).toHaveLength(200);
    now += 31 * 86400000;
    expect(await engine.list()).toHaveLength(0);
    await engine.clear();
    expect(await storage.get("unrelated")).toBe("keep");
  });
  it("keeps disabled and non-matching monitor traffic out of history", async () => {
    const engine = new MonitorEngine(
      memory(),
      async () => defaultSettings("en"),
      async () => "sent",
    );
    expect(await engine.record(hit())).toBeNull();
    expect(eligibleHit(hit(), { ...monitoring(), accounts: ["another"] })).toBe(
      false,
    );
  });
});
describe("Bark request boundary", () => {
  it("rejects embedded credentials, query tokens and non-local HTTP", () => {
    for (const value of [
      "javascript:alert(1)",
      "https://key:secret@example.test",
      "https://example.test?key=secret",
      "http://example.test",
    ])
      expect(() => barkServer(value)).toThrow("invalidBark");
    expect(barkServer("http://127.0.0.1:9999").origin).toBe(
      "http://127.0.0.1:9999",
    );
  });
  it("does not request any destination when permission is absent", async () => {
    let requests = 0;
    const settings = {
      ...defaultSettings("en"),
      bark: {
        enabled: true,
        server: "https://push.example.test",
        deviceKey: "fixture_key",
      },
    };
    expect(
      await postBark(hit(), settings, async () => false, (async () => {
        requests++;
        return new Response("{}");
      }) as typeof fetch),
    ).toBe("permission");
    expect(requests).toBe(0);
  });
  it("sends real POST JSON to a local receiver, validates acknowledgements and refuses redirects", async () => {
    let received = 0,
      mode = "ok",
      last: Record<string, unknown> = {};
    const server = createServer((request, response) => {
      let text = "";
      request.on("data", (data) => {
        text += data.toString();
      });
      request.on("end", () => {
        received++;
        last = JSON.parse(text);
        expect(request.method).toBe("POST");
        expect(request.url).toBe("/push");
        if (mode === "redirect") {
          response.writeHead(302, {
            location: "https://never-request.invalid/",
          });
          response.end();
        } else {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ code: mode === "ok" ? 200 : 400 }));
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("no local receiver");
    const settings = {
      ...defaultSettings("en"),
      bark: {
        enabled: true,
        server: `http://127.0.0.1:${address.port}`,
        deviceKey: "fixture_key",
      },
    };
    try {
      expect(await postBark(hit(), settings, async () => true)).toBe("sent");
      expect(last.device_key).toBe("fixture_key");
      expect(Object.keys(last).sort()).toEqual([
        "body",
        "device_key",
        "group",
        "title",
        "url",
      ]);
      expect(last.url).toBe(hit().url);
      expect(JSON.stringify(last)).not.toContain(sample().text);
      mode = "error";
      expect(await postBark(hit(), settings, async () => true)).toBe("failed");
      mode = "redirect";
      expect(await postBark(hit(), settings, async () => true)).toBe("failed");
      expect(received).toBe(3);
      await mkdir("test-results", { recursive: true });
      await writeFile(
        "test-results/bark-local-proof.json",
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            localReceiverOnly: true,
            method: "POST",
            path: "/push",
            receivedRequests: received,
            fields: Object.keys(last).sort(),
            postBodyTransmitted: false,
            redirectsFollowed: false,
            phoneDeliveryVerified: false,
          },
          null,
          2,
        ),
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
describe("feature settings and languages", () => {
  it("migrates existing settings with all new network features off", () => {
    const settings = validateSettings({ language: "zh", rising: 2222 });
    expect(settings.filtering.enabled).toBe(false);
    expect(settings.monitoring.enabled).toBe(false);
    expect(settings.bark.enabled).toBe(false);
    expect(settings.rising).toBe(2222);
  });
  it("provides all new strings in three languages", () => {
    expect(Object.keys(hubDictionaries.en).sort()).toEqual(
      Object.keys(hubDictionaries.zh).sort(),
    );
    expect(Object.keys(hubDictionaries.en).sort()).toEqual(
      Object.keys(hubDictionaries.ja).sort(),
    );
  });
});
