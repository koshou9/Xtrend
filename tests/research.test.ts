import { describe, it, expect } from "vitest";
import {
  SavedLibrary,
  cleanSavedPost,
  postsCSV,
  readingPresets,
  searchPosts,
  LIBRARY_KEY,
} from "../src/core/research";
import { defaultSettings } from "../src/core/settings";
import { MonitorEngine, repeatHit } from "../src/core/monitor";
import { Workspace } from "../src/content/model";
import type { Tweet } from "../src/core/types";
import type { MonitorHit } from "../src/core/features";
const at = Date.now();
const tweet: Tweet = {
  id: "100",
  author: { id: "1", name: "Reader", handle: "reader" },
  text: "Research about cats",
  createdAt: at - 3600000,
  observedAt: at,
  viewsObservedAt: at,
  counts: { views: 100, likes: 0, replies: 0, reposts: 0, bookmarks: null },
  photos: [],
  url: "https://x.com/reader/status/100",
  complete: true,
  source: "graphql",
};
function storage() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k: string) => structuredClone(data.get(k)),
    set: async (k: string, v: unknown) => {
      data.set(k, structuredClone(v));
    },
    remove: async (k: string) => {
      data.delete(k);
    },
  };
}
describe("reading improvements", () => {
  it("searches loaded posts by text, author and local publication date without treating missing dates as known", () => {
    const posts = [
      tweet,
      { ...tweet, id: "200", createdAt: null, text: "dog" },
    ];
    expect(
      searchPosts(posts, { text: "CATS", author: "@reader", since: "" }),
    ).toEqual([tweet]);
    expect(
      searchPosts(posts, { text: "", author: "", since: "2000-01-01" }),
    ).toEqual([tweet]);
    expect(
      searchPosts(posts, { text: "", author: "", since: "" }),
    ).toHaveLength(2);
  });
  it("writes quoted spreadsheet cells and prevents spreadsheet formulas", () => {
    const csv = postsCSV([
      {
        ...tweet,
        text: '=HYPERLINK("https://example.test")\nnext',
        author: { ...tweet.author, name: " +formula" },
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""https://example.test"")\nnext"`);
    expect(csv).toContain(`"' +formula"`);
  });
  it("keeps unknown counts empty and real zero counts", () => {
    expect(postsCSV([tweet])).toContain(',"100","100",');
    expect(
      postsCSV([{ ...tweet, counts: { ...tweet.counts, views: 0 } }]),
    ).toContain(',"0","0",');
    expect(
      postsCSV([{ ...tweet, counts: { ...tweet.counts, views: null } }]),
    ).toContain(',"","",');
    expect(() => postsCSV([{ ...tweet, createdAt: 1e300 }])).not.toThrow();
  });
  it("presets never enable notifications or overwrite watch targets, rules or appearance", () => {
    for (const preset of Object.values(readingPresets))
      for (const key of ["bark", "monitoring", "filtering", "appearance"])
        expect(preset).not.toHaveProperty(key);
  });
  it("validates saved content at the storage boundary", () => {
    const saved = {
      tweet,
      tags: ["cats", " cats "],
      note: "note",
      savedAt: at,
    };
    expect(cleanSavedPost(saved)?.tags).toEqual(["cats"]);
    expect(cleanSavedPost({ ...saved, note: "x".repeat(2001) })).toBeNull();
    expect(
      cleanSavedPost({
        ...saved,
        tweet: { ...tweet, text: "x".repeat(100001) },
      }),
    ).toBeNull();
    expect(cleanSavedPost({ ...saved, tags: [12] })).toBeNull();
  });
  it("serializes saves, updates one post without duplicates and persists removal", async () => {
    const port = storage(),
      library = new SavedLibrary(port);
    await Promise.all([
      library.save({ tweet, tags: [], note: "one", savedAt: at }),
      library.save({
        tweet: { ...tweet, id: "200" },
        tags: [],
        note: "two",
        savedAt: at,
      }),
    ]);
    expect(await library.list()).toHaveLength(2);
    await library.save({ tweet, tags: ["new"], note: "updated", savedAt: at });
    expect(
      (await new SavedLibrary(port).list()).find((e) => e.tweet.id === "100")
        ?.note,
    ).toBe("updated");
    await library.remove("100");
    await library.remove("200");
    expect(port.data.has(LIBRARY_KEY)).toBe(false);
  });
  it("rejects over-capacity saves without deleting existing posts", async () => {
    const port = storage(),
      library = new SavedLibrary(port);
    for (let i = 0; i < 100; i++)
      await library.save({
        tweet: { ...tweet, id: String(i + 1) },
        tags: [],
        note: "",
        savedAt: at,
      });
    await expect(
      library.save({
        tweet: { ...tweet, id: "101" },
        tags: [],
        note: "",
        savedAt: at,
      }),
    ).rejects.toThrow("libraryFull");
    expect(await library.list()).toHaveLength(100);
  });
  it("keeps long posts intact and rejects the byte limit without evicting saved content", async () => {
    const port = storage(),
      library = new SavedLibrary(port),
      long = { ...tweet, text: "x".repeat(100000) };
    for (let i = 1; i <= 20; i++)
      await library.save({
        tweet: { ...long, id: String(i) },
        tags: [],
        note: "",
        savedAt: at,
      });
    expect((await library.list())[0]?.tweet.text).toHaveLength(100000);
    await expect(
      library.save({
        tweet: { ...long, id: "21" },
        tags: [],
        note: "",
        savedAt: at,
      }),
    ).rejects.toThrow("libraryFull");
    expect(await library.list()).toHaveLength(20);
  });
  it("updates a received batch once and closes the old modal on navigation reset", () => {
    const model = new Workspace(defaultSettings(), storage(), async () => {}, {
      jump: () => false,
      back: () => {},
      fill: () => false,
    });
    try {
      for (let i = 1; i <= 30; i++) model.upsert({ ...tweet, id: String(i) });
      let notifications = 0;
      model.subscribe(() => notifications++);
      model.ingest({
        tweets: Array.from({ length: 30 }, (_, i) => ({
          ...tweet,
          id: String(i + 1),
          observedAt: at + 1,
        })),
        capabilities: {
          grok: true,
          quotes: true,
          reposts: true,
          temporary: false,
        },
      });
      expect(notifications).toBeLessThanOrEqual(2);
      model.open({ type: "star", tweet });
      model.reset();
      expect(model.snapshot().modal).toBeNull();
    } finally {
      model.destroy();
    }
  });
});
describe("explicit repeat reminders", () => {
  const hit: MonitorHit = {
    id: "100",
    account: "owner",
    author: { name: "Reader", handle: "reader" },
    url: tweet.url,
    views: 100,
    velocity: 100,
    reasons: ["account:@reader"],
    at,
    observedAt: at,
  };
  it("requires the chosen increase, a fresh reading and five minutes", () => {
    const next = {
      ...hit,
      views: 125,
      at: at + 300000,
      observedAt: at + 300000,
    };
    expect(repeatHit(hit, next, 0, next.at)).toBe(false);
    expect(repeatHit(hit, next, 25, next.at)).toBe(true);
    expect(repeatHit(hit, { ...next, views: 124 }, 25, next.at)).toBe(false);
    expect(repeatHit(hit, next, 25, at + 299999)).toBe(false);
    expect(repeatHit(hit, { ...next, observedAt: at }, 25, next.at)).toBe(
      false,
    );
    expect(repeatHit({ ...hit, views: null }, next, 25, next.at)).toBe(false);
  });
  it("deduplicates across restarts and updates the same local record when explicitly enabled", async () => {
    const port = storage(),
      settings = defaultSettings();
    let now = at,
      sent = 0;
    settings.monitoring = {
      enabled: true,
      accounts: ["reader"],
      keywords: [],
      minViews: 0,
      minVelocity: 0,
      repeatPercent: 25,
    };
    settings.bark.enabled = true;
    const engine = () =>
      new MonitorEngine(
        port,
        async () => settings,
        async () => {
          sent++;
          return "sent";
        },
        () => now,
      );
    await engine().record(hit);
    expect(sent).toBe(1);
    now += 300000;
    const next = { ...hit, views: 125, at: now, observedAt: now };
    await engine().record(next);
    await engine().record(next);
    expect(sent).toBe(2);
    expect(await engine().list()).toHaveLength(1);
    settings.monitoring.repeatPercent = 0;
    now += 300000;
    await engine().record({ ...hit, views: 1000, at: now, observedAt: now });
    expect(sent).toBe(2);
  });
});
