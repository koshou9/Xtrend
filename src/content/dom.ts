import type { Tweet } from "../core/types";
export const ARTICLE = 'article[data-testid="tweet"]';
// A rescan of unchanged page text is not a new view-count observation.
const viewReadings = new WeakMap<
  Element,
  { id: string; views: number | null; at: number }
>();
export function tweetId(article: Element): string | null {
  const timeLink = article.querySelector("time")?.closest("a");
  return timeLink?.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1] ?? null;
}
function count(article: Element, selector: string): number | null {
  const element = article.querySelector(selector);
  const aria = element?.getAttribute("aria-label") ?? "";
  return parseExactCount(aria);
}
export function parseExactCount(aria: string): number | null {
  // Compact units are rounded. Never interpret 12K, 12 K or 10万 as exact counts.
  const exact = aria.match(/^\s*((?:\d{1,3}(?:,\d{3})+|\d+))(?=\s|$)/);
  if (exact) {
    const tail = aria.slice(exact[0].length).trim();
    if (
      /^(?:\d|[kmbt]\b|thousand\b|million\b|billion\b|[万萬亿億])/i.test(tail)
    )
      return null;
    const value = Number(exact[1]!.replace(/,/g, ""));
    return Number.isSafeInteger(value) ? value : null;
  }
  return null;
}
export function parseViewGroupCount(label: string): number | null {
  // Detail pages may expose exact views only in the action group's accessible label.
  const match = label.match(
    /(?:^|[、·;]|,\s+)\s*((?:\d{1,3}(?:,\d{3})+|\d+))\s*(?:views?\b|次(?:观看|查看|瀏覽|浏览)|件の表示|回表示)/i,
  );
  return match ? parseExactCount(match[1]!) : null;
}
export function readArticle(article: Element): Tweet | null {
  const id = tweetId(article),
    time = article.querySelector("time");
  if (!id || !time) return null;
  const authorBox = article.querySelector('[data-testid="User-Name"]');
  const profile = authorBox?.querySelector('a[href^="/"]');
  const handle =
    profile?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]+)$/)?.[1] ?? "";
  if (!handle) return null;
  const text =
    article.querySelector('[data-testid="tweetText"]')?.textContent ?? "";
  // An edited post's /history time is its edit time, not its publication time.
  const createdAt = /\/history(?:[/?#]|$)/.test(
    time.closest("a")?.getAttribute("href") ?? "",
  )
    ? NaN
    : Date.parse(time.getAttribute("datetime") ?? "");
  const observedAt = Date.now(),
    views =
      count(article, 'a[href$="/analytics"]') ??
      [...article.querySelectorAll('[role="group"]')]
        .filter((group) => group.closest(ARTICLE) === article)
        .map((group) =>
          parseViewGroupCount(group.getAttribute("aria-label") ?? ""),
        )
        .find((value) => value !== null) ??
      null;
  let reading = viewReadings.get(article);
  if (!reading || reading.id !== id || reading.views !== views) {
    reading = { id, views, at: observedAt };
    viewReadings.set(article, reading);
  }
  const photos = [
    ...article.querySelectorAll<HTMLImageElement>(
      '[data-testid="tweetPhoto"] img',
    ),
  ]
    .map((image) => image.currentSrc || image.src)
    .filter((url) => {
      try {
        return new URL(url).hostname === "pbs.twimg.com";
      } catch {
        return false;
      }
    });
  return {
    id,
    author: {
      id: `page:${handle}`,
      name: profile?.textContent?.trim() || handle,
      handle,
    },
    text,
    createdAt: Number.isFinite(createdAt) ? createdAt : null,
    url: `https://x.com/${handle}/status/${id}`,
    counts: {
      views,
      likes: count(article, '[data-testid="like"], [data-testid="unlike"]'),
      reposts: count(
        article,
        '[data-testid="retweet"], [data-testid="unretweet"]',
      ),
      replies: count(article, '[data-testid="reply"]'),
      bookmarks: count(
        article,
        '[data-testid="bookmark"], [data-testid="removeBookmark"]',
      ),
    },
    photos,
    observedAt,
    viewsObservedAt: reading.at,
    complete:
      !!text &&
      !article.querySelector('[data-testid="tweet-text-show-more-link"]'),
    source: "page",
  };
}
export function currentAccount(): string {
  // Read only the visible account-switcher identity, never cookies or unrelated page state.
  const switcher = document.querySelector(
    '[data-testid="SideNav_AccountSwitcher_Button"]',
  );
  const handle = switcher?.textContent?.match(/@([A-Za-z0-9_]+)/)?.[1];
  return handle?.toLowerCase() ?? "anonymous";
}
export function findArticle(id: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(ARTICLE)].find(
      (article) => tweetId(article) === id,
    ) ?? null
  );
}
export type ScrollBookmark = {
  element: HTMLElement;
  left: number;
  top: number;
}[];
export function captureScroll(): ScrollBookmark {
  const elements = new Set<HTMLElement>([
    document.scrollingElement as HTMLElement,
  ]);
  for (const article of document.querySelectorAll(ARTICLE)) {
    let parent = article.parentElement;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (
        /(auto|scroll)/.test(style.overflowY + style.overflowX) &&
        (parent.scrollHeight > parent.clientHeight ||
          parent.scrollWidth > parent.clientWidth)
      )
        elements.add(parent);
      parent = parent.parentElement;
    }
  }
  return [...elements].filter(Boolean).map((element) => ({
    element,
    left: element.scrollLeft,
    top: element.scrollTop,
  }));
}
export function restoreScroll(bookmark: ScrollBookmark) {
  const restore = () => {
    for (const { element, left, top } of bookmark)
      if (element.isConnected)
        element.scrollTo({ left, top, behavior: "instant" });
  };
  restore();
  // Correct scroll anchoring after the selection's layout commit, without fighting new input.
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  for (const type of ["wheel", "touchmove", "keydown", "pointerdown"])
    document.addEventListener(type, cancel, { once: true, capture: true });
  requestAnimationFrame(() => {
    if (!cancelled) restore();
    for (const type of ["wheel", "touchmove", "keydown", "pointerdown"])
      document.removeEventListener(type, cancel, true);
  });
}
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
export function fillReply(tweet: Tweet, text: string): boolean {
  const dialog = document.querySelector('[role="dialog"]');
  const editor = (
    dialog ?? findArticle(tweet.id)?.closest('[data-testid="primaryColumn"]')
  )?.querySelector<HTMLElement>(
    '[data-testid="tweetTextarea_0"][contenteditable="true"]',
  );
  if (!editor) return false;
  // Restrict insertion to an identifiable composer for the selected post.
  const statusId = (path: string | null) =>
    path?.match(/\/status\/(\d+)(?:[/?#]|$)/)?.[1];
  const dialogLink = [...(dialog?.querySelectorAll("a[href]") ?? [])].some(
    (link) => statusId(link.getAttribute("href")) === tweet.id,
  );
  if (dialog && !dialogLink) return false;
  if (!dialog && statusId(location.pathname) !== tweet.id) return false;
  editor.focus();
  const selection = window.getSelection(),
    range = document.createRange();
  range.selectNodeContents(editor);
  selection?.removeAllRanges();
  selection?.addRange(range);
  return document.execCommand("insertText", false, text);
}
