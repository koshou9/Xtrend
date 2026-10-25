import { useEffect, useState } from "react";
import type { PanelProps } from "./FeaturePanels";
import type { HubServices } from "../platform/monitoring";
import { enhanceT } from "./enhance-i18n";

export function NotificationControls({
  settings,
  update,
  notify,
  services,
}: PanelProps & { services: HubServices }) {
  const t = enhanceT(settings.language),
    [draft, setDraft] = useState(settings.notifications);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(settings.notifications);
  useEffect(() => {
    if (!dirty) setDraft(settings.notifications);
  }, [settings.notifications]);
  return (
    <section className="xt-hub-card">
      <h2>{t("notificationControls")}</h2>
      <form
        data-dirty={dirty || undefined}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await update({ notifications: draft });
          } catch {
            /* Parent displays storage failures. */
          }
        }}
      >
        <label className="xt-toggle-row">
          <span>{t("quiet")}</span>
          <input
            type="checkbox"
            checked={draft.quietEnabled}
            onChange={(e) =>
              setDraft({ ...draft, quietEnabled: e.target.checked })
            }
          />
        </label>
        <div className="xt-hub-two">
          <label>
            {t("quietStart")}
            <input
              type="time"
              aria-label={t("quietStart")}
              required
              value={draft.quietStart}
              onChange={(e) =>
                setDraft({ ...draft, quietStart: e.target.value })
              }
            />
          </label>
          <label>
            {t("quietEnd")}
            <input
              type="time"
              aria-label={t("quietEnd")}
              required
              value={draft.quietEnd}
              onChange={(e) => setDraft({ ...draft, quietEnd: e.target.value })}
            />
          </label>
        </div>
        <div className="xt-hub-two">
          <label>
            {t("merge")}
            <input
              type="number"
              aria-label={t("merge")}
              required
              min="0"
              max="60"
              step="1"
              value={draft.mergeMinutes}
              onChange={(e) =>
                setDraft({ ...draft, mergeMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            {t("cooldown")}
            <input
              type="number"
              aria-label={t("cooldown")}
              required
              min="0"
              max="1440"
              step="1"
              value={draft.cooldownMinutes}
              onChange={(e) =>
                setDraft({ ...draft, cooldownMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <button className="xt-secondary" type="submit">
          {t("saveNotifications")}
        </button>
      </form>
      <p className="xt-hub-small">{t("notificationHelp")}</p>
      <button
        className="xt-text-button"
        disabled={!settings.bark.enabled}
        onClick={() =>
          void services.flush().catch(() => notify("operationFailed", true))
        }
      >
        {t("flush")}
      </button>
    </section>
  );
}
