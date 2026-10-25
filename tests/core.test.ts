import { describe, expect, it } from "vitest";
import {
  averageSpeed,
  burstIndex,
  Samples,
  tier,
  rankTweets,
} from "../src/core/metrics";
import {
  defaultSettings,
  fillTemplate,
  validateSettings,
} from "../src/core/settings";
import {
  extractGraph,
  extractTweets,
  normalizeTweet,
  numberOrNull,
} from "../src/core/normalize";
import { toMarkdown } from "../src/core/markdown";
import { GraphCache, mergeRelations } from "../src/core/cache";
import { cleanReply, cleanSnapshot } from "../src/core/wire";
import { highResolutionCandidates, zoomAt } from "../src/core/images";
import { dictionaries } from "../src/ui/i18n";
import { rawTweet, NOW, fixtureRelations, fixtureTweets } from "./fixtures";

const settings = defaultSettings("en");
const tweet = () => normalizeTweet(rawTweet(), NOW)!;
describe("velocity without fabricated data", () => {
  it("calculates average since publication", () =>
    expect(averageSpeed(tweet(), NOW)).toBe(24000));
  it("handles missing views and future timestamps as unknown", () => {
    expect(
      averageSpeed(
        { ...tweet(), counts: { ...tweet().counts, views: null } },
        NOW,
      ),
    ).toBeNull();
    expect(averageSpeed({ ...tweet(), createdAt: NOW + 1 }, NOW)).toBeNull();
  });
  it("does not invent an hourly rate during the first minute", () => {
    expect(averageSpeed({ ...tweet(), createdAt: NOW - 1 }, NOW)).toBeNull();
    expect(averageSpeed({ ...tweet(), createdAt: NOW - 60000 }, NOW)).toBe(
      2880000,
    );
  });
  it("uses inclusive tier thresholds", () => {
    expect(tier(999, settings)).toBe("normal");
    expect(tier(1000, settings)).toBe("rising");
    expect(tier(10000, settings)).toBe("viral");
  });
  it("makes the index formula transparent", () =>
    expect(burstIndex(tweet(), settings, NOW)).toBe(240));
  it("requires at least one minute between actual observations", () => {
    const samples = new Samples();
    samples.update(tweet());
    samples.update({
      ...tweet(),
      observedAt: NOW + 59000,
      counts: { ...tweet().counts, views: 49000 },
    });
    expect(samples.get(tweet().id)).toBeNull();
    samples.update({
      ...tweet(),
      observedAt: NOW + 60000,
      counts: { ...tweet().counts, views: 50000 },
    });
    expect(samples.get(tweet().id)).toBe(120000);
  });
  it("does not manufacture a sample when only the clock changes", () => {
    const samples = new Samples();
    samples.update(tweet());
    rankTweets([tweet()], samples, settings, NOW + 600000);
    expect(samples.get(tweet().id)).toBeNull();
  });
  it("resets on a count rollback", () => {
    const samples = new Samples();
    samples.update(tweet());
    samples.update({
      ...tweet(),
      observedAt: NOW + 60000,
      counts: { ...tweet().counts, views: 1 },
    });
    expect(samples.get(tweet().id)).toBeNull();
  });
  it("keeps measured results separate from average-only results", () => {
    const samples = new Samples(),
      first = tweet(),
      second = { ...tweet(), id: "2" };
    samples.update(first);
    samples.update({
      ...first,
      observedAt: NOW + 60000,
      counts: { ...first.counts, views: 48001 },
    });
    const ranked = rankTweets([second, first], samples, settings, NOW + 60000);
    expect(ranked[0]?.id).toBe(first.id);
    expect(ranked[1]?.growth).toBeNull();
  });
});
describe("X response extraction", () => {
  it("extracts nested and visibility-wrapped tweets once", () => {
    const raw = rawTweet();
    expect(
      extractTweets(
        {
          entries: [
            raw,
            { __typename: "TweetWithVisibilityResults", tweet: raw },
          ],
        },
        NOW,
      ),
    ).toHaveLength(1);
  });
  it("prefers complete note text and expands URLs", () => {
    const raw = rawTweet(undefined, {
      note_tweet: {
        note_tweet_results: {
          result: {
            text: "Full text https://t.co/test",
            entity_set: {
              urls: [
                {
                  url: "https://t.co/test",
                  expanded_url: "https://example.test/full",
                },
              ],
            },
          },
        },
      },
    });
    expect(normalizeTweet(raw, NOW)?.text).toBe(
      "Full text https://example.test/full",
    );
  });
  it("keeps missing bookmarks as unknown", () => {
    const raw = rawTweet();
    delete (raw.legacy as any).bookmark_count;
    expect(normalizeTweet(raw, NOW)?.counts.bookmarks).toBeNull();
  });
  it("rejects tombstones and invalid counts", () => {
    expect(normalizeTweet({ __typename: "TweetTombstone" })).toBeNull();
    expect(numberOrNull(-1)).toBeNull();
    expect(numberOrNull("not-a-number")).toBeNull();
  });
  it("only accepts official media URLs", () => {
    const raw = rawTweet();
    (raw.legacy as any).extended_entities = {
      media: [
        { type: "photo", media_url_https: "https://tracker.test/a.png" },
        {
          type: "photo",
          media_url_https: "https://pbs.twimg.com/media/photo.jpg",
        },
      ],
    };
    expect(normalizeTweet(raw)?.photos).toEqual([
      "https://pbs.twimg.com/media/photo.jpg",
    ]);
  });
  it("shows only quotes that actually reference the root", () => {
    const raw = rawTweet("2000000000000000001");
    (raw.legacy as any).quoted_status_id_str = "1000000000000000001";
    expect(
      extractGraph(
        { entries: [raw, rawTweet()] },
        "1000000000000000001",
        "quote",
        NOW,
      ).relations,
    ).toHaveLength(1);
    expect(
      extractGraph({ entries: [raw] }, "3", "quote", NOW).relations,
    ).toHaveLength(0);
  });
  it("reads bottom cursors and deduplicates repost people", () => {
    const author = rawTweet().core.user_results.result;
    const page = extractGraph(
      {
        entries: [author, structuredClone(author)],
        cursor: { cursorType: "Bottom", value: "next" },
      },
      "1",
      "repost",
      NOW,
    );
    expect(page.relations).toHaveLength(1);
    expect(page.cursor).toBe("next");
  });
});
describe("local settings, Markdown and image math", () => {
  it("rejects unsafe settings and preserves defaults", () => {
    const result = validateSettings({
      rising: -1,
      viral: NaN,
      columns: ["post", "post", "views"],
      theme: "remote",
      language: "xx",
      images: "yes",
    });
    expect(result.rising).toBe(1000);
    expect(result.columns).toEqual(["post", "views", "speed"]);
    expect(result.theme).toBe("auto");
  });
  it("substitutes templates without interpreting selected post text", () =>
    expect(
      fillTemplate("{{author}}: {{text}} / {{language}}", {
        author: "A",
        text: "{{language}}",
        language: "Japanese",
      }),
    ).toBe("A: {{language}} / Japanese"));
  it("preserves UTC time, paragraphs, escaped text and missing-text notices", () => {
    const md = toMarkdown({
      ...tweet(),
      text: "*hello*\n\n[world]",
      complete: false,
    });
    expect(md).toContain("Z\n");
    expect(md).toContain("\\*hello\\*\n\n\\[world\\]");
    expect(md).toContain("Incomplete text");
    expect(md).toContain(tweet().url);
  });
  it("upgrades only official photo URLs and keeps the original as last fallback", () => {
    const url = "https://pbs.twimg.com/media/fixture.jpg";
    const candidates = highResolutionCandidates(url);
    expect(candidates[0]).toContain("name=4096x4096");
    expect(candidates.at(-1)).toBe(url);
    expect(highResolutionCandidates("https://other.test/p.jpg")).toEqual([
      "https://other.test/p.jpg",
    ]);
  });
  it("keeps the cursor anchor fixed while zooming", () => {
    const t = zoomAt({ x: 10, y: 20, scale: 1 }, 2, { x: 50, y: 60 });
    expect(t).toEqual({ x: -30, y: -20, scale: 2 });
    expect((50 - t.x) / t.scale).toBe(40);
  });
  it("has complete matching translation keys in all languages", () => {
    expect(Object.keys(dictionaries.zh).sort()).toEqual(
      Object.keys(dictionaries.en).sort(),
    );
    expect(Object.keys(dictionaries.ja).sort()).toEqual(
      Object.keys(dictionaries.en).sort(),
    );
  });
});
describe("account-separated bounded cache and untrusted page messages", () => {
  const memory = () => {
    const data = new Map<string, unknown>();
    return {
      data,
      async get(key: string) {
        return data.get(key);
      },
      async set(key: string, value: unknown) {
        data.set(key, structuredClone(value));
      },
      async remove(key: string) {
        data.delete(key);
      },
    };
  };
  it("separates accounts and expires observations after seven days", async () => {
    let now = NOW;
    const storage = memory(),
      cache = new GraphCache(storage, () => now),
      page = { relations: [], cursor: null, observedAt: NOW };
    await cache.put("a", "1", "repost", page);
    expect(await cache.get("b", "1", "repost")).toBeNull();
    expect(await cache.get("a", "1", "repost")).not.toBeNull();
    now += 7 * 86400000 + 1;
    expect(await cache.get("a", "1", "repost")).toBeNull();
  });
  it("does not persist anonymous account results", async () => {
    const storage = memory(),
      cache = new GraphCache(storage, () => NOW);
    await cache.put("anonymous", "1", "repost", {
      relations: [],
      cursor: null,
      observedAt: NOW,
    });
    expect(storage.data.size).toBe(0);
  });
  it("clears data and serializes concurrent changes", async () => {
    const storage = memory(),
      cache = new GraphCache(storage, () => NOW);
    await Promise.all(
      ["1", "2"].map((id) =>
        cache.put("a", id, "repost", {
          relations: [],
          cursor: null,
          observedAt: NOW,
        }),
      ),
    );
    expect(await cache.get("a", "1", "repost")).not.toBeNull();
    await cache.clear();
    expect(storage.data.size).toBe(0);
  });
  it("deduplicates relations across pages", () => {
    const relations = fixtureRelations(fixtureTweets()[0]!);
    expect(mergeRelations(relations, relations)).toHaveLength(relations.length);
  });
  it("discards executable links and malformed page data", () => {
    const value = tweet();
    const result = cleanSnapshot({
      tweets: [
        {
          ...value,
          url: "javascript:alert(1)",
          photos: ["https://tracker.test/a.jpg"],
        },
        { ...value, author: { name: {} } },
      ],
      capabilities: {},
    });
    expect(result?.tweets).toHaveLength(1);
    expect(result?.tweets[0]?.url).toBe(value.url);
    expect(result?.tweets[0]?.photos).toEqual([]);
    expect(cleanReply({ page: { relations: "not-an-array" } })).toBeNull();
  });
  it("evicts oldest graph records at the byte limit", async () => {
    const storage = memory(),
      cache = new GraphCache(storage, () => NOW),
      root = fixtureTweets(NOW)[0]!;
    const relations = fixtureRelations(root).map((r) =>
      r.kind === "quote"
        ? { ...r, tweet: { ...r.tweet, text: "界".repeat(100000) } }
        : r,
    );
    await cache.put("a", "1", "quote", {
      relations,
      cursor: null,
      observedAt: NOW,
    });
    await cache.put("a", "2", "quote", {
      relations,
      cursor: null,
      observedAt: NOW,
    });
    expect(
      new TextEncoder().encode(
        JSON.stringify(await storage.get("graph-cache:v1")),
      ).byteLength,
    ).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
});
