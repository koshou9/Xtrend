import { useEffect, useState } from "react";
import { ArrowUpRight, Bell, RefreshCw, Send, Trash2 } from "lucide-react";
import type { MonitorEvent } from "../core/features";
import { parseAccounts, validAccounts, fold } from "../core/filtering";
import type { HubServices } from "../platform/monitoring";
import type { PanelProps } from "./FeaturePanels";
import { hubDictionaries, hubT } from "./hub-i18n";
import type { HubKey } from "./hub-i18n";
import { enhanceT } from "./enhance-i18n";
import { parseTargets } from "../core/monitor";
import { NotificationControls } from "./NotificationControls";
import { useSyncedText } from "./useSyncedText";

export function MonitorPanel({
  settings,
  update,
  notify,
  services,
}: PanelProps & { services: HubServices }) {
  const t = hubT(settings.language),
    m = settings.monitoring;
  const extra = enhanceT(settings.language),
    targetText = (m.targets ?? [])
      .map((t) => `${t.kind} | ${t.value} | ${t.minViews} | ${t.minVelocity}`)
      .join("\n");
  const canonicalTargets = (value: string) => {
    try {
      return JSON.stringify(parseTargets(value));
    } catch {
      return value;
    }
  };
  const [targets, setTargets, targetsConflict, resetTargets] = useSyncedText(
      targetText,
      (value) => {
        try {
          return JSON.stringify(parseTargets(value));
        } catch {
          return value;
        }
      },
    ),
    [targetError, setTargetError] = useState(false);
  const [accounts, setAccounts, accountsConflict, resetAccounts] =
      useSyncedText(m.accounts.join("\n"), (value) =>
        parseAccounts(value).join("\n"),
      ),
    [keywords, setKeywords, keywordsConflict, resetKeywords] = useSyncedText(
      m.keywords.join("\n"),
      (value) =>
        [...new Set(value.split("\n").map(fold).filter(Boolean))].join("\n"),
    ),
    [views, setViews, viewsConflict, resetViews] = useSyncedText(
      String(m.minViews),
    ),
    [velocity, setVelocity, velocityConflict, resetVelocity] = useSyncedText(
      String(m.minVelocity),
    );
  const [server, setServer] = useState(settings.bark.server),
    [key, setKey] = useState(settings.bark.deviceKey),
    [busy, setBusy] = useState(false),
    [events, setEvents] = useState<MonitorEvent[]>([]);
  useEffect(() => {
    setServer(settings.bark.server);
    setKey(settings.bark.deviceKey);
  }, [settings.bark.server, settings.bark.deviceKey]);
  useEffect(() => {
    let active = true,
      request = 0;
    const load = () => {
      const number = ++request;
      void services
        .events()
        .then((value) => {
          if (active && request === number) setEvents(value);
        })
        .catch(() => {
          if (active) notify("operationFailed", true);
        });
    };
    load();
    const stop = services.watchEvents?.(load);
    return () => {
      active = false;
      stop?.();
    };
  }, [services]);
  const refresh = async () => {
    try {
      setEvents(await services.events());
    } catch {
      notify("operationFailed", true);
    }
  };
  const error = (value: unknown) => {
    const code =
      value instanceof Error && value.message in hubDictionaries.en
        ? (value.message as HubKey)
        : "operationFailed";
    notify(code, true);
  };
  const status = (value: string) => {
    const code = `status_${value}` as HubKey;
    notify(
      code in hubDictionaries.en ? code : "operationFailed",
      value !== "sent",
    );
  };
  if (services.preview)
    return (
      <section className="xt-hub-card">
        <h1>{t("privateMonitor")}</h1>
        <p role="status" className="xt-hub-description">
          {t("monitorPreviewUnavailable")}
        </p>
        <h2>{t("history")} · 0</h2>
      </section>
    );
  return (
    <>
      <section className="xt-hub-card">
        <h1>{t("privateMonitor")}</h1>
        <p className="xt-hub-description">{t("monitorHelp")}</p>
        {(targetsConflict ||
          accountsConflict ||
          keywordsConflict ||
          viewsConflict ||
          velocityConflict) && (
          <p className="xt-notice" role="status">
            {extra("conflict")}
            <button
              className="xt-text-button"
              onClick={() => {
                resetTargets();
                resetAccounts();
                resetKeywords();
                resetViews();
                resetVelocity();
              }}
            >
              {extra("latest")}
            </button>
          </p>
        )}
        <label className="xt-toggle-row xt-hub-enable">
          <span>{t("monitorEnabled")}</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={t("monitorEnabled")}
            checked={m.enabled}
            disabled={
              !m.accounts.length && !m.keywords.length && !m.targets?.length
            }
            onChange={(e) =>
              void update({
                monitoring: { ...m, enabled: e.target.checked },
              }).catch(() => {})
            }
          />
          <span className="xt-toggle" aria-hidden="true" />
        </label>
        <form
          data-dirty={
            parseAccounts(accounts).join("\n") !== m.accounts.join("\n") ||
            [...new Set(keywords.split("\n").map(fold).filter(Boolean))].join(
              "\n",
            ) !== m.keywords.join("\n") ||
            !views.trim() ||
            Number(views) !== m.minViews ||
            !velocity.trim() ||
            Number(velocity) !== m.minVelocity ||
            canonicalTargets(targets) !== canonicalTargets(targetText) ||
            undefined
          }
          onSubmit={(e) => {
            e.preventDefault();
            const list = parseAccounts(accounts),
              words = [
                ...new Set(
                  keywords
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                ),
              ];
            if (
              !validAccounts(list) ||
              words.length > 100 ||
              words.some((s) => s.length > 100) ||
              !views.trim() ||
              !velocity.trim() ||
              !Number.isSafeInteger(Number(views)) ||
              Number(views) < 0 ||
              !Number.isFinite(Number(velocity)) ||
              Number(velocity) < 0
            ) {
              notify("invalidWatch", true);
              return;
            }
            let rules;
            try {
              rules = parseTargets(targets);
              setTargetError(false);
            } catch {
              setTargetError(true);
              return;
            }
            void update({
              monitoring: {
                ...m,
                accounts: list,
                keywords: words,
                targets: rules,
                minViews: Number(views),
                minVelocity: Number(velocity),
                enabled:
                  m.enabled && list.length + words.length + rules.length > 0,
              },
            }).catch(() => {});
          }}
        >
          <div className="xt-hub-two">
            <label>
              {t("accounts")}
              <textarea
                aria-label={t("accounts")}
                value={accounts}
                onChange={(e) => setAccounts(e.target.value)}
                rows={3}
              />
            </label>
            <label>
              {t("keywords")}
              <textarea
                aria-label={t("keywords")}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                rows={3}
              />
            </label>
          </div>
          <p className="xt-hub-small">{t("watchHint")}</p>
          <div className="xt-hub-two">
            <label>
              {t("minViews")}
              <input
                type="number"
                min="0"
                step="1"
                value={views}
                onChange={(e) => setViews(e.target.value)}
              />
            </label>
            <label>
              {t("minVelocity")}
              <input
                type="number"
                min="0"
                step="any"
                value={velocity}
                onChange={(e) => setVelocity(e.target.value)}
              />
            </label>
          </div>
          <label>
            {extra("targetRules")}
            <textarea
              aria-label={extra("targetRules")}
              value={targets}
              onChange={(e) => setTargets(e.target.value)}
              rows={3}
            />
          </label>
          <p className="xt-hub-small">{extra("targetHelp")}</p>
          {targetError && (
            <p role="alert" className="xt-error">
              {extra("invalidTargets")}
            </p>
          )}
          <button type="submit" className="xt-secondary">
            {t("saveWatch")}
          </button>
        </form>
      </section>
      <section className="xt-hub-card">
        <h2>
          <Bell size={17} />
          {t("bark")}
        </h2>
        <p className="xt-hub-description">{t("barkHelp")}</p>
        <label>
          {t("server")}
          <input
            type="url"
            value={server}
            placeholder="https://api.day.app"
            autoComplete="off"
            onChange={(e) => setServer(e.target.value)}
          />
        </label>
        <label>
          {t("deviceKey")}
          <input
            type="password"
            value={key}
            autoComplete="off"
            onChange={(e) => setKey(e.target.value)}
            maxLength={200}
          />
        </label>
        <p className="xt-hub-small">{t("serverHint")}</p>
        <div
          data-dirty={
            server !== settings.bark.server ||
            key !== settings.bark.deviceKey ||
            undefined
          }
          className="xt-hub-action-row"
        >
          <button
            className="xt-primary"
            disabled={busy}
            onClick={() => {
              const draft = {
                server: server.trim(),
                deviceKey: key.trim(),
                enabled: true,
              };
              // The permission request must be the first async operation inside this click.
              const permission = services.authorizeBark(draft);
              setBusy(true);
              void permission
                .then(async (granted) => {
                  if (!granted) {
                    notify("permissionDenied", true);
                    return;
                  }
                  await services.configureBark(draft);
                  await update({});
                })
                .catch(error)
                .finally(() => setBusy(false));
            }}
          >
            <Bell size={14} />
            {t("enableBark")}
          </button>
          <button
            className="xt-secondary"
            disabled={
              busy ||
              !settings.bark.enabled ||
              server.trim() !== settings.bark.server ||
              key.trim() !== settings.bark.deviceKey
            }
            onClick={() => {
              setBusy(true);
              void services
                .testBark()
                .then(status)
                .catch(error)
                .finally(() => setBusy(false));
            }}
          >
            <Send size={14} />
            {t("testBark")}
          </button>
        </div>
        <div className="xt-hub-action-row">
          <button
            className="xt-text-button"
            disabled={!settings.bark.enabled}
            onClick={() =>
              void update({ bark: { ...settings.bark, enabled: false } }).catch(
                () => {},
              )
            }
          >
            {t("disableBark")}
          </button>
          <button
            className="xt-text-button"
            disabled={!settings.bark.deviceKey}
            onClick={() =>
              void services
                .configureBark({
                  ...settings.bark,
                  enabled: false,
                  deviceKey: "",
                })
                .then(() => update({}))
                .catch(error)
            }
          >
            {t("clearDevice")}
          </button>
        </div>
        <p className="xt-hub-small">{t("barkTestHint")}</p>
      </section>
      <NotificationControls
        settings={settings}
        update={update}
        notify={notify}
        services={services}
      />
      <section className="xt-hub-card">
        <div className="xt-hub-section-head">
          <h2>
            {t("history")} <small>{events.length}</small>
          </h2>
          <div>
            <button
              className="xt-icon"
              aria-label={t("refresh")}
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="xt-icon"
              aria-label={t("clearHistory")}
              onClick={async () => {
                try {
                  await services.clearEvents();
                  setEvents([]);
                  notify("cleared");
                } catch {
                  notify("operationFailed", true);
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <p className="xt-hub-small">{t("historyHint")}</p>
        {!events.length && <p className="xt-hub-empty">{t("noEvents")}</p>}
        <div className="xt-monitor-events">
          {events.map((event) => (
            <article key={event.key}>
              <header>
                <strong>{event.author.name}</strong>
                <span>@{event.author.handle}</span>
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("open")}
                >
                  <ArrowUpRight size={15} />
                </a>
              </header>
              <p>
                {event.reasons
                  .map((r) =>
                    r.replace("account:@", "@").replace("keyword:", ""),
                  )
                  .join(" · ")}
              </p>
              <small>
                {t("observedViews")}: {event.views ?? "—"} ·{" "}
                {t("observedVelocity")}:{" "}
                {event.velocity === null ? "—" : Math.round(event.velocity)}
              </small>
              <small>
                {t("readingTime")}:{" "}
                {event.observedAt === undefined
                  ? "—"
                  : new Date(event.observedAt).toLocaleString(
                      settings.language,
                    )}
              </small>
              <footer>
                <span className={`xt-push-status ${event.pushStatus}`}>
                  {t(`status_${event.pushStatus}`)}
                </span>
                <time>
                  {new Date(event.at).toLocaleString(settings.language)}
                </time>
                {event.pushStatus !== "sent" && settings.bark.enabled && (
                  <button
                    className="xt-text-button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void services
                        .retry(event.key)
                        .then(async (result) => {
                          status(result.pushStatus);
                          await refresh();
                        })
                        .catch(error)
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t("retry")}
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
