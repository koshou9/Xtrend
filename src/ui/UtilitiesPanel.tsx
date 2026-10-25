import { useRef, useState } from "react";
import type { Settings } from "../core/types";
import { createBackup, readBackup } from "../core/backup";
import type { Diagnostics, HubServices } from "../platform/monitoring";
import { hubT } from "./hub-i18n";
import { translator } from "./i18n";
import { enhanceT } from "./enhance-i18n";
import { downloadText } from "./files";
import type { PanelProps } from "./FeaturePanels";

export function UtilitiesPanel({
  settings,
  update,
  services,
}: PanelProps & { services: HubServices }) {
  const t = enhanceT(settings.language),
    common = hubT(settings.language),
    input = useRef<HTMLInputElement>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null),
    [backup, setBackup] = useState<Partial<Settings> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      setDiagnostics(await services.diagnostics());
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="xt-hub-card">
        <h2>{t("diagnostics")}</h2>
        <p className="xt-hub-small">{t("localOnly")}</p>
        <button
          className="xt-secondary"
          disabled={busy}
          onClick={() => void run()}
        >
          {t("check")}
        </button>
        {diagnostics && (
          <div className="xt-diagnostics">
            <p>
              {t("storage")}: {(diagnostics.storageBytes / 1024).toFixed(1)} KB
              / 5 MB
            </p>
            <p>
              {t("records")}: {diagnostics.monitorCount}
            </p>
            <p>
              Bark:{" "}
              {diagnostics.barkEnabled
                ? diagnostics.barkPermitted
                  ? t("connection")
                  : t("unavailable")
                : "—"}
            </p>
            {!diagnostics.pages.length && <p>{t("noPages")}</p>}
            {diagnostics.pages.map((page, i) => (
              <article key={i}>
                <strong>
                  {page.site} · {i + 1}
                </strong>
                <p>
                  {t("readPosts")}: {page.posts}
                </p>
                <p>
                  {t("lastRead")}:{" "}
                  {page.lastRead
                    ? new Date(page.lastRead).toLocaleString(settings.language)
                    : "—"}
                </p>
                <p>
                  {translator(settings.language)("star")} / Grok /{" "}
                  {settings.language === "zh"
                    ? "临时模式"
                    : settings.language === "ja"
                      ? "一時モード"
                      : "Temporary"}
                  :{" "}
                  {[
                    page.capabilities.reposts || page.capabilities.quotes,
                    page.capabilities.grok,
                    page.capabilities.temporary,
                  ]
                    .map((v) => (v ? "✓" : "—"))
                    .join(" / ")}
                </p>
                {page.error && <p role="alert">{t("monitorFailed")}</p>}
              </article>
            ))}
            <button
              className="xt-text-button"
              onClick={() =>
                downloadText(
                  "xtrend-local-check.json",
                  JSON.stringify(diagnostics, null, 2),
                )
              }
            >
              {t("exportCheck")}
            </button>
          </div>
        )}
        <p className="xt-hub-small">{t("checkHelp")}</p>
      </section>
      <section className="xt-hub-card">
        <h2>{t("backup")}</h2>
        <p className="xt-hub-small">{t("backupHelp")}</p>
        <div className="xt-hub-action-row">
          <button
            className="xt-secondary"
            onClick={() =>
              downloadText("xtrend-settings.json", createBackup(settings))
            }
          >
            {t("exportBackup")}
          </button>
          <button
            className="xt-secondary"
            onClick={() => input.current?.click()}
          >
            {t("importBackup")}
          </button>
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept="application/json,.json"
          aria-label={t("importBackup")}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > 750000) throw new Error();
              setBackup(readBackup(await file.text()));
              setError("");
            } catch {
              setBackup(null);
              setError(t("invalidBackup"));
            }
          }}
        />
        {backup && (
          <div
            className="xt-backup-preview"
            role="region"
            aria-label={t("previewBackup")}
          >
            <h3>{t("previewBackup")}</h3>
            <p>
              {backup.language} · {backup.appearance?.custom.length ?? 0}{" "}
              {common("presets")} ·{" "}
              {(backup.filtering?.customRules.length ?? 0) +
                (backup.filtering?.importedRules.length ?? 0)}{" "}
              {common("allRules")}
            </p>
            <p>{t("restoreHelp")}</p>
            <button
              className="xt-secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await update({
                    ...backup,
                    bark: { ...settings.bark, enabled: false },
                  });
                  setBackup(null);
                } catch {
                  setError(t("error"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("restore")}
            </button>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="xt-error">
          {error}
        </p>
      )}
    </>
  );
}
