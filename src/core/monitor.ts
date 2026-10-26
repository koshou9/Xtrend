import type {
  BarkSettings,
  MonitorEvent,
  MonitorHit,
  MonitoringSettings,
  NotificationSettings,
  PushStatus,
} from "./features";
import type { Settings, Tweet } from "./types";
import type { StoragePort } from "./cache";
import {
  averageSpeed,
  staleReading,
  READING_MAX_AGE,
  viewReadingAt,
} from "./metrics";
import { fold } from "./filtering";
import { boundedText } from "./response";

export const MONITOR_KEY = "monitor-events:v1";
const TTL = 30 * 86400000;
const CONTROL = "push-control:v1";
export function validateNotifications(value: unknown): NotificationSettings {
  const v =
    value && typeof value === "object"
      ? (value as Partial<NotificationSettings>)
      : {};
  const time = (s: unknown, fallback: string) =>
    typeof s === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)
      ? s
      : fallback;
  return {
    quietEnabled: v.quietEnabled === true,
    quietStart: time(v.quietStart, "22:00"),
    quietEnd: time(v.quietEnd, "08:00"),
    mergeMinutes:
      typeof v.mergeMinutes === "number" &&
      Number.isInteger(v.mergeMinutes) &&
      v.mergeMinutes >= 0 &&
      v.mergeMinutes <= 60
        ? v.mergeMinutes
        : 0,
    cooldownMinutes:
      typeof v.cooldownMinutes === "number" &&
      Number.isInteger(v.cooldownMinutes) &&
      v.cooldownMinutes >= 0 &&
      v.cooldownMinutes <= 1440
        ? v.cooldownMinutes
        : 0,
  };
}
export function quietNow(value: NotificationSettings, now: number): boolean {
  if (!value.quietEnabled || value.quietStart === value.quietEnd) return false;
  const date = new Date(now),
    minute = date.getHours() * 60 + date.getMinutes(),
    parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const from = parse(value.quietStart),
    to = parse(value.quietEnd);
  return from < to
    ? minute >= from && minute < to
    : minute >= from || minute < to;
}
export function defaultMonitoring(): MonitoringSettings {
  return {
    enabled: false,
    accounts: [],
    keywords: [],
    minViews: 10000,
    minVelocity: 0,
    repeatPercent: 0,
  };
}
export function parseTargets(
  text: string,
): NonNullable<MonitoringSettings["targets"]> {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > 100) throw new Error("invalidTargets");
  const keys = new Set<string>();
  return lines.map((line) => {
    const [kind, raw, views, velocity, extra] = line
        .split("|")
        .map((s) => s.trim()),
      value =
        kind === "account"
          ? fold(raw ?? "").replace(/^@/, "")
          : fold(raw ?? "");
    if (
      !["account", "keyword"].includes(kind ?? "") ||
      !value ||
      value.length > 100 ||
      (kind === "account" && !/^\w{1,50}$/.test(value)) ||
      !views ||
      !velocity ||
      extra !== undefined ||
      !Number.isSafeInteger(Number(views)) ||
      Number(views) < 0 ||
      !Number.isFinite(Number(velocity)) ||
      Number(velocity) < 0 ||
      keys.has(`${kind}:${value}`)
    )
      throw new Error("invalidTargets");
    keys.add(`${kind}:${value}`);
    return {
      kind: kind as "account" | "keyword",
      value,
      minViews: Number(views),
      minVelocity: Number(velocity),
    };
  });
}
export function validateMonitoring(value: unknown): MonitoringSettings {
  const d = defaultMonitoring();
  if (!value || typeof value !== "object") return d;
  const v = value as Partial<MonitoringSettings>;
  const accounts = Array.isArray(v.accounts)
    ? [
        ...new Set(
          v.accounts
            .filter(
              (a): a is string => typeof a === "string" && /^\w{1,50}$/.test(a),
            )
            .map((a) => a.toLowerCase()),
        ),
      ].slice(0, 200)
    : [];
  const keywords = Array.isArray(v.keywords)
    ? [
        ...new Set(
          v.keywords
            .filter(
              (a): a is string =>
                typeof a === "string" && !!a.trim() && a.length <= 100,
            )
            .map(fold),
        ),
      ].slice(0, 100)
    : [];
  const targets = Array.isArray(v.targets)
    ? v.targets
        .slice(0, 100)
        .filter(
          (t) =>
            t &&
            ["account", "keyword"].includes(t.kind) &&
            typeof t.value === "string" &&
            t.value.trim() &&
            t.value.length <= 100 &&
            (t.kind !== "account" ||
              /^\w{1,50}$/.test(fold(t.value).replace(/^@/, ""))) &&
            Number.isSafeInteger(t.minViews) &&
            t.minViews >= 0 &&
            Number.isFinite(t.minVelocity) &&
            t.minVelocity >= 0,
        )
        .map((t) => ({
          kind: t.kind,
          value:
            t.kind === "account"
              ? fold(t.value).replace(/^@/, "")
              : fold(t.value),
          minViews: t.minViews,
          minVelocity: t.minVelocity,
        }))
    : [];
  return {
    enabled:
      v.enabled === true &&
      accounts.length + keywords.length + targets.length > 0,
    accounts,
    keywords,
    targets,
    repeatPercent: [25, 50, 100].includes(v.repeatPercent ?? 0)
      ? v.repeatPercent
      : 0,
    minViews:
      Number.isSafeInteger(v.minViews) && v.minViews! >= 0
        ? v.minViews!
        : d.minViews,
    minVelocity:
      typeof v.minVelocity === "number" &&
      Number.isFinite(v.minVelocity) &&
      v.minVelocity >= 0
        ? v.minVelocity
        : 0,
  };
}
export function monitorHit(
  tweet: Tweet,
  settings: MonitoringSettings,
  account: string,
  now = Date.now(),
): MonitorHit | null {
  if (!settings.enabled || staleReading(tweet, now)) return null;
  const reasons: string[] = [],
    handle = tweet.author.handle.toLowerCase(),
    text = fold(tweet.text),
    velocity = averageSpeed(tweet, now);
  if (settings.accounts.includes(handle)) reasons.push(`account:@${handle}`);
  for (const word of settings.keywords)
    if (text.includes(fold(word))) reasons.push(`keyword:${word}`);
  for (const target of settings.targets ?? [])
    if (
      target.kind === "account"
        ? target.value === handle
        : text.includes(target.value)
    )
      reasons.push(
        `${target.kind === "account" ? "account:@" : "keyword:"}${target.value}`,
      );
  const hit = {
    id: tweet.id,
    account,
    author: { name: tweet.author.name, handle },
    url: `https://x.com/${handle}/status/${tweet.id}`,
    views: tweet.counts.views,
    velocity,
    reasons: [...new Set(reasons)],
    at: now,
    observedAt: viewReadingAt(tweet),
  };
  // Select qualifying reasons before applying the display/storage limit.
  hit.reasons = hit.reasons
    .filter((reason) => eligibleHit({ ...hit, reasons: [reason] }, settings))
    .slice(0, 8);
  if (!hit.reasons.length) return null;
  return hit;
}
export function cleanHit(value: unknown, now = Date.now()): MonitorHit | null {
  if (!value || typeof value !== "object") return null;
  const v = value as MonitorHit;
  if (
    typeof v.id !== "string" ||
    !/^\d{1,30}$/.test(v.id) ||
    typeof v.account !== "string" ||
    !/^\w{1,50}$/.test(v.account) ||
    !v.author ||
    typeof v.author.name !== "string" ||
    !/^\w{1,50}$/.test(v.author.handle) ||
    typeof v.at !== "number" ||
    !Number.isFinite(v.at) ||
    v.at < 0 ||
    v.at > now ||
    (v.observedAt !== undefined &&
      (typeof v.observedAt !== "number" ||
        !Number.isFinite(v.observedAt) ||
        v.observedAt < 0 ||
        v.observedAt > v.at)) ||
    (v.views !== null && (!Number.isSafeInteger(v.views) || v.views < 0)) ||
    (v.velocity !== null &&
      (typeof v.velocity !== "number" ||
        !Number.isFinite(v.velocity) ||
        v.velocity < 0))
  )
    return null;
  const number = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  if (
    !Array.isArray(v.reasons) ||
    !v.reasons.length ||
    v.reasons.length > 8 ||
    !v.reasons.every(
      (s) =>
        typeof s === "string" &&
        s.length <= 120 &&
        /^(account:@|keyword:)/.test(s),
    )
  )
    return null;
  return {
    id: v.id,
    account: v.account.toLowerCase(),
    author: {
      name: v.author.name.slice(0, 200),
      handle: v.author.handle.toLowerCase(),
    },
    url: `https://x.com/${v.author.handle.toLowerCase()}/status/${v.id}`,
    views: number(v.views),
    velocity: number(v.velocity),
    reasons: v.reasons.slice(0, 8),
    at: v.at,
    ...(v.observedAt === undefined ? {} : { observedAt: v.observedAt }),
  };
}
export function eligibleHit(
  hit: MonitorHit,
  settings: MonitoringSettings,
): boolean {
  const meets = (views: number, velocity: number) =>
    !(views > 0 && (hit.views === null || hit.views < views)) &&
    !(velocity > 0 && (hit.velocity === null || hit.velocity < velocity));
  return (
    settings.enabled &&
    hit.reasons.some((reason) => {
      const kind = reason.startsWith("account:@") ? "account" : "keyword",
        value = kind === "account" ? reason.slice(9) : fold(reason.slice(8));
      const custom = settings.targets?.find(
        (t) => t.kind === kind && t.value === value,
      );
      return custom
        ? meets(custom.minViews, custom.minVelocity)
        : (kind === "account"
            ? settings.accounts.includes(value)
            : settings.keywords.includes(value)) &&
            meets(settings.minViews, settings.minVelocity);
    })
  );
}
export function repeatHit(
  previous: MonitorHit,
  incoming: MonitorHit,
  percent: number,
  now = Date.now(),
): boolean {
  return (
    percent > 0 &&
    previous.views !== null &&
    incoming.views !== null &&
    incoming.views > previous.views &&
    incoming.views >= previous.views * (1 + percent / 100) &&
    now - previous.at >= 5 * 60000 &&
    (incoming.observedAt ?? incoming.at) > (previous.observedAt ?? previous.at)
  );
}
export class MonitorEngine {
  private queue = Promise.resolve();
  constructor(
    private storage: StoragePort,
    private settings: () => Promise<Settings>,
    private send: (
      hit: MonitorHit,
      settings: Settings,
      batch?: MonitorHit[],
    ) => Promise<PushStatus>,
    private now = () => Date.now(),
  ) {}
  private ordered<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work);
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  private async read(): Promise<MonitorEvent[]> {
    const data = await this.storage.get(MONITOR_KEY);
    const entries = Array.isArray(data)
      ? data.slice(0, 200).flatMap((v) => {
          const hit = cleanHit(v, this.now());
          if (!hit || hit.at > this.now() || this.now() - hit.at > TTL)
            return [];
          return [
            {
              ...hit,
              key: `${hit.account}:${hit.id}`,
              pushStatus: [
                "off",
                "sent",
                "failed",
                "permission",
                "limited",
                "queued",
                "quiet",
                "backoff",
              ].includes(v.pushStatus)
                ? v.pushStatus
                : "off",
              pushedAt:
                typeof v.pushedAt === "number" && Number.isFinite(v.pushedAt)
                  ? v.pushedAt
                  : null,
              dueAt:
                typeof v.dueAt === "number" && Number.isFinite(v.dueAt)
                  ? v.dueAt
                  : hit.at,
            } as MonitorEvent,
          ];
        })
      : [];
    while (new TextEncoder().encode(JSON.stringify(entries)).length > 1000000)
      entries.pop();
    return entries;
  }
  private async writeEntries(entries: MonitorEvent[]) {
    while (new TextEncoder().encode(JSON.stringify(entries)).length > 1000000)
      entries.pop();
    const previous = await this.storage.get(MONITOR_KEY);
    if (entries.length) {
      if (JSON.stringify(previous) !== JSON.stringify(entries))
        await this.storage.set(MONITOR_KEY, entries);
    } else if (previous !== undefined) await this.storage.remove(MONITOR_KEY);
  }
  list() {
    return this.ordered(async () => {
      const entries = await this.read();
      await this.writeEntries(entries);
      return entries;
    });
  }
  private async attempt(
    entries: MonitorHit[],
    settings: Settings,
    automatic = false,
  ): Promise<PushStatus> {
    const raw = (await this.storage.get(CONTROL)) as
      | { attempts?: number[]; failureUntil?: number; lastSent?: number }
      | undefined;
    const now = this.now(),
      attempts = (Array.isArray(raw?.attempts) ? raw.attempts : [])
        .filter((t) => typeof t === "number" && t <= now && now - t < 60000)
        .slice(-5);
    if (attempts.length >= 5) return "limited";
    if (typeof raw?.failureUntil === "number" && raw.failureUntil > now)
      return "backoff";
    if (
      typeof raw?.lastSent === "number" &&
      now - raw.lastSent < settings.notifications.cooldownMinutes * 60000
    )
      return "limited";
    // Reserve before I/O, including failures, retries and test notifications.
    await this.storage.set(CONTROL, {
      attempts: [...attempts, now],
      lastSent: raw?.lastSent ?? null,
      failureUntil: 0,
    });
    const current = await this.settings();
    if (
      !current.bark.enabled ||
      (automatic &&
        (!current.monitoring.enabled ||
          !entries.every((entry) => eligibleHit(entry, current.monitoring)))) ||
      current.bark.server !== settings.bark.server ||
      current.bark.deviceKey !== settings.bark.deviceKey
    )
      return "off";
    const status = await this.send(entries[0]!, current, entries).catch(
      () => "failed" as const,
    );
    await this.storage.set(CONTROL, {
      attempts: [...attempts, now],
      lastSent: status === "sent" ? this.now() : (raw?.lastSent ?? null),
      failureUntil: status === "failed" ? this.now() + 30000 : 0,
    });
    return status;
  }
  record(value: unknown) {
    return this.ordered(async () => {
      const hit = cleanHit(value, this.now()),
        settings = await this.settings();
      if (
        !hit ||
        this.now() - (hit.observedAt ?? hit.at) > READING_MAX_AGE ||
        !eligibleHit(hit, settings.monitoring)
      )
        return null;
      const entries = await this.read(),
        key = `${hit.account}:${hit.id}`,
        existing = entries.find((e) => e.key === key);
      if (
        existing &&
        !repeatHit(
          existing,
          hit,
          settings.monitoring.repeatPercent ?? 0,
          this.now(),
        )
      )
        return existing;
      const entry: MonitorEvent = {
        ...hit,
        at: this.now(),
        key,
        pushStatus: "off",
        pushedAt: null,
        dueAt: this.now() + settings.notifications.mergeMinutes * 60000,
      };
      // Persist before sending: worker interruption cannot cause a duplicate automatic push.
      const next = [entry, ...entries.filter((e) => e.key !== key)].slice(
        0,
        200,
      );
      await this.writeEntries(next);
      if (settings.bark.enabled) {
        entry.pushStatus = quietNow(settings.notifications, this.now())
          ? "quiet"
          : settings.notifications.mergeMinutes > 0
            ? "queued"
            : await this.attempt([entry], settings, true);
        if (entry.pushStatus === "sent") entry.pushedAt = this.now();
        await this.writeEntries(next);
      }
      return entry;
    });
  }
  retry(key: string) {
    return this.ordered(async () => {
      const entries = await this.read(),
        entry = entries.find((e) => e.key === key),
        settings = await this.settings();
      if (!entry || !settings.bark.enabled) throw new Error("barkDisabled");
      if (entry.pushStatus === "sent") return entry;
      entry.pushStatus = quietNow(settings.notifications, this.now())
        ? "quiet"
        : await this.attempt([entry], settings);
      if (entry.pushStatus === "sent") entry.pushedAt = this.now();
      await this.writeEntries(entries);
      return entry;
    });
  }
  test(hit: MonitorHit) {
    return this.ordered(async () => {
      const settings = await this.settings();
      if (!settings.bark.enabled) throw new Error("barkDisabled");
      return this.attempt([hit], settings);
    });
  }
  flush() {
    return this.ordered(async () => {
      const entries = await this.read(),
        settings = await this.settings();
      if (!settings.bark.enabled || !settings.monitoring.enabled) {
        for (const entry of entries)
          if (["quiet", "queued"].includes(entry.pushStatus))
            entry.pushStatus = "off";
      } else if (!quietNow(settings.notifications, this.now())) {
        const pending = entries
          .filter(
            (e) =>
              ["quiet", "queued"].includes(e.pushStatus) &&
              (e.dueAt ?? e.at) <= this.now(),
          )
          .reverse();
        for (let i = 0; i < pending.length; i += 10) {
          const group = pending.slice(i, i + 10),
            status = await this.attempt(group, settings, true);
          for (const entry of group) {
            entry.pushStatus = status;
            if (status === "sent") entry.pushedAt = this.now();
          }
        }
      }
      await this.writeEntries(entries);
      return entries;
    });
  }
  clear() {
    return this.ordered(() => this.storage.remove(MONITOR_KEY));
  }
}
export function barkServer(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalidBark");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  )
    throw new Error("invalidBark");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}
