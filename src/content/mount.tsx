import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Network, Sparkles, Copy, TrendingUp } from "lucide-react";
import { browser } from "wxt/browser";
import { App } from "../ui/App";
import { Badge } from "../ui/Rankings";
import { translator } from "../ui/i18n";
import type { Workspace } from "./model";
import { ARTICLE, readArticle, tweetId, copyText } from "./dom";
import { compact, averageSpeed, tier } from "../core/metrics";
import { toMarkdown } from "../core/markdown";
import style from "../ui/styles.css?inline";
import { useWorkspaceSlice } from "../ui/shared";
import { lowViewTweet, rankingApplies } from "../core/ranking";
import { detailTweetId, filterReason } from "../core/filtering";
import { usePalette } from "../ui/palette";
import { enhanceT } from "../ui/enhance-i18n";

export const sheet = style;
function shadowHost(id?: string) {
  const host = document.createElement("div");
  if (id) host.id = id;
  host.dataset.xtrend = "true";
  const shadow = host.attachShadow({ mode: "open" });
  const css = document.createElement("style");
  css.textContent = sheet;
  const container = document.createElement("div");
  shadow.append(css, container);
  return { host, container };
}
function Inline({ model, id }: { model: Workspace; id: string }) {
  const state = useWorkspaceSlice(
      model,
      (s) => ({
        settings: s.settings,
        tweet: model.get(id),
        tick: Math.floor(Date.now() / 15000),
      }),
      (a, b) =>
        a.settings === b.settings && a.tweet === b.tweet && a.tick === b.tick,
    ),
    t = translator(state.settings.language),
    tweet = state.tweet;
  const palette = usePalette(state.settings);
  if (!tweet) return null;
  const average = averageSpeed(tweet),
    ranked = {
      ...tweet,
      average,
      growth: model.samples.get(id, Date.now()),
      tier: tier(average, state.settings),
    };
  return (
    <div
      className="xt-inline"
      style={palette}
      data-theme={state.settings.theme}
      lang={state.settings.language}
    >
      {state.settings.badges && <Badge model={model} tweet={ranked} />}
      <button
        className="xt-icon"
        aria-label={enhanceT(state.settings.language)("trend")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          model.open({ type: "trend", tweet });
        }}
      >
        <TrendingUp size={15} />
      </button>
      <button
        className="xt-icon"
        aria-label={t("star")}
        title={t("star")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          model.open({ type: "star", tweet });
        }}
      >
        <Network size={15} />
      </button>
      <button
        className="xt-icon"
        aria-label={t("grok")}
        title={t("grok")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          model.open({ type: "grok", tweet });
        }}
      >
        <Sparkles size={15} />
      </button>
    </div>
  );
}
export function mountWorkspace(model: Workspace) {
  const workspace = shadowHost("xtrend-workspace");
  workspace.host.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;pointer-events:none;";
  document.documentElement.append(workspace.host);
  const root = createRoot(workspace.container);
  root.render(<App model={model} />);
  const mounted = new Map<
    Element,
    { host: HTMLElement; root: Root; id: string }
  >();
  const filterStyle = document.createElement("style");
  filterStyle.dataset.xtrend = "true";
  filterStyle.textContent =
    '[data-xtrend-filtered="true"]{display:none!important}';
  document.documentElement.append(filterStyle);
  const filtered = new Set<Element>();
  let candidates: Set<Element> | null = null;
  let filterVersion = "";
  const details = new Map<string, boolean>();
  const columns = new Map<Element, string>();
  const articleColumn = (article: Element) => {
    if (location.hostname !== "pro.x.com") return null;
    let node = article.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.clientHeight > 0) {
        if (!columns.has(node))
          columns.set(node, `pro-column-${columns.size + 1}`);
        return columns.get(node)!;
      }
      node = node.parentElement;
    }
    return null;
  };
  const applyFilters = (force = false) => {
    const version = model.filterVersion();
    if (!force && filterVersion === version) return;
    filterVersion = version;
    const state = model.snapshot(),
      next = new Set<Element>();
    const focalId =
      state.scope === "detail" ? detailTweetId(location.href) : null;
    const focal = focalId
      ? [...document.querySelectorAll(ARTICLE)].find(
          (article) => tweetId(article) === focalId,
        )
      : null;
    if (focalId && focal) details.set(focalId, true);
    if (!focalId) details.clear();
    const hidden: { id: string; reason: string }[] = [];
    if (
      (rankingApplies(state.settings, state.scope) && state.settings.hotOnly) ||
      (state.settings.filtering.enabled && focalId && details.has(focalId))
    ) {
      for (const article of document.querySelectorAll(ARTICLE)) {
        const id = tweetId(article),
          tweet = id ? (model.get(id) ?? readArticle(article)) : null;
        if (!tweet) continue;
        if (model.isRestored(tweet.id)) continue;
        const key = articleColumn(article),
          rule = key ? state.settings.columnRules[key] : null;
        const lowViews =
          rankingApplies(state.settings, state.scope) &&
          lowViewTweet(
            tweet,
            rule
              ? { ...state.settings, minimumViews: rule.minimumViews }
              : state.settings,
          );
        const sameColumn =
          !focal?.closest('[data-testid="primaryColumn"]') ||
          focal.closest('[data-testid="primaryColumn"]') ===
            article.closest('[data-testid="primaryColumn"]');
        const reply =
          tweet.id !== focalId &&
          !!tweet.replyTo &&
          (focal
            ? sameColumn &&
              !!(
                focal.compareDocumentPosition(article) &
                Node.DOCUMENT_POSITION_FOLLOWING
              )
            : focalId && details.has(focalId));
        const reason = lowViews
          ? "lowViews"
          : reply
            ? filterReason(tweet, state.settings.filtering)
            : null;
        if (!reason) continue;
        hidden.push({ id: tweet.id, reason });
        const cell = article.closest('[data-testid="cellInnerDiv"]');
        const target =
          cell && cell.querySelectorAll(ARTICLE).length === 1 ? cell : article;
        next.add(target);
        if (!filtered.has(target))
          target.setAttribute("data-xtrend-filtered", "true");
      }
    }
    for (const target of filtered)
      if (!next.has(target)) target.removeAttribute("data-xtrend-filtered");
    filtered.clear();
    next.forEach((target) => filtered.add(target));
    model.filtered(hidden);
  };
  const unwatchFilters = model.subscribe(() => applyFilters());
  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          const id = tweetId(entry.target);
          if (id) model.seen(id);
        }
    },
    { threshold: 0.01 },
  );
  let pendingShare: { id: string; at: number } | null = null;
  const shareRoots = new Map<Element, { host: HTMLElement; root: Root }>();
  const copy = async (id: string) => {
    const tweet = model.get(id);
    if (!tweet) return;
    const text = toMarkdown(tweet, model.snapshot().settings.language),
      t = translator(model.snapshot().settings.language);
    if (await copyText(text))
      model.notify(tweet.complete ? t("copied") : t("incomplete"));
    else model.open({ type: "copy", text });
    pendingShare = null;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  };
  const scan = () => {
    const targets = candidates;
    candidates = new Set();
    for (const [article, value] of mounted)
      if (
        !article.isConnected ||
        tweetId(article) !== value.id ||
        !value.host.isConnected
      ) {
        value.root.unmount();
        value.host.remove();
        intersection.unobserve(article);
        mounted.delete(article);
      }
    for (const [menu, value] of shareRoots)
      if (!menu.isConnected) {
        value.root.unmount();
        value.host.remove();
        shareRoots.delete(menu);
      }
    for (const article of targets ?? document.querySelectorAll(ARTICLE)) {
      if (!article.isConnected) continue;
      const tweet = readArticle(article);
      if (!tweet) continue;
      model.upsert(tweet, false);
      model.place(tweet.id, articleColumn(article));
      const box = article.getBoundingClientRect();
      if (
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth
      )
        model.seen(tweet.id);
      if (!mounted.has(article)) {
        const anchor = article.querySelector("time")?.closest("a")
          ?.parentElement?.parentElement;
        if (!anchor) continue;
        const inline = shadowHost();
        inline.host.style.cssText =
          "display:inline-flex;position:relative;flex-shrink:0;vertical-align:middle;";
        anchor.append(inline.host);
        const inlineRoot = createRoot(inline.container);
        inlineRoot.render(<Inline model={model} id={tweet.id} />);
        mounted.set(article, { ...inline, root: inlineRoot, id: tweet.id });
        intersection.observe(article);
      }
    }
    if (pendingShare && Date.now() - pendingShare.at < 6000) {
      const menu = document.querySelector('[role="menu"]');
      if (menu && !shareRoots.has(menu)) {
        const id = pendingShare.id,
          item = shadowHost();
        menu.append(item.host);
        const menuRoot = createRoot(item.container),
          state = model.snapshot();
        menuRoot.render(
          <div
            className="xt-inline"
            data-theme={state.settings.theme}
            style={{ display: "block", margin: 0 }}
          >
            <button
              className="xt-share-copy"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                void copy(id);
              }}
            >
              <Copy size={17} />
              {translator(state.settings.language)("markdown")}
            </button>
          </div>,
        );
        shareRoots.set(menu, { ...item, root: menuRoot });
      }
    }
    for (const key of columns.keys()) if (!key.isConnected) columns.delete(key);
    model.columns([...columns.values()]);
    applyFilters(true);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver((records) => {
    if (
      records.every(
        (record) =>
          record.target instanceof Element &&
          record.target.closest("[data-xtrend]"),
      )
    )
      return;
    candidates ??= new Set();
    for (const record of records) {
      const target =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      const article = target?.closest(ARTICLE);
      if (article) candidates.add(article);
      for (const node of record.addedNodes)
        if (node instanceof Element) {
          if (node.matches(ARTICLE)) candidates.add(node);
          node.querySelectorAll(ARTICLE).forEach((el) => candidates!.add(el));
        }
    }
    clearTimeout(timer);
    timer = setTimeout(scan, 150);
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "datetime"],
  });
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-xtrend]")) return;
    const article = target.closest(ARTICLE),
      id = article && tweetId(article);
    if (id) {
      const button = target.closest("button");
      const isShare =
        !!target.closest('[data-testid="share"]') ||
        /\bshare\b|分享|共有|シェア/i.test(
          button?.getAttribute("aria-label") ?? "",
        );
      if (
        isShare &&
        !button?.closest('[data-testid="User-Name"]') &&
        button?.closest('[role="group"]')
      )
        pendingShare = { id, at: Date.now() };
    }
    const photo = target.closest('a[href*="/photo/"]');
    if (photo && article && id && model.snapshot().settings.images) {
      const tweet = model.get(id);
      if (!tweet?.photos.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const index =
        Number(photo.getAttribute("href")?.match(/\/photo\/(\d+)/)?.[1] ?? 1) -
        1;
      model.open({
        type: "image",
        photos: tweet.photos,
        index: Math.max(0, Math.min(index, tweet.photos.length - 1)),
      });
    }
  };
  document.addEventListener("click", onClick, true);
  const runtime = (message: unknown) => {
    if ((message as any)?.type === "xtrend:settings")
      model.open({ type: "settings" });
  };
  browser.runtime.onMessage.addListener(runtime);
  scan();
  return () => {
    observer.disconnect();
    intersection.disconnect();
    clearTimeout(timer);
    document.removeEventListener("click", onClick, true);
    unwatchFilters();
    for (const target of filtered)
      target.removeAttribute("data-xtrend-filtered");
    filterStyle.remove();
    browser.runtime.onMessage.removeListener(runtime);
    for (const value of mounted.values()) {
      value.root.unmount();
      value.host.remove();
    }
    for (const value of shareRoots.values()) {
      value.root.unmount();
      value.host.remove();
    }
    root.unmount();
    workspace.host.remove();
  };
}
