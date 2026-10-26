import { SavedDialog, ReadingPresets } from "./ResearchTools";
import { useEffect } from "react";
import type { Workspace } from "../content/model";
import { translator } from "./i18n";
import { Dialog, useWorkspace } from "./shared";
import { Rankings } from "./Rankings";
import { SettingsView } from "./Settings";
import { StarMap } from "./StarMap";
import { GrokAssistant } from "./GrokAssistant";
import { ImageReader } from "./ImageReader";
import { RankingSettings } from "./RankingSettings";
import { TweetConnection } from "./TweetConnection";
import { usePalette } from "./palette";
import { rankingApplies } from "../core/ranking";
import { enhanceT } from "./enhance-i18n";
import {
  BatchExport,
  FilteredPosts,
  TrendView,
  ColumnSettings,
} from "./ReadingTools";
export function App({
  model,
  demo = false,
}: {
  model: Workspace;
  demo?: boolean;
}) {
  const state = useWorkspace(model),
    t = translator(state.settings.language),
    modal = state.modal;
  const palette = usePalette(state.settings);
  useEffect(() => {
    if (!state.toast) return;
    const timeout = setTimeout(() => model.notify(""), 6500);
    return () => clearTimeout(timeout);
  }, [state.toast]);
  return (
    <div
      className="xt-app"
      style={palette}
      data-theme={state.settings.theme}
      lang={state.settings.language}
    >
      <Rankings model={model} demo={demo} />
      {!rankingApplies(state.settings, state.scope) &&
        state.filtered.length > 0 && (
          <button
            className="xt-filter-recovery xt-secondary"
            onClick={() => model.open({ type: "filtered" })}
          >
            {enhanceT(state.settings.language)("showFiltered")} ·{" "}
            {state.filtered.length}
          </button>
        )}
      <TweetConnection model={model} />
      {modal?.type === "ranking-settings" && (
        <Dialog
          model={model}
          title={t("rankingSettings")}
          className="xt-ranking-settings-dialog"
        >
          <RankingSettings
            settings={state.settings}
            scope={state.scope}
            update={(patch) => model.update(patch)}
            openAll={() => model.open({ type: "settings" })}
          />
          <ColumnSettings model={model} />
          <ReadingPresets
            settings={state.settings}
            update={(patch) => model.update(patch)}
          />
        </Dialog>
      )}
      {modal?.type === "settings" && (
        <Dialog
          model={model}
          title={t("settings")}
          subtitle={t("settingsHint")}
        >
          <SettingsView
            initial={state.settings}
            save={async (settings) => {
              await model.update(settings);
            }}
            clearCache={() => model.cache.clear()}
            openRanking={() => model.open({ type: "ranking-settings" })}
          />
        </Dialog>
      )}
      {modal?.type === "star" && <StarMap model={model} tweet={modal.tweet} />}
      {modal?.type === "grok" && (
        <GrokAssistant model={model} tweet={modal.tweet} />
      )}
      {modal?.type === "image" && (
        <ImageReader model={model} photos={modal.photos} index={modal.index} />
      )}
      {modal?.type === "saved" && (
        <SavedDialog model={model} tweet={modal.tweet} />
      )}
      {modal?.type === "filtered" && <FilteredPosts model={model} />}
      {modal?.type === "batch" && <BatchExport model={model} />}
      {modal?.type === "trend" && (
        <TrendView model={model} tweet={modal.tweet} />
      )}
      {modal?.type === "copy" && (
        <Dialog model={model} title={t("copyManually")}>
          <div className="xt-manual-copy">
            <textarea
              readOnly
              aria-label={t("copyManually")}
              value={modal.text}
              onFocus={(e) => e.currentTarget.select()}
              rows={12}
            />
          </div>
        </Dialog>
      )}
      {state.toast && (
        <div className="xt-toast" role="status">
          {state.toast}
        </div>
      )}
    </div>
  );
}
