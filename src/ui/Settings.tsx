import { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
  Languages,
  Palette,
  Trash2,
} from "lucide-react";
import type { Settings } from "../core/types";
import { translator } from "./i18n";
import { LocalNote, Wordmark } from "./shared";
import { usePalette } from "./palette";
import { difference } from "../core/preferences";
import { enhanceT } from "./enhance-i18n";
export function SettingsView({
  initial,
  save,
  clearCache,
  popup = false,
  openRanking,
}: {
  initial: Settings;
  save: (settings: Partial<Settings>) => Promise<void>;
  clearCache: () => Promise<void>;
  popup?: boolean;
  openRanking?: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [rising, setRising] = useState(String(initial.rising)),
    [viral, setViral] = useState(String(initial.viral));
  const [base, setBase] = useState(initial);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const t = translator(draft.language);
  const palette = usePalette(draft);
  const extra = enhanceT(draft.language);
  const edited = { ...draft, rising: Number(rising), viral: Number(viral) },
    changes = difference(base, edited);
  const editable = [
    "rising",
    "viral",
    "badges",
    "panel",
    "images",
    "language",
    "theme",
    "position",
  ];
  const patch = Object.fromEntries(
      Object.entries(changes).filter(([key]) => editable.includes(key)),
    ) as Partial<Settings>,
    dirty = Object.keys(patch).length > 0;
  useEffect(() => {
    if (!dirty) {
      setDraft(initial);
      setBase(initial);
      setRising(String(initial.rising));
      setViral(String(initial.viral));
    }
  }, [initial]);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((s) => ({ ...s, [key]: value }));
    setMessage("");
  };
  const valid =
    Number.isFinite(Number(rising)) &&
    Number(rising) > 0 &&
    Number.isFinite(Number(viral)) &&
    Number(viral) > Number(rising);
  return (
    <div
      className={`xt-settings ${popup ? "popup" : ""}`}
      style={palette}
      data-theme={draft.theme}
    >
      {popup && (
        <header className="xt-popup-header">
          <Wordmark />
          <LocalNote text={t("local")} />
        </header>
      )}
      {popup && (
        <div className="xt-settings-intro">
          <h1>{t("settings")}</h1>
          <p>{t("settingsHint")}</p>
        </div>
      )}
      <form
        data-dirty={dirty || undefined}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) {
            setMessage(t("thresholdError"));
            return;
          }
          setBusy(true);
          try {
            await save(patch);
            setBase(edited);
            setMessage(t("saved"));
          } catch {
            setMessage(t("saveFailed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="xt-field-note">{extra("saveHint")}</p>
        {dirty &&
          editable.some(
            (key) =>
              key in patch &&
              JSON.stringify(initial[key as keyof Settings]) !==
                JSON.stringify(base[key as keyof Settings]),
          ) && (
            <p role="status" className="xt-notice">
              {extra("conflict")}
            </p>
          )}
        <section className="xt-setting-section">
          <h3>
            <SlidersHorizontal size={15} />
            {t("thresholds")}
          </h3>
          <p>{t("thresholdHint")}</p>
          <div className="xt-thresholds">
            <label>
              <span className="xt-dot rising" />
              {t("risingThreshold")}
              <input
                type="number"
                min="1"
                step="any"
                value={rising}
                onChange={(e) => {
                  setRising(e.target.value);
                  setMessage("");
                }}
                required
              />
            </label>
            <label>
              <span className="xt-dot viral" />
              {t("viralThreshold")}
              <input
                type="number"
                min="1"
                step="any"
                value={viral}
                onChange={(e) => {
                  setViral(e.target.value);
                  setMessage("");
                }}
                required
              />
            </label>
          </div>
          {!valid && <p className="xt-error">{t("thresholdError")}</p>}
        </section>
        <section className="xt-setting-section">
          <h3>{t("modules")}</h3>
          {(["badges", "panel", "images"] as const).map((key) => (
            <label className="xt-toggle-row" key={key}>
              <span>{t(key)}</span>
              <input
                type="checkbox"
                role="switch"
                checked={draft[key]}
                onChange={(e) => change(key, e.target.checked)}
              />
              <span className="xt-toggle" aria-hidden="true" />
            </label>
          ))}
          {openRanking && (
            <button
              type="button"
              className="xt-text-button"
              onClick={openRanking}
            >
              {t("rankingSettings")}
              <ChevronRight size={13} />
            </button>
          )}
        </section>
        <section className="xt-setting-section xt-preferences">
          <label>
            <span>
              <Languages size={15} />
              {t("language")}
            </span>
            <select
              aria-label={t("language")}
              value={draft.language}
              onChange={(e) =>
                change("language", e.target.value as Settings["language"])
              }
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
            </select>
          </label>
          <label>
            <span>
              <Palette size={15} />
              {t("theme")}
            </span>
            <select
              aria-label={t("theme")}
              value={draft.theme}
              onChange={(e) =>
                change("theme", e.target.value as Settings["theme"])
              }
            >
              {(["auto", "light", "dark"] as const).map((key) => (
                <option value={key} key={key}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>
        </section>
        <div className="xt-settings-actions">
          <button
            className="xt-primary"
            type="submit"
            disabled={busy || !valid}
          >
            <Check size={16} />
            {t("save")}
            <ChevronRight size={16} />
          </button>
          <button
            className="xt-text-button"
            type="button"
            onClick={() => change("position", null)}
          >
            <RotateCcw size={13} />
            {t("resetPosition")}
          </button>
        </div>
        <div className="xt-status" role="status">
          {message}
        </div>
      </form>
      <footer className="xt-settings-footer">
        <LocalNote text={t("privacy")} />
        <p>{t("privacyDetail")}</p>
        <button
          className="xt-text-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await clearCache();
              setMessage(t("cacheCleared"));
            } catch {
              setMessage(t("saveFailed"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Trash2 size={13} />
          {t("clearCache")}
        </button>
        <small>Xtrend 0.2.0 · MIT</small>
      </footer>
    </div>
  );
}
