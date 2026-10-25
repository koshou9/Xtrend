import { describe, expect, it } from "vitest";
import { defaultSettings, validateSettings } from "../src/core/settings";
import {
  dockEdge,
  lowViewTweet,
  pageScope,
  rankingApplies,
  selectRankings,
} from "../src/core/ranking";
import { rankTweets, Samples } from "../src/core/metrics";
import { Workspace } from "../src/content/model";
import { fixtureTweets } from "./fixtures";

describe("ranking controls", () => {
  it("migrates old local settings without losing the previous order or template", () => {
    const settings = validateSettings({
      version: 1,
      columns: ["speed", "post", "views"],
      template: "Keep {{text}}",
    });
    expect(settings.columns).toEqual(["speed", "post", "views"]);
    expect(settings.template).toBe("Keep {{text}}");
    expect(settings.rankingLimit).toBe(10);
    expect(settings.edgeHide).toBe(true);
    expect(settings.rankingFields.username).toBe(false);
  });
  it("rejects invalid limits and minimum views without silently hiding every column", () => {
    const settings = validateSettings({
      rankingLimit: 0,
      minimumViews: -1,
      rankingFields: {
        rank: false,
        tier: false,
        username: false,
        preview: false,
        views: false,
        speed: false,
      },
    });
    expect(settings.rankingLimit).toBe(10);
    expect(settings.minimumViews).toBe(10000);
    expect(settings.rankingFields.preview).toBe(true);
    expect(validateSettings({ rankingLimit: 1.5 }).rankingLimit).toBe(10);
    expect(validateSettings({ rankingLimit: 1001 }).rankingLimit).toBe(10);
  });
  it("distinguishes the four real page types from unrelated routes", () => {
    expect(pageScope("https://x.com/home")).toBe("home");
    expect(pageScope("https://pro.x.com/")).toBe("home");
    expect(pageScope("https://x.com/i/lists/123")).toBe("list");
    expect(pageScope("https://x.com/fixture_user/media")).toBe("profile");
    expect(pageScope("https://x.com/fixture_user/status/123/photo/1")).toBe(
      "detail",
    );
    expect(pageScope("https://x.com/i/web/status/123")).toBe("detail");
    for (const path of [
      "/i/grok",
      "/settings",
      "/search",
      "/notifications",
      "/messages",
    ])
      expect(pageScope(`https://x.com${path}`)).toBeNull();
  });
  it("respects an empty scope selection and the master panel switch", () => {
    const settings = { ...defaultSettings("en"), rankingScopes: [] };
    expect(rankingApplies(settings, "home")).toBe(false);
    expect(rankingApplies(defaultSettings("en"), null)).toBe(false);
    expect(
      rankingApplies({ ...defaultSettings("en"), panel: false }, "profile"),
    ).toBe(false);
  });
  it("filters known low view counts before applying the count limit", () => {
    const tweets = fixtureTweets(),
      settings = {
        ...defaultSettings("en"),
        hotOnly: true,
        minimumViews: 10000,
        rankingLimit: 2,
      };
    const ranked = rankTweets(tweets, new Samples(), settings);
    expect(selectRankings(ranked, settings)).toHaveLength(2);
    expect(
      selectRankings(ranked, settings).every((t) => t.counts.views! >= 10000),
    ).toBe(true);
  });
  it("keeps unknown views and handles exact threshold and zero values correctly", () => {
    const tweet = fixtureTweets()[0]!,
      settings = {
        ...defaultSettings("en"),
        hotOnly: true,
        minimumViews: 10000,
      };
    expect(
      lowViewTweet(
        { ...tweet, counts: { ...tweet.counts, views: null } },
        settings,
      ),
    ).toBe(false);
    expect(
      lowViewTweet(
        { ...tweet, counts: { ...tweet.counts, views: 10000 } },
        settings,
      ),
    ).toBe(false);
    expect(
      lowViewTweet(
        { ...tweet, counts: { ...tweet.counts, views: 0 } },
        settings,
      ),
    ).toBe(true);
  });
  it("only docks within the edge release zone and clears docking when disabled", () => {
    expect(dockEdge(8, 398, 1440)).toBe("left");
    expect(dockEdge(1034, 398, 1440)).toBe("right");
    expect(dockEdge(500, 398, 1440)).toBeNull();
    expect(
      validateSettings({ dock: "right", edgeHide: false }).dock,
    ).toBeNull();
  });
});
describe("immediate and ordered setting saves", () => {
  const storage = {
    async get() {
      return undefined;
    },
    async set() {},
    async remove() {},
  };
  const actions = { jump: () => true, back() {}, fill: () => false };
  it("keeps quick independent changes and ignores its own earlier storage echoes", async () => {
    const writes: any[] = [];
    const model = new Workspace(
      defaultSettings("en"),
      storage,
      async (value) => {
        writes.push(value);
        model.acceptSettings(value);
      },
      actions,
    );
    try {
      const one = model.update({ rankingLimit: 3 }),
        two = model.update({ hotOnly: true }),
        three = model.update({ edgeHide: false });
      expect(model.snapshot().settings.rankingLimit).toBe(3);
      expect(model.snapshot().settings.hotOnly).toBe(true);
      await Promise.all([one, two, three]);
      expect(writes).toHaveLength(3);
      expect(writes[2]).toMatchObject({
        rankingLimit: 3,
        hotOnly: true,
        edgeHide: false,
      });
      expect(model.snapshot().settings).toMatchObject({
        rankingLimit: 3,
        hotOnly: true,
        edgeHide: false,
      });
    } finally {
      model.destroy();
    }
  });
  it("restores the previous visible state if saving a change fails", async () => {
    const model = new Workspace(
      defaultSettings("en"),
      storage,
      async () => {
        throw new Error("storage unavailable");
      },
      actions,
    );
    try {
      await expect(model.update({ hotOnly: true })).rejects.toThrow(
        "storage unavailable",
      );
      expect(model.snapshot().settings.hotOnly).toBe(false);
    } finally {
      model.destroy();
    }
  });
});
