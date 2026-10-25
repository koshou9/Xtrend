import { useEffect, useRef, useState } from "react";
import type { PageScope, RankingField, Settings } from "../core/types";
import { translator } from "./i18n";
import { ArrowUpRight } from "lucide-react";

export function RankingSettings({
  settings,
  scope,
  update,
  openAll,
}: {
  settings: Settings;
  scope: PageScope | null;
  update: (patch: Partial<Settings>) => Promise<void>;
  openAll: () => void;
}) {
  const t = translator(settings.language);
  const [limit, setLimit] = useState(String(settings.rankingLimit)),
    [minimum, setMinimum] = useState(String(settings.minimumViews)),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const revision = useRef(0);
  useEffect(
    () => setLimit(String(settings.rankingLimit)),
    [settings.rankingLimit],
  );
  useEffect(
    () => setMinimum(String(settings.minimumViews)),
    [settings.minimumViews],
  );
  const commit = (patch: Partial<Settings>) => {
    const request = ++revision.current;
    setMessage(t("saving"));
    setFailed(false);
    void update(patch)
      .then(() => {
        if (revision.current === request) setMessage(t("saved"));
      })
      .catch(() => {
        if (revision.current === request) {
          setMessage(t("saveFailed"));
          setFailed(true);
        }
      });
  };
  const validLimit =
    limit.trim() !== "" &&
    Number.isInteger(Number(limit)) &&
    Number(limit) >= 1 &&
    Number(limit) <= 1000;
  const validMinimum =
    minimum.trim() !== "" &&
    Number.isSafeInteger(Number(minimum)) &&
    Number(minimum) >= 0;
  const fields: RankingField[] = [
    "rank",
    "tier",
    "username",
    "preview",
    "views",
    "speed",
  ];
  return (
    <div className="xt-ranking-settings">
      <section className="xt-ranking-setting-row">
        <div>
          <label htmlFor="xt-ranking-limit">{t("showTop")}</label>
          <small>{t("rankingLimitHint")}</small>
        </div>
        <input
          id="xt-ranking-limit"
          type="number"
          min="1"
          max="1000"
          step="1"
          value={limit}
          aria-invalid={!validLimit}
          onChange={(e) => {
            const value = e.target.value;
            setLimit(value);
            if (
              value.trim() &&
              Number.isInteger(Number(value)) &&
              Number(value) >= 1 &&
              Number(value) <= 1000
            )
              commit({ rankingLimit: Number(value) });
          }}
          onBlur={() => {
            if (!validLimit) setLimit(String(settings.rankingLimit));
          }}
        />
      </section>
      {!validLimit && (
        <p className="xt-error" role="alert">
          {t("limitError")}
        </p>
      )}
      <section className="xt-ranking-setting-section">
        <label className="xt-toggle-row">
          <span>
            <strong>{t("hotOnly")}</strong>
            <small>{t("hotOnlyHint")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={t("hotOnly")}
            checked={settings.hotOnly}
            onChange={(e) => commit({ hotOnly: e.target.checked })}
          />
          <span className="xt-toggle" aria-hidden="true" />
        </label>
        {settings.hotOnly && (
          <label className="xt-minimum-views">
            {t("minimumViews")}
            <input
              type="number"
              min="0"
              step="1"
              value={minimum}
              aria-invalid={!validMinimum}
              onChange={(e) => {
                const value = e.target.value;
                setMinimum(value);
                if (
                  value.trim() &&
                  Number.isSafeInteger(Number(value)) &&
                  Number(value) >= 0
                )
                  commit({ minimumViews: Number(value) });
              }}
              onBlur={() => {
                if (!validMinimum) setMinimum(String(settings.minimumViews));
              }}
            />
          </label>
        )}
        {settings.hotOnly && !validMinimum && (
          <p className="xt-error" role="alert">
            {t("minimumViewsError")}
          </p>
        )}
      </section>
      <fieldset className="xt-ranking-setting-section">
        <legend>{t("scope")}</legend>
        <div className="xt-scope-grid">
          {(["home", "list", "profile", "detail"] as const).map((key) => (
            <label className="xt-scope-row" key={key}>
              <input
                type="checkbox"
                aria-label={t(`scope_${key}`)}
                checked={settings.rankingScopes.includes(key)}
                onChange={(e) =>
                  commit({
                    rankingScopes: e.target.checked
                      ? [...settings.rankingScopes, key]
                      : settings.rankingScopes.filter((s) => s !== key),
                  })
                }
              />
              <span>{t(`scope_${key}`)}</span>
              {scope === key && (
                <small className="xt-current">{t("current")}</small>
              )}
            </label>
          ))}
        </div>
      </fieldset>
      <section className="xt-ranking-setting-section">
        <label className="xt-edge-row xt-toggle-row">
          <span>
            <strong>{t("edgeHide")}</strong>
            <small>{t("edgeHideHint")}</small>
          </span>
          <input
            type="checkbox"
            aria-label={t("edgeHide")}
            checked={settings.edgeHide}
            onChange={(e) =>
              commit({
                edgeHide: e.target.checked,
                ...(e.target.checked ? {} : { dock: null }),
              })
            }
          />
          <span className="xt-toggle" aria-hidden="true" />
        </label>
      </section>
      <fieldset className="xt-ranking-setting-section">
        <legend>{t("visibleFields")}</legend>
        <div className="xt-ranking-field-grid">
          {fields.map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={settings.rankingFields[key]}
                onChange={(e) => {
                  const rankingFields = {
                    ...settings.rankingFields,
                    [key]: e.target.checked,
                  };
                  if (!Object.values(rankingFields).some(Boolean)) {
                    setMessage(t("keepOneField"));
                    setFailed(true);
                    return;
                  }
                  commit({ rankingFields });
                }}
              />
              <span>{t(`field_${key}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <footer>
        <p>{t("autoSaved")}</p>
        <div
          role={failed ? "alert" : "status"}
          className={failed ? "xt-error" : "xt-status"}
        >
          {message}
        </div>
        <button className="xt-text-button" onClick={openAll}>
          {t("allSettings")}
          <span className="xt-more-icon" aria-hidden="true">
            <ArrowUpRight size={14} strokeWidth={1.5} />
          </span>
        </button>
      </footer>
    </div>
  );
}
