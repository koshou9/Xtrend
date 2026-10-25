import type { Settings, Tweet, RankedTweet } from "./types";

export const READING_MAX_AGE = 5 * 60_000;
export const viewReadingAt = (tweet: Tweet) =>
  tweet.viewsObservedAt ?? tweet.observedAt;
export function staleReading(tweet: Tweet, now = Date.now()) {
  const at = viewReadingAt(tweet);
  return !Number.isFinite(at) || at > now || now - at > READING_MAX_AGE;
}
export function averageSpeed(tweet: Tweet, now = Date.now()): number | null {
  const at = viewReadingAt(tweet);
  if (
    tweet.counts.views === null ||
    !Number.isSafeInteger(tweet.counts.views) ||
    tweet.counts.views < 0 ||
    tweet.createdAt === null ||
    !Number.isFinite(tweet.createdAt) ||
    at - tweet.createdAt < 60_000 ||
    staleReading(tweet, now)
  )
    return null;
  return tweet.counts.views / ((at - tweet.createdAt) / 3_600_000);
}
export function tier(
  speed: number | null,
  settings: Pick<Settings, "rising" | "viral">,
): RankedTweet["tier"] {
  return speed === null || speed < settings.rising
    ? "normal"
    : speed < settings.viral
      ? "rising"
      : "viral";
}
export function burstIndex(
  tweet: Tweet,
  settings: Settings,
  now = Date.now(),
): number | null {
  const speed = averageSpeed(tweet, now);
  return speed === null ? null : (speed / settings.viral) * 100;
}
export class Samples {
  private samples = new Map<
    string,
    {
      first: { at: number; views: number };
      last: { at: number; views: number };
      growth: number | null;
      interval: { from: number; to: number } | null;
      points: { at: number; views: number }[];
    }
  >();
  update(tweet: Tweet) {
    const views = tweet.counts.views;
    if (views === null || !Number.isSafeInteger(views) || views < 0) return;
    const old = this.samples.get(tweet.id),
      at = viewReadingAt(tweet);
    if (!Number.isFinite(at)) return;
    if (old && at <= old.last.at) return;
    if (!old || views < old.last.views || at - old.last.at > READING_MAX_AGE) {
      this.samples.set(tweet.id, {
        first: { at, views },
        last: { at, views },
        growth: null,
        interval: null,
        points: [{ at, views }],
      });
      return;
    }
    old.last = { at, views };
    old.points.push({ at, views });
    old.points = old.points.slice(-60);
    if (at - old.first.at >= 60_000) {
      old.growth =
        (views - old.first.views) / ((at - old.first.at) / 3_600_000);
      old.interval = { from: old.first.at, to: at };
      old.first = { at, views };
    }
  }
  get(id: string, now?: number) {
    const sample = this.samples.get(id);
    if (
      now !== undefined &&
      (!sample?.interval ||
        now < sample.interval.to ||
        now - sample.interval.to > READING_MAX_AGE)
    )
      return null;
    return sample?.growth ?? null;
  }
  info(id: string) {
    const sample = this.samples.get(id);
    return { interval: sample?.interval ?? null, points: sample?.points ?? [] };
  }
  delete(id: string) {
    this.samples.delete(id);
  }
  get size() {
    return this.samples.size;
  }
  clear() {
    this.samples.clear();
  }
}
export function rankTweets(
  tweets: Tweet[],
  samples: Samples,
  settings: Settings,
  now = Date.now(),
): RankedTweet[] {
  return tweets
    .map((tweet) => {
      const average = averageSpeed(tweet, now);
      return {
        ...tweet,
        average,
        growth: staleReading(tweet, now) ? null : samples.get(tweet.id, now),
        tier: tier(average, settings),
      };
    })
    .sort((a, b) => {
      if ((a.growth !== null) !== (b.growth !== null))
        return a.growth !== null ? -1 : 1;
      return (b.growth ?? b.average ?? -1) - (a.growth ?? a.average ?? -1);
    });
}
export function compact(value: number | null, locale: string = "en"): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
}