export function validBark(value: BarkSettings): boolean {
  try {
    barkServer(value.server);
    return /^[a-zA-Z0-9_-]{6,200}$/.test(value.deviceKey);
  } catch {
    return false;
  }
}
export function validateBark(value: unknown): BarkSettings {
  const v =
    value && typeof value === "object" ? (value as Partial<BarkSettings>) : {};
  const server =
      typeof v.server === "string" && v.server.length <= 2000
        ? v.server.trim()
        : "https://api.day.app",
    deviceKey =
      typeof v.deviceKey === "string" ? v.deviceKey.trim().slice(0, 200) : "";
  return {
    server,
    deviceKey,
    enabled:
      v.enabled === true && validBark({ server, deviceKey, enabled: true }),
  };
}
export function barkPayload(
  hit: MonitorHit,
  settings: Settings,
  batch: MonitorHit[] = [hit],
) {
  const labels = {
    en: ["Xtrend · Popular post", "Views", "Views/hour", "Account", "Keyword"],
    zh: ["Xtrend · 热帖提醒", "浏览量", "浏览/小时", "账号", "关键词"],
    ja: [
      "Xtrend · 注目ポスト",
      "表示回数",
      "表示/時間",
      "アカウント",
      "キーワード",
    ],
  }[settings.language];
  const payload = {
    device_key: settings.bark.deviceKey,
    title: labels[0] + (batch.length > 1 ? ` · ${batch.length}` : ""),
    body: batch
      .slice(0, 10)
      .map(
        (hit) =>
          `${hit.author.name} (@${hit.author.handle})\n${hit.reasons.map((r) => (r.startsWith("account:@") ? `${labels[3]}: ${r.slice(8)}` : `${labels[4]}: ${r.slice(8)}`)).join(" / ")}\n${labels[1]}: ${hit.views ?? "—"} · ${labels[2]}: ${hit.velocity === null ? "—" : Math.round(hit.velocity)}${batch.length > 1 ? `\n${hit.url}` : ""}`,
      )
      .join("\n\n"),
    url: hit.url,
    group: "Xtrend",
  };
  // Keep long merged metadata small enough for a mobile notification. Never add tweet text.
  const encoder = new TextEncoder();
  while (encoder.encode(JSON.stringify(payload)).length > 3500)
    payload.body =
      Array.from(payload.body)
        .slice(0, Math.floor(Array.from(payload.body).length * 0.8))
        .join("") + "…";
  return payload;
}
export async function postBark(
  hit: MonitorHit,
  settings: Settings,
  permitted: (origin: string) => Promise<boolean>,
  fetcher: typeof fetch = fetch,
  batch: MonitorHit[] = [hit],
): Promise<PushStatus> {
  if (!settings.bark.enabled || !validBark(settings.bark)) return "off";
  const server = barkServer(settings.bark.server);
  if (!(await permitted(server.origin + "/*"))) return "permission";
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(server.href.replace(/\/$/, "") + "/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(barkPayload(hit, settings, batch)),
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return "failed";
    const text = await boundedText(response, 32000);
    try {
      return JSON.parse(text).code === 200 ? "sent" : "failed";
    } catch {
      return "failed";
    }
  } catch {
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}
