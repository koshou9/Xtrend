import { GraphCache } from "../core/cache";
import { Samples, rankTweets, viewReadingAt } from "../core/metrics";
import type {
  Capabilities,
  GraphPage,
  PageSnapshot,
  PageTransport,
  Settings,
  Tweet,
  RankedTweet,
  PageScope,
} from "../core/types";
import { pageScope } from "../core/ranking";
import { validateSettings } from "../core/settings";
import { mergeRelations } from "../core/cache";
import type { StoragePort } from "../core/cache";
import { monitorHit, repeatHit } from "../core/monitor";
import type { MonitorHit } from "../core/features";
import { SavedLibrary, type LibraryPort } from "../core/research";
export type Modal =
  | { type: "settings" | "ranking-settings" | "filtered" | "batch" }
  | { type: "star" | "grok" | "trend"; tweet: Tweet }
  | { type: "image"; photos: string[]; index: number }
  | { type: "copy"; text: string }
  | { type: "saved"; tweet?: Tweet }
  | null;
export interface ModelState {
  settings: Settings;
  ranked: RankedTweet[];
  selectedTweetId: string | null;
  modal: Modal;
  capabilities: Capabilities;
  account: string;
  scope: PageScope | null;
  toast: string;
  revision: number;
  filtered: { id: string; reason: string }[];
  batch: string[];
  columns: string[];
  column: string | null;
  issue: string;
}
export class Workspace {
  private raw = new Map<string, Tweet>();
  private visible = new Set<string>();
  private graphs = new Map<string, GraphPage>();
  private listeners = new Set<() => void>();
  readonly samples = new Samples();
  readonly cache: Pick<GraphCache, "get" | "put" | "clear">;
  readonly library: LibraryPort;
  transport!: PageTransport;
  private state: ModelState;
  private timer: ReturnType<typeof setInterval>;
  private saveQueue = Promise.resolve();
  private pendingWrites = 0;
  private reported = new Map<string, MonitorHit>();
  private reporting = new Map<string, number>();
  private monitorConfig = "";
  private monitorGeneration = 0;
  private tweetColumns = new Map<string, Set<string>>();
  private restored = new Set<string>();
  private dataRevision = 0;
  constructor(
    settings: Settings,
    storage: StoragePort,
    readonly save: (
      settings: Settings,
      previous?: Settings,
    ) => Promise<Settings | void>,
    readonly actions: {
      jump: (tweet: Tweet) => boolean;
      back: () => void;
      fill: (tweet: Tweet, text: string) => boolean;
      monitor?: (hit: MonitorHit) => Promise<void>;
      cache?: Pick<GraphCache, "get" | "put" | "clear">;
      library?: LibraryPort;
    },
    account = "anonymous",
  ) {
    this.cache = actions.cache ?? new GraphCache(storage);
    this.library = actions.library ?? new SavedLibrary(storage);
    this.state = {
      settings,
      ranked: [],
      selectedTweetId: null,
      modal: null,
      capabilities: {
        reposts: false,
        quotes: false,
        grok: false,
        temporary: false,
      },
      account,
      scope: pageScope(
        typeof location === "undefined" ? "https://x.com/home" : location.href,
      ),
      toast: "",
      revision: 0,
      filtered: [],
      batch: [],
      columns: [],
      column: null,
      issue: "",
    };
    this.timer = setInterval(() => this.recalculate(), 15_000);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private emit(patch: Partial<ModelState>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.listeners.forEach((fn) => fn());
  }
  private recalculate() {
    this.emit({
      ranked: rankTweets(
        [...this.visible]
          .filter(
            (id) =>
              !this.state.column ||
              this.tweetColumns.get(id)?.has(this.state.column),
          )
          .flatMap((id) => this.raw.get(id) ?? []),
        this.samples,
        this.state.settings,
      ),
    });
  }
  rankingSettings() {
    const rule = this.state.column
      ? this.state.settings.columnRules[this.state.column]
      : null;
    return rule
      ? {
          ...this.state.settings,
          rankingLimit: rule.rankingLimit,
          minimumViews: rule.minimumViews,
        }
      : this.state.settings;
  }
  columns(values: string[]) {
    if (JSON.stringify(this.state.columns) !== JSON.stringify(values)) {
      this.emit({
        columns: values,
        column:
          this.state.column && values.includes(this.state.column)
            ? this.state.column
            : null,
      });
      this.recalculate();
    }
  }
  column(value: string | null) {
    this.emit({ column: value });
    this.recalculate();
  }
  place(id: string, column: string | null) {
    if (!column) return;
    const values = this.tweetColumns.get(id) ?? new Set<string>();
    if (!values.has(column)) {
      values.add(column);
      this.tweetColumns.set(id, values);
      if (this.visible.has(id)) this.recalculate();
    }
  }
  filterVersion() {
    return `${this.dataRevision}:${JSON.stringify([this.state.settings.filtering, this.state.settings.hotOnly, this.state.settings.minimumViews, this.state.settings.rankingScopes, this.state.settings.columnRules, this.state.settings.panel])}:${this.state.scope}`;
  }
  isRestored(id: string) {
    return this.restored.has(id);
  }
  filtered(values: { id: string; reason: string }[]) {
    if (JSON.stringify(values) !== JSON.stringify(this.state.filtered))
      this.emit({ filtered: values });
  }
  restore(id?: string) {
    for (const value of id ? [id] : this.state.filtered.map((f) => f.id))
      this.restored.add(value);
    this.dataRevision++;
    this.emit({});
  }
  select(id: string) {
    const batch = this.state.batch.includes(id)
      ? this.state.batch.filter((v) => v !== id)
      : [...this.state.batch, id].slice(-200);
    this.emit({ batch });
  }
  clearBatch() {
    this.emit({ batch: [] });
  }
  selected() {
    return this.state.batch.flatMap((id) => this.raw.get(id) ?? []);
  }
  health() {
    return {
      posts: this.visible.size,
      lastRead: Math.max(0, ...[...this.raw.values()].map((t) => t.observedAt)),
      capabilities: this.state.capabilities,
      error: this.state.issue,
    };
  }
  ingest(snapshot: PageSnapshot) {
    if (
      snapshot.capabilities &&
      typeof snapshot.capabilities.grok === "boolean"
    )
      this.emit({ capabilities: snapshot.capabilities });
    for (const tweet of snapshot.tweets.slice(0, 1000))
      this.upsert(tweet, false, true);
    if (
      snapshot.graph &&
      /^\d+$/.test(snapshot.graph.id) &&
      ["repost", "quote"].includes(snapshot.graph.kind)
    ) {
      const key = `${snapshot.graph.id}:${snapshot.graph.kind}`,
        previous = this.graphs.get(key);
      this.graphs.set(key, {
        ...snapshot.graph.page,
        relations: mergeRelations(
          previous?.relations ?? [],
          snapshot.graph.page.relations,
        ),
      });
      while (this.graphs.size > 20)
        this.graphs.delete(this.graphs.keys().next().value!);
    }
    this.recalculate();
    this.observeMonitor();
  }
  upsert(tweet: Tweet, seen = true, batch = false) {
    if (
      !tweet ||
      !/^\d{1,30}$/.test(tweet.id) ||
      !tweet.author ||
      typeof tweet.text !== "string" ||
      !tweet.counts
    )
      return;
    const old = this.raw.get(tweet.id);
    const incomingAt = viewReadingAt(tweet),
      previousAt = old ? viewReadingAt(old) : -1,
      hasViews =
        Number.isSafeInteger(tweet.counts.views) && tweet.counts.views! >= 0,
      acceptViews =
        hasViews &&
        incomingAt >= previousAt &&
        (!old ||
          old.counts.views === null ||
          (tweet.source === "graphql"
            ? incomingAt > previousAt
            : tweet.counts.views !== old.counts.views));
    // Keep complete response text, but accept newer exact page counts independently.
    if (old) {
      const content =
        (tweet.source === "graphql" && tweet.observedAt >= old.observedAt) ||
        old.source !== "graphql"
          ? tweet
          : old;
      tweet = {
        ...content,
        observedAt: Math.max(old.observedAt, tweet.observedAt),
        counts: Object.fromEntries(
          Object.keys(old.counts).map((key) => {
            const field = key as keyof Tweet["counts"];
            return [
              field,
              field === "views"
                ? acceptViews
                  ? tweet.counts.views
                  : old.counts.views
                : tweet.observedAt >= old.observedAt
                  ? (tweet.counts[field] ?? old.counts[field])
                  : old.counts[field],
            ];
          }),
        ) as Tweet["counts"],
        viewsObservedAt: acceptViews ? incomingAt : previousAt,
      };
    } else
      tweet = { ...tweet, viewsObservedAt: hasViews ? incomingAt : undefined };
    const changed = !old || JSON.stringify(old) !== JSON.stringify(tweet);
    if (changed) {
      if (
        !old ||
        old.text !== tweet.text ||
        old.replyTo !== tweet.replyTo ||
        JSON.stringify(old.counts) !== JSON.stringify(tweet.counts)
      )
        this.dataRevision++;
      if (acceptViews) this.samples.update(tweet);
      this.raw.set(tweet.id, tweet);
    }
    while (this.raw.size > 1500) {
      const first = this.raw.keys().next().value!;
      this.raw.delete(first);
      this.visible.delete(first);
      this.samples.delete(first);
      this.tweetColumns.delete(first);
      this.restored.delete(first);
      this.reported.delete(first);
      this.reporting.delete(first);
      if (this.state.batch.includes(first))
        this.emit({ batch: this.state.batch.filter((id) => id !== first) });
    }
    if (seen) {
      this.visible.add(tweet.id);
      this.recalculate();
      this.observeMonitor();
    } else if (!batch && changed && this.visible.has(tweet.id)) {
      this.recalculate();
      this.observeMonitor();
    }
  }
  seen(id: string) {
    if (this.raw.has(id) && !this.visible.has(id)) {
      this.visible.add(id);
      this.recalculate();
      this.observeMonitor();
    }
  }
  private observeMonitor() {
    if (!this.actions.monitor) return;
    const config = JSON.stringify(this.state.settings.monitoring);
    if (config !== this.monitorConfig) {
      this.reported.clear();
      this.reporting.clear();
      this.monitorGeneration++;
      this.monitorConfig = config;
    }
    if (!this.state.settings.monitoring.enabled) return;
    for (const id of this.visible) {
      if (this.reporting.has(id)) continue;
      const columns = this.tweetColumns.get(id);
      if (
        columns?.size &&
        [...columns].every(
          (key) => this.state.settings.columnRules[key]?.monitor === false,
        )
      )
        continue;
      const tweet = this.raw.get(id),
        hit = tweet
          ? monitorHit(
              tweet,
              this.state.settings.monitoring,
              this.state.account,
            )
          : null;
      if (!hit) continue;
      const previous = this.reported.get(id);
      if (
        previous &&
        !repeatHit(
          previous,
          hit,
          this.state.settings.monitoring.repeatPercent ?? 0,
        )
      )
        continue;
      const generation = this.monitorGeneration;
      this.reporting.set(id, generation);
      void this.actions
        .monitor(hit)
        .then(() => {
          if (generation === this.monitorGeneration && this.raw.has(id))
            this.reported.set(id, hit);
        })
        .catch(() => {
          if (
            generation === this.monitorGeneration &&
            this.state.issue !== "monitorFailed"
          )
            this.emit({ issue: "monitorFailed" });
        })
        .finally(() => {
          if (this.reporting.get(id) === generation) this.reporting.delete(id);
        });
    }
  }
  get(id: string) {
    return this.raw.get(id);
  }
  locate(tweet: Tweet) {
    const found = this.actions.jump(tweet);
    this.emit({ selectedTweetId: found ? tweet.id : null });
    return found;
  }
  clearSelection() {
    if (this.state.selectedTweetId !== null)
      this.emit({ selectedTweetId: null });
  }
  graph(id: string, kind: "repost" | "quote") {
    return this.graphs.get(`${id}:${kind}`) ?? null;
  }
  open(modal: Modal) {
    this.emit({ modal });
  }
  notify(message: string) {
    this.emit({ toast: message });
  }
  settings(settings: Settings) {
    this.emit({ settings });
    this.recalculate();
    this.observeMonitor();
  }
  acceptSettings(settings: Settings) {
    if (!this.pendingWrites) this.settings(settings);
  }
  update(patch: Partial<Settings>) {
    const previous = this.state.settings,
      settings = validateSettings({ ...previous, ...patch });
    this.settings(settings);
    this.pendingWrites++;
    const write = this.saveQueue.then(() => this.save(settings, previous));
    this.saveQueue = write.then(
      () => {},
      () => {},
    );
    return write
      .then((saved) => {
        if (saved && this.state.settings === settings) this.settings(saved);
      })
      .catch((error) => {
        if (this.state.settings === settings) this.settings(previous);
        throw error;
      })
      .finally(() => {
        this.pendingWrites--;
      });
  }
  page(url: string) {
    const scope = pageScope(url);
    if (scope !== this.state.scope) this.emit({ scope });
  }
  account(account: string) {
    if (account === this.state.account) return false;
    this.reset();
    this.emit({
      account,
      modal: null,
      capabilities: {
        reposts: false,
        quotes: false,
        grok: false,
        temporary: false,
      },
    });
    return true;
  }
  reset() {
    this.raw.clear();
    this.visible.clear();
    this.samples.clear();
    this.graphs.clear();
    this.tweetColumns.clear();
    this.restored.clear();
    this.reported.clear();
    this.reporting.clear();
    this.dataRevision++;
    this.monitorGeneration++;
    this.emit({
      modal: null,
      ranked: [],
      selectedTweetId: null,
      filtered: [],
      batch: [],
      column: null,
      columns: [],
      issue: "",
    });
  }
  destroy() {
    clearInterval(this.timer);
    this.reset();
    this.listeners.clear();
  }
}
