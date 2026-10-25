import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "../src/content/model";
import { parseViewGroupCount } from "../src/content/dom";
import {
  averageSpeed,
  READING_MAX_AGE,
  Samples,
  viewReadingAt,
} from "../src/core/metrics";
import { defaultSettings } from "../src/core/settings";
import { fixtureTweets, NOW } from "./fixtures";

describe("rates backed by actual readings", () => {
  let model: Workspace;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    model = new Workspace(
      defaultSettings("en"),
      {
        async get() {
          return undefined;
        },
        async set() {},
        async remove() {},
      },
      async () => {},
      { jump: () => false, back() {}, fill: () => false },
    );
  });
  afterEach(() => {
    model.destroy();
    vi.useRealTimers();
  });
  const tweet = () => fixtureTweets(NOW)[0]!;

  it("reads exact views from real X action labels without mistaking likes or rounded views", () => {
    expect(
      parseViewGroupCount(
        "10 回复、7 次转帖、134 喜欢、205 书签、32834 次观看",
      ),
    ).toBe(32834);
    expect(parseViewGroupCount("10 replies, 7 reposts, 12,345 views")).toBe(
      12345,
    );
    expect(parseViewGroupCount("0 件の表示")).toBe(0);
    for (const label of [
      "10 replies, 12K views",
      "10 回复、3.2万 次观看",
      "1 234 views",
      "123 likes",
      "1.2 views",
    ])
      expect(parseViewGroupCount(label)).toBeNull();
  });

  it("uses the count's own reading time instead of silently aging the divisor", () => {
    const post = { ...tweet(), counts: { ...tweet().counts, views: 48000 } };
    expect(averageSpeed(post, NOW + 60000)).toBe(24000);
    expect(averageSpeed(post, NOW + READING_MAX_AGE + 1)).toBeNull();
    expect(
      averageSpeed(
        { ...post, viewsObservedAt: NOW, observedAt: NOW + 3600000 },
        NOW + 3600000,
      ),
    ).toBeNull();
  });

  it("does not refresh a reading or invent measured growth on unrelated page scans", () => {
    const first = { ...tweet(), source: "page" as const };
    model.upsert(first);
    vi.advanceTimersByTime(60000);
    model.upsert({
      ...first,
      observedAt: Date.now(),
      text: "Unrelated text edit",
    });
    expect(viewReadingAt(model.get(first.id)!)).toBe(NOW);
    expect(model.samples.info(first.id).points).toHaveLength(1);
    expect(model.snapshot().ranked[0]?.growth).toBeNull();
    vi.advanceTimersByTime(255000);
    expect(model.snapshot().ranked[0]?.average).toBeNull();
  });

  it("updates exact page counts while retaining complete response text", () => {
    const first = tweet();
    model.upsert(first);
    vi.advanceTimersByTime(60000);
    model.upsert({
      ...first,
      source: "page",
      text: "Truncated",
      complete: false,
      observedAt: Date.now(),
      counts: { ...first.counts, views: first.counts.views! + 1000 },
    });
    const post = model.get(first.id)!;
    expect(post.text).toBe(first.text);
    expect(post.complete).toBe(true);
    expect(viewReadingAt(post)).toBe(NOW + 60000);
    expect(model.snapshot().ranked[0]?.growth).toBe(60000);
    expect(model.snapshot().ranked[0]?.average).toBeCloseTo(
      149000 / (2 + 1 / 60),
    );
  });

  it("accepts a new response with unchanged views as a measured zero", () => {
    const first = tweet();
    model.upsert(first);
    vi.advanceTimersByTime(60000);
    model.ingest({
      tweets: [{ ...first, observedAt: Date.now() }],
      capabilities: model.snapshot().capabilities,
    });
    expect(model.snapshot().ranked[0]?.growth).toBe(0);
    expect(viewReadingAt(model.get(first.id)!)).toBe(Date.now());
  });

  it("accepts a corrected lower page count and resets growth instead of retaining a false high count", () => {
    const first = tweet();
    model.upsert(first);
    vi.advanceTimersByTime(60000);
    model.upsert({
      ...first,
      source: "page",
      observedAt: Date.now(),
      counts: { ...first.counts, views: 100 },
    });
    expect(model.get(first.id)?.counts.views).toBe(100);
    expect(model.snapshot().ranked[0]?.growth).toBeNull();
    expect(model.snapshot().ranked[0]?.average).toBeCloseTo(100 / (2 + 1 / 60));
    model.upsert({ ...first, observedAt: NOW - 1 });
    expect(model.get(first.id)?.counts.views).toBe(100);
  });

  it("missing and invalid views never become zero or renew old readings", () => {
    const first = tweet();
    model.upsert(first);
    vi.advanceTimersByTime(60000);
    model.ingest({
      capabilities: model.snapshot().capabilities,
      tweets: [
        {
          ...first,
          observedAt: Date.now(),
          counts: { ...first.counts, views: null },
        },
      ],
    });
    expect(viewReadingAt(model.get(first.id)!)).toBe(NOW);
    for (const views of [
      null,
      NaN,
      Infinity,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(
        averageSpeed(
          { ...first, counts: { ...first.counts, views } },
          Date.now(),
        ),
      ).toBeNull();
  });

  it("does not combine measurements across a stale gap", () => {
    const samples = new Samples(),
      first = tweet();
    samples.update(first);
    samples.update({
      ...first,
      observedAt: NOW + READING_MAX_AGE + 1,
      counts: { ...first.counts, views: 200000 },
    });
    expect(samples.get(first.id)).toBeNull();
    expect(samples.info(first.id).points).toHaveLength(1);
  });
});
