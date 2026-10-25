import type { PageScope, RankedTweet, Settings, Tweet } from "./types";

export function pageScope(url: string): PageScope | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "") || "/";
    if (
      /^\/[\w]+\/status\/\d+(?:\/.*)?$/.test(path) ||
      /^\/i\/web\/status\/\d+/.test(path)
    )
      return "detail";
    if (/^\/i\/lists\/\d+(?:\/.*)?$/.test(path)) return "list";
    if (
      ["/", "/home", "/following"].includes(path) ||
      /^\/i\/decks(?:\/|$)/.test(path)
    )
      return "home";
    const profile = path.match(
      /^\/([\w]+)(?:\/(with_replies|media|highlights|articles))?$/,
    );
    if (
      profile &&
      ![
        "i",
        "explore",
        "search",
        "notifications",
        "messages",
        "settings",
        "compose",
        "login",
        "logout",
        "tos",
        "privacy",
        "bookmarks",
        "premium",
      ].includes(profile[1]!)
    )
      return "profile";
    return null;
  } catch {
    return null;
  }
}
export function rankingApplies(
  settings: Settings,
  scope: PageScope | null,
): boolean {
  return (
    settings.panel && scope !== null && settings.rankingScopes.includes(scope)
  );
}
export function lowViewTweet(tweet: Tweet, settings: Settings): boolean {
  return (
    settings.hotOnly &&
    tweet.counts.views !== null &&
    tweet.counts.views < settings.minimumViews
  );
}
export function selectRankings(
  ranked: RankedTweet[],
  settings: Settings,
): RankedTweet[] {
  return ranked
    .filter((tweet) => !lowViewTweet(tweet, settings))
    .slice(0, settings.rankingLimit);
}
export function dockEdge(
  x: number,
  width: number,
  viewportWidth: number,
): Settings["dock"] {
  if (x <= 24) return "left";
  if (viewportWidth - x - width <= 24) return "right";
  return null;
}
