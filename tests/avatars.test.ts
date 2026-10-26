import { describe, expect, it } from "vitest";
import { normalizeAuthor, extractGraph } from "../src/core/normalize";
import { cleanGraph } from "../src/core/wire";
import { profileImageURL } from "../src/core/images";
import { GraphCache, mergeRelations } from "../src/core/cache";
import { rawTweet } from "./fixtures";

const oldAvatar = "https://pbs.twimg.com/profile_images/123/old_normal.jpg";
const newAvatar = "https://pbs.twimg.com/profile_images/456/new_normal.jpg";
const user = {
  __typename: "User",
  rest_id: "123",
  legacy: {
    name: "Reader",
    screen_name: "reader",
    profile_image_url_https: oldAvatar,
  },
};
describe("current X profile avatars", () => {
  it("reads current and legacy user image fields and prefers the current avatar", () => {
    expect(normalizeAuthor(user)?.avatar).toBe(oldAvatar);
    expect(
      normalizeAuthor({ ...user, avatar: { image_url: newAvatar } })?.avatar,
    ).toBe(newAvatar);
    expect(
      normalizeAuthor({
        id_str: "123",
        name: "Reader",
        screen_name: "reader",
        profile_image_url: newAvatar,
      })?.avatar,
    ).toBe(newAvatar);
  });
  it("keeps avatars for repost and quote authors through the page boundary", () => {
    const repost = extractGraph({ data: { users: [user] } }, "1", "repost");
    expect(cleanGraph(repost)?.relations[0]?.author.avatar).toBe(oldAvatar);
    const tweet = rawTweet("456");
    const quote = {
      ...tweet,
      core: { user_results: { result: user } },
      legacy: { ...tweet.legacy, quoted_status_id_str: "1" },
    };
    const relation = cleanGraph(extractGraph({ quote }, "1", "quote"))
      ?.relations[0];
    expect(relation?.author.avatar).toBe(oldAvatar);
    expect(relation?.kind === "quote" && relation.tweet.author.avatar).toBe(
      oldAvatar,
    );
  });
  it("rejects foreign, insecure, credential-bearing and oversized image addresses", () => {
    for (const url of [
      "https://evil.test/profile_images/1/a.jpg",
      "https://pbs.twimg.com.evil.test/profile_images/1/a.jpg",
      "http://pbs.twimg.com/profile_images/1/a.jpg",
      "https://user:secret@pbs.twimg.com/profile_images/1/a.jpg",
      "https://pbs.twimg.com:444/profile_images/1/a.jpg",
      "data:image/png,abc",
      "javascript:alert(1)",
      "https://pbs.twimg.com/media/a.jpg",
      oldAvatar + "x".repeat(2048),
    ])
      expect(profileImageURL(url)).toBeUndefined();
    const page = extractGraph({ user }, "1", "repost");
    page.relations[0]!.author.avatar = "https://evil.test/track";
    expect(cleanGraph(page)?.relations[0]?.author.avatar).toBeUndefined();
    expect(
      profileImageURL(
        "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png",
      ),
    ).toBeDefined();
  });
  it("retains image URLs in cache and replaces old URLs with fresh user data", async () => {
    const data = new Map<string, unknown>();
    const cache = new GraphCache({
      get: async (key) => data.get(key),
      set: async (key, value) => {
        data.set(key, structuredClone(value));
      },
      remove: async (key) => {
        data.delete(key);
      },
    });
    const oldPage = extractGraph({ user }, "1", "repost");
    await cache.put("signed_in_user", "1", "repost", oldPage);
    const saved = await cache.get("signed_in_user", "1", "repost");
    expect(saved?.relations[0]?.author.avatar).toBe(oldAvatar);
    const fresh = extractGraph(
      { user: { ...user, avatar: { image_url: newAvatar } } },
      "1",
      "repost",
    );
    expect(
      mergeRelations(saved!.relations, fresh.relations)[0]!.author.avatar,
    ).toBe(newAvatar);
  });
  it("accepts existing cached users without an avatar", () => {
    const page = extractGraph(
      { user: { ...user, legacy: { name: "Old", screen_name: "old" } } },
      "1",
      "repost",
    );
    expect(cleanGraph(page)?.relations[0]?.author).toEqual({
      id: "123",
      name: "Old",
      handle: "old",
    });
  });
});
