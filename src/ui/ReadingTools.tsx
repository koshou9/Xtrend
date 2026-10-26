import { postsCSV } from "../core/research";
import { researchT } from "./research-i18n";
import { useEffect, useState } from "react";
import type { Workspace } from "../content/model";
import type { Tweet } from "../core/types";
import { Dialog, useWorkspace } from "./shared";
import { enhanceT } from "./enhance-i18n";
import { translator } from "./i18n";
import { hubT } from "./hub-i18n";
import { BUILTIN_RULES, ruleLabel } from "../core/filtering";
import { toMarkdown } from "../core/markdown";
import { copyText } from "../content/dom";
import { downloadText } from "./files";

export function FilteredPosts({ model }: { model: Workspace }) {
  const state = useWorkspace(model),
    t = enhanceT(state.settings.language);
  const f = state.settings.filtering;
  return (
    <Dialog model={model} title={t("filtered")}>
      <div className="xt-reading-tools">
        <p>{t("filterExplanation")}</p>
        {!state.filtered.length && <p>{t("noFiltered")}</p>}
        {state.filtered.map((item) => {
          const tweet = model.get(item.id);
          if (!tweet) return null;
          const rule = [
            ...BUILTIN_RULES,
            ...f.importedRules,
            ...f.customRules,
          ].find((r) => r.id === item.reason);
          const reason =
            item.reason === "lowViews"
              ? t("lowViews")
              : item.reason === "blacklist"
                ? t("blacklist")
                : rule
                  ? ruleLabel(rule, state.settings.language)
                  : item.reason;
          return (
            <article key={item.id}>
              <strong>
                {tweet.author.name} @{tweet.author.handle}
              </strong>
              <p>{tweet.text.slice(0, 240)}</p>
              <small>
                {t("reason")}: {reason}
              </small>
              <div className="xt-hub-action-row">
                <button
                  className="xt-secondary"
                  onClick={() => model.restore(item.id)}
                >
                  {t("restoreOnce")}
                </button>
                <button
                  className="xt-text-button"
                  onClick={() =>
                    void model
                      .update({
                        filtering: {
                          ...f,
                          whitelist: [
                            ...new Set([
                              ...f.whitelist,
                              tweet.author.handle.toLowerCase(),
                            ]),
                          ],
                        },
                      })
                      .catch(() =>
                        model.notify(
                          hubT(state.settings.language)("saveFailed"),
                        ),
                      )
                  }
                >
                  {t("whitelist")}
                </button>
              </div>
            </article>
          );
        })}
        {state.filtered.length > 0 && (
          <button className="xt-secondary" onClick={() => model.restore()}>
            {t("restoreAll")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
export function BatchExport({ model }: { model: Workspace }) {
  const state = useWorkspace(model),
    t = enhanceT(state.settings.language);
  const selected = model.selected(),
    text = selected
      .map((tweet) => toMarkdown(tweet, state.settings.language))
      .join("\n---\n\n");
  return (
    <Dialog model={model} title={t("batch")}>
      <div className="xt-reading-tools">
        <p>{t("batchHelp")}</p>
        <div className="xt-batch-list">
          {state.ranked.slice(0, 200).map((tweet) => (
            <label key={tweet.id}>
              <input
                type="checkbox"
                aria-label={`${t("selectPost")} @${tweet.author.handle}`}
                checked={state.batch.includes(tweet.id)}
                onChange={() => model.select(tweet.id)}
              />
              <span>
                <strong>{tweet.author.name}</strong>
                <small>{tweet.text.slice(0, 140)}</small>
              </span>
            </label>
          ))}
        </div>
        <p>
          {t("selected")}: {selected.length} / 200
        </p>
        <div className="xt-hub-action-row">
          <button
            className="xt-secondary"
            disabled={!selected.length}
            onClick={() =>
              downloadText(
                "xtrend-selected.csv",
                postsCSV(selected),
                "text/csv;charset=utf-8",
              )
            }
          >
            {researchT(state.settings.language)("csv")}
          </button>
          <button
            className="xt-secondary"
            disabled={!selected.length}
            onClick={async () => {
              if (await copyText(text))
                model.notify(translator(state.settings.language)("copied"));
              else model.open({ type: "copy", text });
            }}
          >
            {t("copyBatch")}
          </button>
          <button
            className="xt-secondary"
            disabled={!selected.length}
            onClick={() =>
              downloadText("xtrend-selected.md", text, "text/markdown")
            }
          >
            {t("downloadBatch")}
          </button>
          <button className="xt-text-button" onClick={() => model.clearBatch()}>
            {t("clearSelection")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
export function TrendView({
  model,
  tweet,
}: {
  model: Workspace;
  tweet: Tweet;
}) {
  const state = useWorkspace(model),
    t = enhanceT(state.settings.language),
    { points, interval } = model.samples.info(tweet.id);
  const min = Math.min(...points.map((p) => p.views)),
    max = Math.max(...points.map((p) => p.views)),
    from = points[0]?.at ?? 0,
    to = points.at(-1)?.at ?? 0;
  const line = points
    .map(
      (p) =>
        `${30 + ((p.at - from) / Math.max(1, to - from)) * 500},${175 - ((p.views - min) / Math.max(1, max - min)) * 140}`,
    )
    .join(" ");
  return (
    <Dialog model={model} title={t("trend")}>
      <div className="xt-reading-tools">
        <strong>@{tweet.author.handle}</strong>
        <p>
          {t("observed")}:{" "}
          {new Date(tweet.observedAt).toLocaleString(state.settings.language)}
        </p>
        {Date.now() - tweet.observedAt > 300000 && (
          <p className="xt-notice">{t("stale")}</p>
        )}
        <p>
          {interval
            ? `${t("measured")} · ${t("interval")}: ${new Date(interval.from).toLocaleTimeString(state.settings.language)} – ${new Date(interval.to).toLocaleTimeString(state.settings.language)}`
            : t("average")}
        </p>
        {points.length < 2 ? (
          <p>{t("noTrend")}</p>
        ) : (
          <svg
            className="xt-trend"
            role="img"
            aria-label={t("trend")}
            viewBox="0 0 560 210"
          >
            <title>{t("trend")}</title>
            <path d="M30 20V175H530" />
            <polyline points={line} />
            <text x="30" y="202">
              {new Date(from).toLocaleTimeString(state.settings.language)}
            </text>
            <text x="390" y="202">
              {new Date(to).toLocaleTimeString(state.settings.language)}
            </text>
          </svg>
        )}
        <details>
          <summary>
            {t("samples")} · {points.length} / 60
          </summary>
          <table>
            <tbody>
              {points.map((p) => (
                <tr key={p.at}>
                  <td>
                    {new Date(p.at).toLocaleString(state.settings.language)}
                  </td>
                  <td>{p.views.toLocaleString(state.settings.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </Dialog>
  );
}
export function ColumnSettings({ model }: { model: Workspace }) {
  const state = useWorkspace(model),
    t = enhanceT(state.settings.language),
    column = state.column,
    rule = column ? state.settings.columnRules[column] : undefined;
  const [limit, setLimit] = useState(
      String(rule?.rankingLimit ?? state.settings.rankingLimit),
    ),
    [views, setViews] = useState(
      String(rule?.minimumViews ?? state.settings.minimumViews),
    ),
    [monitor, setMonitor] = useState(rule?.monitor !== false);
  useEffect(() => {
    setLimit(String(rule?.rankingLimit ?? state.settings.rankingLimit));
    setViews(String(rule?.minimumViews ?? state.settings.minimumViews));
    setMonitor(rule?.monitor !== false);
  }, [column, rule]);
  if (!column) return null;
  return (
    <section className="xt-column-settings">
      <h3>
        {t("columnSettings")} · {column.split("-").at(-1)}
      </h3>
      <p>{t("columnHelp")}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !Number.isInteger(Number(limit)) ||
            Number(limit) < 1 ||
            Number(limit) > 1000 ||
            !Number.isSafeInteger(Number(views)) ||
            Number(views) < 0
          )
            return;
          try {
            await model.update({
              columnRules: {
                ...state.settings.columnRules,
                [column]: {
                  rankingLimit: Number(limit),
                  minimumViews: Number(views),
                  monitor,
                },
              },
            });
            model.notify(hubT(state.settings.language)("saved"));
          } catch {
            model.notify(hubT(state.settings.language)("saveFailed"));
          }
        }}
      >
        <label>
          {t("columnLimit")}
          <input
            type="number"
            required
            min="1"
            max="1000"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <label>
          {t("columnViews")}
          <input
            type="number"
            required
            min="0"
            step="1"
            value={views}
            onChange={(e) => setViews(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={monitor}
            onChange={(e) => setMonitor(e.target.checked)}
          />
          {t("monitorColumn")}
        </label>
        <button className="xt-secondary" type="submit">
          {t("saveColumn")}
        </button>
      </form>
    </section>
  );
}
