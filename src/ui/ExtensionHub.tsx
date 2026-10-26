import { ReadingPresets, SavedPosts } from "./ResearchTools";
import { researchT } from "./research-i18n";
import { useRef, useState } from "react";
import {
  BookOpen,
  Filter,
  Gauge,
  Globe2,
  Info,
  Moon,
  Palette,
  Radio,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import type { Settings } from "../core/types";
import type { HubServices } from "../platform/monitoring";
import { AppearancePanel, FilterPanel } from "./FeaturePanels";
import { MonitorPanel } from "./MonitorPanel";
import { hubT } from "./hub-i18n";
import type { HubKey } from "./hub-i18n";
import { RankingSettings } from "./RankingSettings";
import { SettingsView } from "./Settings";
import { usePalette } from "./palette";
import { Wordmark } from "./shared";
import { TemplateEditor } from "./TemplateEditor";
import { UtilitiesPanel } from "./UtilitiesPanel";
import { enhanceT } from "./enhance-i18n";
import { version } from "../../package.json";

export function ExtensionHub({
  settings,
  update: save,
  services,
  clearCache,
}: {
  settings: Settings;
  update(patch: Partial<Settings>): Promise<void>;
  services: HubServices;
  clearCache(): Promise<void>;
}) {
  const [tab, setTab] = useState<
      | "filters"
      | "rankings"
      | "monitor"
      | "appearance"
      | "ai"
      | "about"
      | "settings"
    >("filters"),
    [message, setMessage] = useState<HubKey | null>(null),
    [failed, setFailed] = useState(false);
  const [pendingTab, setPendingTab] = useState<typeof tab | null>(null),
    root = useRef<HTMLDivElement>(null),
    extra = enhanceT(settings.language);
  const navigate = (next: typeof tab) => {
    if (next === tab) return;
    if (root.current?.querySelector('[data-dirty="true"]')) setPendingTab(next);
    else {
      setTab(next);
      setMessage(null);
    }
  };
  const t = hubT(settings.language),
    palette = usePalette(settings);
  const notify = (key: HubKey, error = false) => {
    setMessage(key);
    setFailed(error);
  };
  const update = async (patch: Partial<Settings>) => {
    notify("saving");
    try {
      await save(patch);
      notify("saved");
    } catch (error) {
      notify("saveFailed", true);
      throw error;
    }
  };
  const tabs = [
    { key: "filters", Icon: Filter },
    { key: "rankings", Icon: Gauge },
    { key: "monitor", Icon: Radio },
    { key: "appearance", Icon: Palette },
    { key: "ai", Icon: Sparkles },
    { key: "about", Icon: Info },
  ] as const;
  const Theme =
    settings.theme === "dark"
      ? Moon
      : settings.theme === "light"
        ? Sun
        : Globe2;
  return (
    <div
      ref={root}
      className="xt-app xt-extension-hub"
      data-theme={settings.theme}
      style={palette}
      lang={settings.language}
    >
      <header className="xt-hub-header">
        <div>
          <Wordmark />
          <p>{t("subtitle")}</p>
        </div>
        <div className="xt-hub-header-tools">
          <select
            aria-label={t("language")}
            value={settings.language}
            onChange={(e) =>
              void update({
                language: e.target.value as Settings["language"],
              }).catch(() => {})
            }
          >
            <option value="en">EN</option>
            <option value="zh">中</option>
            <option value="ja">日</option>
          </select>
          <button
            className="xt-icon"
            aria-label={`${t("theme")}: ${t(settings.theme)}`}
            title={t(settings.theme)}
            onClick={() =>
              void update({
                theme:
                  settings.theme === "auto"
                    ? "light"
                    : settings.theme === "light"
                      ? "dark"
                      : "auto",
              }).catch(() => {})
            }
          >
            <Theme size={18} />
          </button>
          <button
            className="xt-icon"
            aria-label={t("settings")}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      <nav className="xt-hub-tabs" aria-label="Xtrend">
        {tabs.map(({ key, Icon }) => (
          <button
            className={tab === key ? "active" : ""}
            aria-current={tab === key ? "page" : undefined}
            key={key}
            onClick={() => navigate(key)}
          >
            <Icon size={15} />
            {t(key)}
          </button>
        ))}
      </nav>
      <main className="xt-hub-main">
        {tab === "filters" && (
          <FilterPanel settings={settings} update={update} notify={notify} />
        )}
        {tab === "rankings" && (
          <section className="xt-hub-card xt-hub-rankings">
            <h1>{t("rankings")}</h1>
            <ReadingPresets settings={settings} update={update} />
            <RankingSettings
              settings={settings}
              scope={null}
              update={save}
              openAll={() => navigate("settings")}
            />
          </section>
        )}
        {tab === "appearance" && (
          <AppearancePanel
            settings={settings}
            update={update}
            notify={notify}
          />
        )}
        {tab === "monitor" && (
          <MonitorPanel
            settings={settings}
            update={update}
            notify={notify}
            services={services}
          />
        )}
        {tab === "ai" && (
          <TemplateEditor
            settings={settings}
            update={update}
            services={services}
          />
        )}
        {tab === "about" && (
          <>
            <section className="xt-hub-card">
              <BookOpen size={24} />
              <h1>{t("aboutTitle")}</h1>
              <p className="xt-hub-description">{t("aboutBody")}</p>
              <p>{t("privacyRecords")}</p>
              <p className="xt-hub-small">{t("aboutLimits")}</p>
              <p className="xt-hub-small">Xtrend {version} · MIT</p>
              <p className="xt-hub-small">
                {researchT(settings.language)("refreshHelp")}
              </p>
              <button
                className="xt-secondary"
                onClick={() => navigate("settings")}
              >
                {t("allSettings")}
              </button>
            </section>
            {services.library && (
              <section className="xt-hub-card">
                <h2>{researchT(settings.language)("library")}</h2>
                <SavedPosts
                  library={services.library}
                  language={settings.language}
                />
              </section>
            )}
            <UtilitiesPanel
              settings={settings}
              update={update}
              services={services}
              notify={notify}
            />
          </>
        )}
        {tab === "settings" && (
          <section className="xt-hub-card xt-hub-general">
            <h1>{t("settings")}</h1>
            <SettingsView
              initial={settings}
              save={save}
              clearCache={clearCache}
              openRanking={() => navigate("rankings")}
            />
          </section>
        )}
      </main>
      <footer
        className={`xt-hub-status ${failed ? "error" : ""}`}
        role={failed ? "alert" : "status"}
      >
        {t(message ?? "localRules")}
      </footer>
      {pendingTab && (
        <div className="xt-hub-confirm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label={extra("unsaved")}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPendingTab(null);
              if (e.key === "Tab") {
                const buttons = [...e.currentTarget.querySelectorAll("button")],
                  index = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                e.preventDefault();
                buttons[
                  (index + (e.shiftKey ? buttons.length - 1 : 1)) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            <h2>{extra("unsaved")}</h2>
            <p>{extra("unsavedHelp")}</p>
            <div className="xt-hub-action-row">
              <button
                autoFocus
                className="xt-primary"
                onClick={() => setPendingTab(null)}
              >
                {extra("stay")}
              </button>
              <button
                className="xt-secondary"
                onClick={() => {
                  setTab(pendingTab);
                  setPendingTab(null);
                  setMessage(null);
                }}
              >
                {extra("discard")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
