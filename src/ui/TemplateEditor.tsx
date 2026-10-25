import { useEffect, useState } from "react";
import type { Settings } from "../core/types";
import { hubT } from "./hub-i18n";
import { enhanceT } from "./enhance-i18n";
export function TemplateEditor({
  settings,
  update,
}: {
  settings: Settings;
  update(patch: Partial<Settings>): Promise<void>;
}) {
  const t = hubT(settings.language),
    extra = enhanceT(settings.language),
    [value, setValue] = useState(settings.template),
    [base, setBase] = useState(settings.template);
  const dirty = value !== base;
  useEffect(() => {
    if (!dirty) {
      setValue(settings.template);
      setBase(settings.template);
    }
  }, [settings.template]);
  return (
    <section className="xt-hub-card">
      <h1>{t("ai")}</h1>
      <p className="xt-hub-description">{t("aiHelp")}</p>
      <p className="xt-field-note">{extra("saveHint")}</p>
      {dirty && base !== settings.template && (
        <p className="xt-notice" role="status">
          {extra("conflict")}{" "}
          <button
            className="xt-text-button"
            onClick={() => {
              setValue(settings.template);
              setBase(settings.template);
            }}
          >
            {extra("latest")}
          </button>
        </p>
      )}
      <form
        data-dirty={dirty || undefined}
        onSubmit={async (e) => {
          e.preventDefault();
          if (value.trim()) {
            try {
              await update({ template: value });
              setBase(value);
            } catch {
              /* Parent reports storage failures. */
            }
          }
        }}
      >
        <label>
          {t("template")}
          <textarea
            aria-label={t("template")}
            rows={9}
            value={value}
            maxLength={12000}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
        <button className="xt-secondary" type="submit">
          {t("saveTemplate")}
        </button>
      </form>
    </section>
  );
}
