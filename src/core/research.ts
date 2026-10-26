import type { Settings, Tweet } from "./types";
import type { StoragePort } from "./cache";
import { cleanTweet } from "./wire";
import { fold } from "./filtering";
import { averageSpeed, viewReadingAt } from "./metrics";

export interface ReadingQuery {
  text: string;
  author: string;
  since: string;
}
export function searchPosts<T extends Tweet>(
  posts: T[],
  query: ReadingQuery,
): T[] {
  const words = fold(query.text),
    author = fold(query.author).replace(/^@/, "");
  const since = query.since ? new Date(query.since + "T00:00:00").getTime() : 0;
  return posts.filter(
    (p) =>
      (!words || fold(p.text).includes(words)) &&
      (!author ||
        fold(p.author.handle).includes(author) ||
        fold(p.author.name).includes(author)) &&
      (!query.since || (p.createdAt !== null && p.createdAt >= since)),
  );
}
export const readingPresets = {
  reading: {
    panel: true,
    badges: true,
    hotOnly: false,
    rankingLimit: 10,
    dock: null,
  },
  research: {
    panel: true,
    badges: true,
    hotOnly: false,
    rankingLimit: 50,
    dock: null,
  },
  focus: {
    panel: true,
    badges: true,
    hotOnly: true,
    rankingLimit: 20,
    minimumViews: 10000,
    dock: null,
  },
} satisfies Record<string, Partial<Settings>>;

export function postsCSV(posts: Tweet[]): string {
  // Spreadsheet apps execute formulas even in quoted cells; keep user text literal.
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const iso = (at: number | null) => {
    const date = new Date(at ?? NaN);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  };
  return (
    "\uFEFF" +
    [
      [
        "Author",
        "Handle",
        "Text",
        "Published UTC",
        "Views",
        "Views/hour",
        "Reading UTC",
        "URL",
      ],
      ...posts.map((p) => [
        p.author.name,
        p.author.handle,
        p.text,
        iso(p.createdAt),
        p.counts.views,
        averageSpeed(p),
        iso(viewReadingAt(p)),
        p.url,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}

export interface SavedPost {
  tweet: Tweet;
  tags: string[];
  note: string;
  savedAt: number;
}
export interface LibraryPort {
  list(): Promise<SavedPost[]>;
  save(value: SavedPost): Promise<void>;
  remove(id: string): Promise<void>;
  restore?(entries: SavedPost[]): Promise<void>;
  watch?(changed: () => void): () => void;
}
export const LIBRARY_KEY = "saved-posts:v1";
export function cleanSavedPost(value: unknown): SavedPost | null {
  if (!value || typeof value !== "object") return null;
  const v = value as SavedPost,
    tweet = cleanTweet(v.tweet);
  if (
    !tweet ||
    v.tweet.text.length > 100000 ||
    typeof v.note !== "string" ||
    v.note.length > 2000 ||
    !Number.isFinite(v.savedAt) ||
    !Number.isFinite(new Date(v.savedAt).getTime()) ||
    v.savedAt < 0 ||
    !Array.isArray(v.tags) ||
    v.tags.length > 10 ||
    v.tags.some((t) => typeof t !== "string" || t.length > 30)
  )
    return null;
  return {
    tweet,
    note: v.note,
    tags: [...new Set(v.tags.map((t) => t.trim()).filter(Boolean))],
    savedAt: v.savedAt,
  };
}
function savedBatch(value: unknown): SavedPost[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("invalidLibrary");
  const entries = value.map(cleanSavedPost);
  if (
    entries.some((e) => !e) ||
    new Set(entries.map((e) => e?.tweet.id)).size !== entries.length
  )
    throw new Error("invalidLibrary");
  return entries as SavedPost[];
}
export function readSavedPosts(text: string): SavedPost[] {
  if (new TextEncoder().encode(text).length > 3 * 1024 * 1024)
    throw new Error("invalidLibrary");
  try {
    const data = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (data?.format !== "xtrend-saved-posts" || data.version !== 1)
      throw new Error("invalidLibrary");
    return savedBatch(data.entries);
  } catch {
    throw new Error("invalidLibrary");
  }
}
export class SavedLibrary {
  private queue = Promise.resolve();
  constructor(private storage: StoragePort) {}
  async list(): Promise<SavedPost[]> {
    const data = await this.storage.get(LIBRARY_KEY);
    return Array.isArray(data)
      ? data.slice(0, 100).flatMap((v) => cleanSavedPost(v) ?? [])
      : [];
  }
  private update(work: (entries: SavedPost[]) => SavedPost[]) {
    const task = this.queue.then(async () => {
      const next = work(await this.list());
      if (
        next.length > 100 ||
        new TextEncoder().encode(JSON.stringify(next)).length > 2 * 1024 * 1024
      )
        throw new Error("libraryFull");
      if (next.length) await this.storage.set(LIBRARY_KEY, next);
      else await this.storage.remove(LIBRARY_KEY);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  save(value: unknown) {
    const clean = cleanSavedPost(value);
    if (!clean) return Promise.reject(new Error("invalidRequest"));
    return this.update((entries) => [
      clean,
      ...entries.filter((e) => e.tweet.id !== clean.tweet.id),
    ]);
  }
  restore(value: unknown) {
    let imported: SavedPost[];
    try {
      imported = savedBatch(value);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.update((entries) => {
      const existing = new Set(entries.map((e) => e.tweet.id));
      return [...imported.filter((e) => !existing.has(e.tweet.id)), ...entries];
    });
  }
  remove(id: string) {
    if (!/^\d{1,30}$/.test(id))
      return Promise.reject(new Error("invalidRequest"));
    return this.update((entries) => entries.filter((e) => e.tweet.id !== id));
  }
}
