import type { Relation, GraphPage } from "./types";
import { cleanGraph } from "./wire";
export interface StoragePort {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface CacheEntry {
  account: string;
  tweetId: string;
  kind: "repost" | "quote";
  page: GraphPage;
  touchedAt: number;
}
const KEY = "graph-cache:v1";
const TTL = 7 * 24 * 60 * 60_000;
export const GRAPH_BUDGET = 5 * 1024 * 1024;
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function relationKey(r: Relation): string {
  return r.kind === "repost" ? `r:${r.author.id}` : `q:${r.tweet.id}`;
}
export function mergeRelations(a: Relation[], b: Relation[]): Relation[] {
  return [...new Map([...a, ...b].map((r) => [relationKey(r), r])).values()];
}
export class GraphCache {
  private static queues = new WeakMap<StoragePort, Promise<unknown>>();
  constructor(
    private storage: StoragePort,
    private now = () => Date.now(),
  ) {}
  private transact<T>(fn: () => Promise<T>): Promise<T> {
    const result = (
      GraphCache.queues.get(this.storage) ?? Promise.resolve()
    ).then(fn);
    GraphCache.queues.set(
      this.storage,
      result.then(
        () => {},
        () => {},
      ),
    );
    return result;
  }
  private async entries(): Promise<CacheEntry[]> {
    const data = await this.storage.get(KEY);
    return Array.isArray(data)
      ? data.slice(0, 1000).flatMap((v) => {
          if (
            !v ||
            typeof v.account !== "string" ||
            !/^\d+$/.test(v.tweetId) ||
            !["repost", "quote"].includes(v.kind) ||
            !Number.isFinite(v.touchedAt)
          )
            return [];
          const page = cleanGraph(v.page);
          return page &&
            this.now() - page.observedAt < TTL &&
            page.observedAt <= this.now()
            ? [
                {
                  account: v.account,
                  tweetId: v.tweetId,
                  kind: v.kind,
                  touchedAt: v.touchedAt,
                  page,
                },
              ]
            : [];
        })
      : [];
  }
  get(account: string, tweetId: string, kind: "repost" | "quote") {
    return this.transact(async () => {
      if (!account || account === "anonymous") return null;
      const entries = await this.entries(),
        entry = entries.find(
          (e) =>
            e.account === account && e.tweetId === tweetId && e.kind === kind,
        );
      if (entry) entry.touchedAt = this.now();
      await this.storage.set(KEY, entries);
      return entry?.page ?? null;
    });
  }
  put(
    account: string,
    tweetId: string,
    kind: "repost" | "quote",
    page: GraphPage,
  ) {
    return this.transact(async () => {
      if (!account || account === "anonymous") return;
      let entries = (await this.entries()).filter(
        (e) =>
          !(e.account === account && e.tweetId === tweetId && e.kind === kind),
      );
      entries.push({ account, tweetId, kind, page, touchedAt: this.now() });
      entries.sort((a, b) => a.touchedAt - b.touchedAt);
      while (entries.length && bytes(entries) > GRAPH_BUDGET) entries.shift();
      await this.storage.set(KEY, entries);
    });
  }
  clear() {
    return this.transact(() => this.storage.remove(KEY));
  }
  prune() {
    return this.transact(async () => {
      const entries = await this.entries();
      entries.sort((a, b) => a.touchedAt - b.touchedAt);
      while (entries.length && bytes(entries) > GRAPH_BUDGET) entries.shift();
      if (
        JSON.stringify(await this.storage.get(KEY)) !== JSON.stringify(entries)
      )
        await this.storage.set(KEY, entries);
    });
  }
}
