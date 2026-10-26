import { useEffect, useState } from "react";
import type { Settings } from "../core/types";
import { aiEndpoint, defaultAi, type AiSettings } from "../core/ai";
import { DEFAULT_TEMPLATE } from "../core/settings";
import type { HubServices } from "../platform/monitoring";
import { aiT, templateName } from "./ai-i18n";

export function TemplateEditor({
  settings,
  update,
  services,
}: {
  settings: Settings;
  update(patch: Partial<Settings>): Promise<void>;
  services: HubServices;
}) {
  const t = aiT(settings.language),
    [draft, setDraft] = useState(settings.ai),
    [base, setBase] = useState(settings.ai),
    [key, setKey] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base) || !!key;
  useEffect(() => {
    if (!dirty) {
      setDraft(settings.ai);
      setBase(settings.ai);
    }
  }, [settings.ai]);
  const change = (patch: Partial<AiSettings>) => {
    setDraft({ ...draft, ...patch });
    setMessage("");
  };
  const selected =
    draft.templates.find((x) => x.id === draft.selected) ?? draft.templates[0]!;
  const editTemplate = (patch: Partial<typeof selected>) =>
    change({
      templates: draft.templates.map((x) =>
        x.id === selected.id ? { ...x, ...patch } : x,
      ),
    });
  const save = async () => {
    setBusy(true);
    setFailed(false);
    setMessage(t("saving"));
    try {
      if (
        !Number.isInteger(draft.count) ||
        draft.count < 1 ||
        draft.count > 30 ||
        draft.templates.some((x) => !x.name.trim() || !x.prompt.trim())
      )
        throw new Error("invalidAiConfig");
      if (draft.provider !== "grok") {
        aiEndpoint(draft[draft.provider].endpoint);
        if (!draft[draft.provider].model.trim())
          throw new Error("invalidAiConfig");
      }
      if (services.preview && draft.provider !== "grok")
        throw new Error("preview");
      if (services.authorizeAi && !(await services.authorizeAi(draft)))
        throw new Error("permissionDenied");
      if (services.configureAi) await services.configureAi(draft, key);
      else await update({ ai: draft });
      setBase(draft);
      setKey("");
      setMessage(t("saved"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        [
          "invalidAiConfig",
          "permissionDenied",
          "missingAiKey",
          "preview",
        ].includes(code)
          ? t(code as "invalidAiConfig")
          : t("failed"),
      );
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="xt-ai-settings"
      data-dirty={dirty || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="xt-hub-card">
        <h1>{t("service")}</h1>
        <h2>{t("source")}</h2>
        <div className="xt-ai-providers" role="group" aria-label={t("source")}>
          {(
            [
              ["grok", "X Grok", "grok"],
              ["openai", t("compatible"), "compatibleHint"],
              ["ollama", "Ollama", "local"],
            ] as const
          ).map(([provider, label, hint]) => (
            <button
              type="button"
              key={provider}
              aria-pressed={draft.provider === provider}
              onClick={() => {
                change({ provider });
                setKey("");
              }}
            >
              <strong>{label}</strong>
              <small>{t(hint)}</small>
            </button>
          ))}
        </div>
        <h2>{t("config")}</h2>
        {draft.provider === "grok" ? (
          <p className="xt-notice">{t("grokHint")}</p>
        ) : (
          <>
            <label>
              {t("endpoint")}
              <input
                type="url"
                aria-label={t("endpoint")}
                required
                maxLength={2048}
                value={draft[draft.provider].endpoint}
                onChange={(e) => {
                  if (draft.provider !== "grok") {
                    change({
                      [draft.provider]: {
                        ...draft[draft.provider],
                        endpoint: e.target.value,
                      },
                    });
                    setKey("");
                  }
                }}
              />
            </label>
            <label>
              {t("model")}
              <input
                required
                aria-label={t("model")}
                maxLength={200}
                value={draft[draft.provider].model}
                onChange={(e) => {
                  if (draft.provider !== "grok")
                    change({
                      [draft.provider]: {
                        ...draft[draft.provider],
                        model: e.target.value,
                      },
                    });
                }}
              />
            </label>
            {draft.provider === "openai" && (
              <label>
                {t("key")}
                <input
                  type="password"
                  aria-label={t("key")}
                  autoComplete="off"
                  maxLength={4096}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <small className="xt-field-note">{t("keyHint")}</small>
              </label>
            )}
          </>
        )}
        <h2>{t("generation")}</h2>
        <label>
          {t("count")}
          <input
            type="number"
            aria-label={t("count")}
            required
            min={1}
            max={30}
            value={Number.isNaN(draft.count) ? "" : draft.count}
            onChange={(e) => change({ count: e.target.valueAsNumber })}
          />
        </label>
        <div className="xt-hub-action-row">
          {draft.provider === "grok" && (
            <button
              type="button"
              className="xt-secondary"
              disabled={busy}
              onClick={async () => {
                setFailed(false);
                try {
                  setMessage(
                    t((await services.checkGrok?.()) ? "ready" : "unavailable"),
                  );
                } catch {
                  setFailed(true);
                  setMessage(t("unavailable"));
                }
              }}
            >
              {t("check")}
            </button>
          )}
          <button className="xt-primary" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </section>
      <section className="xt-hub-card">
        <h2>{t("templates")}</h2>
        <div className="xt-template-tabs">
          {draft.templates.map((item) => (
            <span
              key={item.id}
              className={selected.id === item.id ? "active" : ""}
            >
              <button
                type="button"
                aria-pressed={selected.id === item.id}
                onClick={() => change({ selected: item.id })}
              >
                {templateName(item, settings.language)}
              </button>
              {draft.templates.length > 1 && (
                <button
                  type="button"
                  aria-label={`${t("remove")}: ${templateName(item, settings.language)}`}
                  onClick={() => {
                    const templates = draft.templates.filter(
                      (x) => x.id !== item.id,
                    );
                    change({
                      templates,
                      selected:
                        draft.selected === item.id
                          ? templates[0]!.id
                          : draft.selected,
                    });
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            aria-label={t("add")}
            disabled={draft.templates.length >= 30}
            onClick={() => {
              const id = crypto.randomUUID();
              change({
                selected: id,
                templates: [
                  ...draft.templates,
                  { id, name: t("custom"), prompt: "{{text}}" },
                ],
              });
            }}
          >
            +
          </button>
        </div>
        <label>
          {t("name")}
          <input
            required
            aria-label={t("name")}
            maxLength={60}
            value={selected.name}
            onChange={(e) => editTemplate({ name: e.target.value })}
          />
        </label>
        <label>
          {t("prompt")}
          <textarea
            required
            aria-label={t("prompt")}
            rows={6}
            maxLength={12000}
            value={selected.prompt}
            onChange={(e) => editTemplate({ prompt: e.target.value })}
          />
        </label>
        <p className="xt-field-note">{t("help")}</p>
        <label className="xt-toggle-row">
          <span>{t("temporary")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={draft.temporary}
            onChange={(e) => change({ temporary: e.target.checked })}
          />
          <span className="xt-toggle" aria-hidden="true" />
        </label>
        <p className="xt-field-note">{t("temporaryHint")}</p>
        <div className="xt-hub-action-row">
          <button
            type="button"
            className="xt-secondary"
            disabled={busy}
            onClick={() => {
              const defaults = defaultAi(DEFAULT_TEMPLATE);
              change({
                templates: defaults.templates,
                selected: defaults.selected,
              });
            }}
          >
            {t("restore")}
          </button>
          <button className="xt-primary" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </section>
      {message && (
        <p
          className={failed ? "xt-error" : "xt-notice"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
