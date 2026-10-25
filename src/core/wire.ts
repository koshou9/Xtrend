import type {
  Author,
  Capabilities,
  GraphPage,
  PageSnapshot,
  Reply,
  Tweet,
  Relation,
} from "./types";
type Obj = Record<string, any>;
const object = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";
function author(v: unknown): Author | null {
  if (
    !object(v) ||
    !/^[A-Za-z0-9_]{1,50}$/.test(v.handle) ||
    typeof v.name !== "string" ||
    typeof v.id !== "string"
  )
    return null;
  return {
    id: v.id.slice(0, 80),
    name: v.name.slice(0, 200),
    handle: v.handle,
  };
}
export function cleanTweet(v: unknown): Tweet | null {
  if (
    !object(v) ||
    typeof v.id !== "string" ||
    !/^\d{1,30}$/.test(v.id) ||
    !object(v.counts) ||
    !finite(v.observedAt)
  )
    return null;
  const a = author(v.author);
  if (!a || typeof v.text !== "string") return null;
  const counts = Object.fromEntries(
    ["views", "likes", "reposts", "replies", "bookmarks"].map((k) => [
      k,
      finite(v.counts[k]) && Number.isSafeInteger(v.counts[k])
        ? v.counts[k]
        : null,
    ]),
  ) as Tweet["counts"];
  const photos = Array.isArray(v.photos)
    ? v.photos.slice(0, 8).filter((p): p is string => {
        if (typeof p !== "string" || p.length > 2000) return false;
        try {
          const u = new URL(p);
          return (
            u.protocol === "https:" &&
            u.hostname === "pbs.twimg.com" &&
            u.pathname.startsWith("/media/")
          );
        } catch {
          return false;
        }
      })
    : [];
  return {
    id: v.id,
    author: a,
    text: v.text.slice(0, 100000),
    createdAt: finite(v.createdAt) ? v.createdAt : null,
    counts,
    photos,
    observedAt: v.observedAt,
    viewsObservedAt:
      finite(v.viewsObservedAt) && v.viewsObservedAt <= v.observedAt
        ? v.viewsObservedAt
        : undefined,
    complete: v.complete === true,
    source: v.source === "graphql" ? "graphql" : "page",
    replyTo:
      typeof v.replyTo === "string" && /^\d{1,30}$/.test(v.replyTo)
        ? v.replyTo
        : null,
    url: `https://x.com/${a.handle}/status/${v.id}`,
  };
}
export function cleanCapabilities(v: unknown): Capabilities {
  return {
    reposts: object(v) && v.reposts === true,
    quotes: object(v) && v.quotes === true,
    grok: object(v) && v.grok === true,
    temporary: object(v) && v.temporary === true,
  };
}
export function cleanGraph(v: unknown): GraphPage | null {
  if (!object(v) || !Array.isArray(v.relations) || !finite(v.observedAt))
    return null;
  const relations: Relation[] = v.relations
    .slice(0, 5000)
    .flatMap((r: unknown) => {
      if (!object(r)) return [];
      const a = author(r.author);
      if (!a) return [];
      if (r.kind === "repost")
        return [{ kind: "repost" as const, author: a } as Relation];
      const tweet = r.kind === "quote" ? cleanTweet(r.tweet) : null;
      return tweet
        ? [{ kind: "quote" as const, author: a, tweet } as Relation]
        : [];
    });
  return {
    relations,
    observedAt: v.observedAt,
    cursor:
      typeof v.cursor === "string" &&
      v.cursor.length > 0 &&
      v.cursor.length <= 4096
        ? v.cursor
        : null,
  };
}
export function cleanSnapshot(v: unknown): PageSnapshot | null {
  if (!object(v) || !Array.isArray(v.tweets)) return null;
  const tweets = v.tweets
      .slice(0, 1000)
      .flatMap((v: unknown) => cleanTweet(v) ?? []),
    capabilities = cleanCapabilities(v.capabilities);
  const graph =
    object(v.graph) &&
    /^\d{1,30}$/.test(v.graph.id) &&
    ["repost", "quote"].includes(v.graph.kind)
      ? cleanGraph(v.graph.page)
      : null;
  return {
    tweets,
    capabilities,
    ...(graph
      ? { graph: { id: v.graph.id, kind: v.graph.kind, page: graph } }
      : {}),
  };
}
export function cleanReply(v: unknown): Reply | null {
  if (!object(v)) return null;
  if (v.capabilities)
    return { capabilities: cleanCapabilities(v.capabilities) };
  if (v.page) {
    const page = cleanGraph(v.page);
    return page ? { page } : null;
  }
  return typeof v.text === "string" && v.text.length <= 200000
    ? { text: v.text }
    : null;
}
