import type { Author, Tweet, Relation, GraphPage } from "./types";
type Obj = Record<string, any>;
const obj = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function walk(
  data: unknown,
  visit: (value: Obj) => void,
  budget = 60000,
) {
  const stack: unknown[] = [data];
  const seen = new Set<unknown>();
  while (stack.length && budget-- > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) stack.push(...value.slice(0, 10000));
    else {
      visit(value as Obj);
      stack.push(...Object.values(value));
    }
  }
}
export function numberOrNull(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
const str = (v: unknown, max = 100000) =>
  typeof v === "string" ? v.slice(0, max) : "";
export function normalizeAuthor(value: unknown): Author | null {
  if (!obj(value)) return null;
  const legacy = value.legacy ?? value;
  const handle = str(legacy.screen_name ?? value.core?.screen_name, 50);
  const id = str(value.rest_id ?? legacy.id_str, 40);
  return /^\w{1,50}$/.test(handle) && /^\d+$/.test(id)
    ? { id, handle, name: str(legacy.name ?? value.core?.name, 200) || handle }
    : null;
}
export function normalizeTweet(value: unknown, now = Date.now()): Tweet | null {
  if (!obj(value)) return null;
  if (value.__typename === "TweetWithVisibilityResults")
    return normalizeTweet(value.tweet, now);
  const legacy = value.legacy;
  if (!obj(legacy) || !/^\d+$/.test(value.rest_id ?? legacy.id_str ?? ""))
    return null;
  const author = normalizeAuthor(value.core?.user_results?.result);
  if (!author) return null;
  const note = value.note_tweet?.note_tweet_results?.result;
  let text = str(note?.text ?? legacy.full_text ?? legacy.text);
  const entities = note?.entity_set?.urls ?? legacy.entities?.urls ?? [];
  for (const entity of Array.isArray(entities) ? entities : []) {
    if (
      obj(entity) &&
      typeof entity.url === "string" &&
      typeof entity.expanded_url === "string"
    )
      text = text.split(entity.url).join(entity.expanded_url);
  }
  const created = Date.parse(legacy.created_at ?? value.core?.created_at ?? "");
  const id = String(value.rest_id ?? legacy.id_str);
  const photos: string[] = [];
  const mediaItems = legacy.extended_entities?.media ?? legacy.entities?.media;
  for (const media of Array.isArray(mediaItems) ? mediaItems : []) {
    if (
      obj(media) &&
      media.type === "photo" &&
      typeof media.media_url_https === "string"
    ) {
      try {
        const url = new URL(media.media_url_https);
        if (url.protocol === "https:" && url.hostname === "pbs.twimg.com")
          photos.push(url.href);
      } catch {
        /* Invalid media is ignored. */
      }
    }
  }
  return {
    id,
    author,
    text,
    createdAt: Number.isFinite(created) ? created : null,
    url: `https://x.com/${author.handle}/status/${id}`,
    counts: {
      views: numberOrNull(value.views?.count ?? legacy.view_count),
      likes: numberOrNull(legacy.favorite_count),
      reposts: numberOrNull(legacy.retweet_count),
      replies: numberOrNull(legacy.reply_count),
      bookmarks: numberOrNull(legacy.bookmark_count),
    },
    photos,
    observedAt: now,
    complete: !!note?.text || (legacy.truncated !== true && !!legacy.full_text),
    source: "graphql",
    replyTo: /^\d+$/.test(legacy.in_reply_to_status_id_str ?? "")
      ? legacy.in_reply_to_status_id_str
      : null,
  };
}
export function extractTweets(data: unknown, now = Date.now()): Tweet[] {
  const tweets = new Map<string, Tweet>();
  walk(data, (value) => {
    const tweet = normalizeTweet(value, now);
    if (tweet) tweets.set(tweet.id, tweet);
  });
  return [...tweets.values()];
}
export function extractGraph(
  data: unknown,
  tweetId: string,
  kind: "repost" | "quote",
  now = Date.now(),
): GraphPage {
  const relations = new Map<string, Relation>();
  let cursor: string | null = null;
  walk(data, (value) => {
    if (value.cursorType === "Bottom" && typeof value.value === "string")
      cursor = value.value || null;
    if (kind === "repost" && value.__typename === "User") {
      const author = normalizeAuthor(value);
      if (author) relations.set(author.id, { kind, author });
    }
    if (
      kind === "quote" &&
      String(
        value.legacy?.quoted_status_id_str ??
          value.quoted_status_result?.result?.rest_id ??
          value.quoted_status_result?.result?.tweet?.rest_id ??
          "",
      ) === tweetId
    ) {
      const tweet = normalizeTweet(value, now);
      if (tweet) relations.set(tweet.id, { kind, author: tweet.author, tweet });
    }
  });
  return { relations: [...relations.values()], cursor, observedAt: now };
}
