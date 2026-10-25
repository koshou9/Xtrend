import type { Tweet, Relation } from "../src/core/types";
export const NOW = Date.parse("2026-10-24T00:00:00Z");
export function rawTweet(
  id = "1000000000000000001",
  overrides: Record<string, unknown> = {},
) {
  return {
    __typename: "Tweet",
    rest_id: id,
    core: {
      user_results: {
        result: {
          __typename: "User",
          rest_id: "9001",
          legacy: { name: "Field Notes", screen_name: "fieldnotes_demo" },
        },
      },
    },
    legacy: {
      id_str: id,
      full_text:
        "A small observation can change the way you see a whole day.\nKeep a little room for curiosity.",
      created_at: new Date(NOW - 2 * 3_600_000).toUTCString(),
      favorite_count: 240,
      retweet_count: 31,
      reply_count: 18,
      bookmark_count: 62,
      truncated: false,
    },
    views: { count: "48000" },
    ...overrides,
  };
}
export function fixtureTweets(now = Date.now()): Tweet[] {
  const names = [
    "Field Notes",
    "Mina Studio",
    "Open Spaces",
    "Paper & Form",
    "Jun Rivers",
    "Slow Journal",
    "Studio Twelve",
  ];
  const texts = [
    "A small observation can change the way you see a whole day. Keep a little room for curiosity.",
    "Good tools get out of the way. Today we made our reading experience a little quieter, and a little more useful.",
    "What would the internet feel like if we spent more time reading, and a little less time refreshing?",
    "Small details, considered carefully. A collection of things we noticed this week.",
    "New work in progress. The best part is still the conversation that comes after.",
    "A notebook, an open window, and no particular hurry. A good place to begin.",
    "Less noise. More of the things worth keeping.",
  ];
  return names.map((name, i) => ({
    id: String(1000000000000000001n + BigInt(i)),
    author: { id: String(9001 + i), name, handle: `fixture_${i}` },
    text: texts[i]!,
    createdAt: now - (2 + i) * 3_600_000,
    url: `https://x.com/fixture_${i}/status/${1000000000000000001n + BigInt(i)}`,
    counts: {
      views: [148000, 44000, 32000, 7500, 2400, 1600, 300][i]!,
      likes: 640 - i * 67,
      reposts: 81 - i * 9,
      replies: 42 - i * 4,
      bookmarks: i === 4 ? null : 123 - i * 13,
    },
    photos: [],
    observedAt: now,
    complete: i !== 4,
    source: "graphql",
  }));
}
export function fixtureRelations(tweet: Tweet): Relation[] {
  return Array.from({ length: 44 }, (_, i) => {
    const author = {
      id: String(7000 + i),
      name:
        ["Avery", "Mina", "Jun", "Robin", "Riley", "Kai", "Taylor", "Noa"][
          i % 8
        ]! + ` ${i + 1}`,
      handle: `reader_fixture_${i}`,
    };
    return i % 3 === 0
      ? {
          kind: "quote" as const,
          author,
          tweet: {
            ...tweet,
            id: String(2000000000000000001n + BigInt(i)),
            author,
            text: `A thoughtful note from reader ${i + 1}. There is something worth keeping here.`,
            createdAt: Date.now() - (44 - i) * 60000,
            url: `https://x.com/${author.handle}/status/${2000000000000000001n + BigInt(i)}`,
          },
        }
      : { kind: "repost" as const, author };
  });
}
