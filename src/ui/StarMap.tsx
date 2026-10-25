import { useEffect, useRef, useState } from "react";
import {
  Network,
  List,
  Waves,
  Search,
  RefreshCw,
  ArrowDown,
  ArrowUpRight,
  Users,
} from "lucide-react";
import { mergeRelations, relationKey } from "../core/cache";
import type { GraphPage, Relation, Tweet } from "../core/types";
import type { Workspace } from "../content/model";
import { translator, errorText } from "./i18n";
import { Dialog, External, useWorkspace } from "./shared";
export function StarMap({ model, tweet }: { model: Workspace; tweet: Tweet }) {
  const state = useWorkspace(model),
    t = translator(state.settings.language);
  const [view, setView] = useState<"map" | "list" | "river">("map"),
    [filter, setFilter] = useState<"all" | "repost" | "quote">("all"),
    [kind, setKind] = useState<"repost" | "quote">("repost");
  const [query, setQuery] = useState(""),
    [pages, setPages] = useState<
      Partial<Record<"repost" | "quote", GraphPage>>
    >({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  const [limit, setLimit] = useState(80);
  const controller = useRef<AbortController | null>(null);
  const scope = `${state.account}:${tweet.id}`;
  const load = async (refresh = false, targetKind = kind) => {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const reply = await model.transport.request(
        {
          type: "graph",
          tweetId: tweet.id,
          kind: targetKind,
          ...(refresh || !pages[targetKind]?.cursor
            ? {}
            : { cursor: pages[targetKind]!.cursor! }),
        },
        abort.signal,
      );
      if (!("page" in reply) || abort.signal.aborted) return;
      const page = {
        ...reply.page,
        relations: refresh
          ? reply.page.relations
          : mergeRelations(
              pages[targetKind]?.relations ?? [],
              reply.page.relations,
            ),
      };
      setPages((previous) => ({ ...previous, [targetKind]: page }));
      try {
        await model.cache.put(state.account, tweet.id, targetKind, page);
      } catch {
        if (!abort.signal.aborted) setError(t("storageFailed"));
      }
    } catch (error) {
      if (!abort.signal.aborted) setError(errorText(error, t));
    } finally {
      if (controller.current === abort) {
        setBusy(false);
        controller.current = null;
      }
    }
  };
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let active = true;
    void (async () => {
      const entries = await Promise.all(
        (["repost", "quote"] as const).map(
          async (k) =>
            [
              k,
              model.graph(tweet.id, k) ??
                (await model.cache.get(state.account, tweet.id, k)),
            ] as const,
        ),
      );
      if (!active) return;
      setPages(Object.fromEntries(entries.filter(([, page]) => page)));
      if (!entries.find(([k, page]) => k === "repost" && page))
        void loadRef.current(false, "repost");
    })().catch(() => {
      if (active) setError(t("storageFailed"));
    });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, [scope]);
  const all = mergeRelations(
    pages.repost?.relations ?? [],
    pages.quote?.relations ?? [],
  );
  const filtered = all.filter(
    (r) =>
      (filter === "all" || filter === r.kind) &&
      `${r.author.name} @${r.author.handle} ${r.kind === "quote" ? r.tweet.text : ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const quotes = filtered
    .filter(
      (r): r is Extract<Relation, { kind: "quote" }> => r.kind === "quote",
    )
    .sort((a, b) => (a.tweet.createdAt ?? 0) - (b.tweet.createdAt ?? 0));
  const choose = (r: Relation) => {
    setSelected(relationKey(r));
    setView("list");
    setLimit(Math.max(limit, filtered.indexOf(r) + 1));
  };
  const switchView = (nextView: "map" | "list" | "river") => {
    setView(nextView);
    if (nextView === "river" && kind !== "quote") {
      setKind("quote");
      if (!pages.quote) void load(false, "quote");
    }
  };
  useEffect(() => {
    if (view === "list" && selected)
      document
        .getElementById("xtrend-workspace")
        ?.shadowRoot?.querySelector(`[data-relation="${CSS.escape(selected)}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [selected, view]);
  return (
    <Dialog model={model} title={t("star")} subtitle={t("starHint")} wide>
      <div className="xt-star-context">
        <div className="xt-avatar">{[...tweet.author.name][0]}</div>
        <div>
          <strong>{tweet.author.name}</strong>
          <p>{tweet.text.slice(0, 160)}</p>
        </div>
        <External href={tweet.url}>{t("openOriginal")}</External>
      </div>
      <div className="xt-star-toolbar">
        <div className="xt-tabs">
          {(
            [
              { key: "map", Icon: Network },
              { key: "list", Icon: List },
              { key: "river", Icon: Waves },
            ] as const
          ).map(({ key, Icon }) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => switchView(key)}
              aria-pressed={view === key}
            >
              <Icon size={15} />
              {t(key)}
            </button>
          ))}
        </div>
        <span className="xt-count">
          {all.length} <Users size={14} />
        </span>
      </div>
      <div className="xt-star-filters">
        <label className="xt-search">
          <Search size={15} />
          <input
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(80);
            }}
          />
        </label>
        <select
          aria-label={t("all")}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            setLimit(80);
          }}
        >
          {(["all", "repost", "quote"] as const).map((k) => (
            <option value={k} key={k}>
              {t(k)}
            </option>
          ))}
        </select>
      </div>
      <div className="xt-star-body">
        {view === "map" && (
          <div className="xt-constellation">
            <svg viewBox="0 0 720 360" role="img" aria-label={t("star")}>
              <defs>
                <radialGradient id="xt-glow">
                  <stop
                    offset="0%"
                    stopColor="var(--accent)"
                    stopOpacity=".1"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--accent)"
                    stopOpacity="0"
                  />
                </radialGradient>
              </defs>
              <ellipse
                cx="360"
                cy="180"
                rx="310"
                ry="160"
                fill="url(#xt-glow)"
              />
              {[65, 115, 165].map((r) => (
                <ellipse
                  className="xt-orbit"
                  key={r}
                  cx="360"
                  cy="180"
                  rx={r * 1.6}
                  ry={r}
                />
              ))}
              {filtered.slice(0, 250).map((r, index) => {
                const angle = index * Math.PI * (3 - Math.sqrt(5)),
                  radius =
                    55 +
                    100 * Math.sqrt(index / Math.min(filtered.length, 250));
                const x = 360 + Math.cos(angle) * radius * 1.7,
                  y = 180 + Math.sin(angle) * radius;
                const isSelected = selected === relationKey(r);
                return (
                  <g
                    key={relationKey(r)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${r.author.name}, ${t(r.kind)}`}
                    onClick={() => choose(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        choose(r);
                      }
                    }}
                    className={`xt-node ${r.kind} ${isSelected ? "selected" : ""}`}
                  >
                    <line x1="360" y1="180" x2={x} y2={y} />
                    <circle
                      cx={x}
                      cy={y}
                      r={(r.kind === "quote" ? 7 : 5) + (isSelected ? 3 : 0)}
                    />
                    {isSelected && (
                      <text x={x + 10} y={y + 4} className="xt-selected-label">
                        {r.author.name}
                      </text>
                    )}
                    <title>
                      {r.author.name} @{r.author.handle}
                    </title>
                  </g>
                );
              })}
              <circle className="xt-center-halo" cx="360" cy="180" r="28" />
              <circle className="xt-center" cx="360" cy="180" r="19" />
              <text
                x="360"
                y="185"
                textAnchor="middle"
                className="xt-center-letter"
              >
                {[...tweet.author.name][0]}
              </text>
            </svg>
            {!filtered.length && (
              <p className="xt-star-empty">
                {busy
                  ? t("loading")
                  : all.length
                    ? t("emptyFilter")
                    : t("emptyGraph")}
              </p>
            )}
            <div className="xt-map-legend">
              <span>
                <i className="xt-dot rising" />
                {t("repost")}
              </span>
              <span>
                <i className="xt-dot viral" />
                {t("quote")}
              </span>
              {filtered.length > 250 && <span>250 / {filtered.length}</span>}
            </div>
          </div>
        )}
        {view === "list" && (
          <div className="xt-people-list">
            {!filtered.length && (
              <div className="xt-empty">{t("emptyFilter")}</div>
            )}
            {filtered.slice(0, limit).map((r) => (
              <div
                data-relation={relationKey(r)}
                key={relationKey(r)}
                className={`xt-person ${selected === relationKey(r) ? "selected" : ""}`}
              >
                <button
                  className="xt-avatar"
                  onClick={() => {
                    setSelected(relationKey(r));
                    setView("map");
                  }}
                  aria-label={`${t("map")} ${r.author.name}`}
                >
                  {[...r.author.name][0]}
                </button>
                <div>
                  <strong>{r.author.name}</strong>
                  <p>@{r.author.handle}</p>
                  {r.kind === "quote" && (
                    <p className="xt-person-quote">{r.tweet.text}</p>
                  )}
                </div>
                <span className="xt-kind">{t(r.kind)}</span>
                <a
                  href={
                    r.kind === "quote"
                      ? r.tweet.url
                      : `https://x.com/${r.author.handle}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("openOriginal")}
                >
                  <ArrowUpRight size={17} />
                </a>
              </div>
            ))}
            {filtered.length > limit && (
              <button
                className="xt-secondary"
                onClick={() => setLimit(limit + 80)}
              >
                {t("more")}
              </button>
            )}
          </div>
        )}
        {view === "river" && (
          <div className="xt-river">
            {!quotes.length && (
              <div className="xt-empty">
                {busy ? t("loading") : t("emptyQuotes")}
              </div>
            )}
            {quotes.slice(0, limit).map((r) => (
              <article key={r.tweet.id}>
                <div className="xt-river-dot" />
                <time>
                  {r.tweet.createdAt
                    ? new Date(r.tweet.createdAt).toLocaleString(
                        state.settings.language,
                      )
                    : t("unknown")}
                </time>
                <h3>
                  {r.author.name}
                  <span>@{r.author.handle}</span>
                </h3>
                <p>{r.tweet.text}</p>
                <External href={r.tweet.url}>{t("openOriginal")}</External>
              </article>
            ))}
            {quotes.length > limit && (
              <button
                className="xt-secondary"
                onClick={() => setLimit(limit + 80)}
              >
                {t("more")}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="xt-star-load">
        <select
          aria-label={t("load")}
          value={kind}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value as typeof kind;
            setKind(next);
            if (!pages[next]) void load(false, next);
          }}
        >
          <option value="repost">{t("repost")}</option>
          <option value="quote">{t("quote")}</option>
        </select>
        <button
          className="xt-primary"
          disabled={
            busy || (pages[kind] !== undefined && pages[kind]?.cursor === null)
          }
          onClick={() => void load()}
        >
          <ArrowDown size={15} />
          {pages[kind] ? t("more") : t("load")}
        </button>
        <button
          className="xt-icon"
          disabled={busy}
          onClick={() => void load(true)}
          aria-label={t("refresh")}
        >
          <RefreshCw size={16} />
        </button>
        {busy && (
          <button
            className="xt-text-button"
            onClick={() => controller.current?.abort()}
          >
            {t("cancel")}
          </button>
        )}
        <span className="xt-cache-date">
          {(pages[kind]?.observedAt ||
            pages.repost?.observedAt ||
            pages.quote?.observedAt) &&
            `${t("cached")} ${new Date(
              (pages[kind] ?? pages.repost ?? pages.quote)!.observedAt,
            ).toLocaleString(state.settings.language)}`}
        </span>
      </div>
      {busy && (
        <p className="xt-message" role="status">
          {t("loading")}
        </p>
      )}
      {error && (
        <div className="xt-notice" role="alert">
          <p>{error}</p>
          <a
            className="xt-link"
            href={`${tweet.url}/retweets`}
            onClick={() => model.open(null)}
          >
            {t("openReposts")}
          </a>
          <a
            className="xt-link"
            href={`${tweet.url}/quotes`}
            onClick={() => model.open(null)}
          >
            {t("openQuotes")}
          </a>
        </div>
      )}
      <footer className="xt-modal-footer">{t("partial")}</footer>
    </Dialog>
  );
}
