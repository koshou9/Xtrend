import { useRef, useState } from "react";
import { Check, Download, Edit2, Plus, Trash2, Upload } from "lucide-react";
import type { Settings } from "../core/types";
import type { FilterRule, Palette } from "../core/features";
import {
  activeRules,
  BUILTIN_RULES,
  defaultFiltering,
  importRules,
  parseAccounts,
  RULE_VERSION,
  ruleLabel,
  validAccounts,
  validateRule,
} from "../core/filtering";
import { PALETTES, validPalette, paletteLabel } from "../core/palette";
import { hubT } from "./hub-i18n";
import type { HubKey } from "./hub-i18n";
import { useSyncedText } from "./useSyncedText";
import { enhanceT } from "./enhance-i18n";

export interface PanelProps {
  settings: Settings;
  update(patch: Partial<Settings>): Promise<void>;
  notify(key: HubKey, error?: boolean): void;
}
export function FilterPanel({ settings, update, notify }: PanelProps) {
  const t = hubT(settings.language),
    f = settings.filtering,
    file = useRef<HTMLInputElement>(null);
  const [white, setWhite, whiteConflict, resetWhite] = useSyncedText(
      f.whitelist.join("\n"),
      (value) => parseAccounts(value).join("\n"),
    ),
    [black, setBlack, blackConflict, resetBlack] = useSyncedText(
      f.blacklist.join("\n"),
      (value) => parseAccounts(value).join("\n"),
    );
  const extra = enhanceT(settings.language);
  const [label, setLabel] = useState(""),
    [terms, setTerms] = useState(""),
    [match, setMatch] = useState<"any" | "all">("any"),
    [severity, setSeverity] = useState<1 | 2 | 3>(2),
    [editing, setEditing] = useState<string | null>(null);
  const commit = (patch: Partial<typeof f>) =>
    update({ filtering: { ...f, ...patch } });
  const active = activeRules(f),
    builtins = active.filter((r) => r.id.startsWith("builtin-")).length;
  const strengthKey = (value: number) =>
    value === 3 ? "loose" : value === 2 ? "standard" : "strict";
  return (
    <section className="xt-hub-card">
      <h1>{t("contentFilter")}</h1>
      <p className="xt-hub-description">{t("filterScope")}</p>
      <label className="xt-toggle-row xt-hub-enable">
        <span>{t("filterEnabled")}</span>
        <input
          aria-label={t("filterEnabled")}
          type="checkbox"
          role="switch"
          checked={f.enabled}
          onChange={(e) =>
            void commit({ enabled: e.target.checked }).catch(() => {})
          }
        />
        <span className="xt-toggle" aria-hidden="true" />
      </label>
      <div className="xt-strength">
        {(["loose", "standard", "strict"] as const).map((strength) => (
          <button
            key={strength}
            className={f.strength === strength ? "active" : ""}
            aria-pressed={f.strength === strength}
            onClick={() => void commit({ strength }).catch(() => {})}
          >
            {t(strength)} ·{" "}
            {
              activeRules({
                ...f,
                strength,
                customRules: [],
                importedRules: [],
              }).length
            }
          </button>
        ))}
      </div>
      <p className="xt-hub-small">
        {t("rulesSummary")}:{" "}
        <strong>
          {builtins} / {active.filter((r) => r.id.startsWith("import:")).length}{" "}
          / {active.filter((r) => r.id.startsWith("custom:")).length}
        </strong>
      </p>
      <p className="xt-hub-small">
        {t("localRules")} · {t("ruleVersion")} {RULE_VERSION}
        {f.importedAt
          ? ` · ${new Date(f.importedAt).toLocaleString(settings.language)}`
          : ""}
      </p>
      <div className="xt-hub-action-row">
        <button className="xt-secondary" onClick={() => file.current?.click()}>
          <Upload size={14} />
          {t("importRules")}
        </button>
        <button
          className="xt-text-button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      version: 1,
                      rules: [...f.importedRules, ...f.customRules],
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "xtrend-rules.json";
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={14} />
          {t("exportRules")}
        </button>
      </div>
      <input
        ref={file}
        type="file"
        hidden
        accept="application/json,.json"
        className="xt-rule-file"
        aria-label={t("importRules")}
        onChange={async (e) => {
          const selected = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!selected) return;
          try {
            if (selected.size > 100000) throw new Error();
            const rules = importRules(await selected.text());
            await commit({ importedRules: rules, importedAt: Date.now() });
            notify("imported");
          } catch {
            notify("invalidRules", true);
          }
        }}
      />
      <details className="xt-hub-details">
        <summary>{t("lists")}</summary>
        <form
          data-dirty={
            parseAccounts(white).join("\n") !== f.whitelist.join("\n") ||
            parseAccounts(black).join("\n") !== f.blacklist.join("\n") ||
            undefined
          }
          onSubmit={(e) => {
            e.preventDefault();
            const whitelist = parseAccounts(white),
              blacklist = parseAccounts(black);
            if (!validAccounts(whitelist) || !validAccounts(blacklist)) {
              notify("invalidAccounts", true);
              return;
            }
            void commit({ whitelist, blacklist }).catch(() => {});
          }}
        >
          {(whiteConflict || blackConflict) && (
            <p className="xt-notice" role="status">
              {extra("conflict")}
              <button
                type="button"
                className="xt-text-button"
                onClick={() => {
                  resetWhite();
                  resetBlack();
                }}
              >
                {extra("latest")}
              </button>
            </p>
          )}
          <p className="xt-hub-small">{t("accountHint")}</p>
          <div className="xt-hub-two">
            <label>
              {t("whitelist")}
              <textarea
                aria-label={t("whitelist")}
                value={white}
                onChange={(e) => setWhite(e.target.value)}
                rows={4}
              />
            </label>
            <label>
              {t("blacklist")}
              <textarea
                aria-label={t("blacklist")}
                value={black}
                onChange={(e) => setBlack(e.target.value)}
                rows={4}
              />
            </label>
          </div>
          <button className="xt-secondary" type="submit">
            {t("saveLists")}
          </button>
        </form>
      </details>
      <details className="xt-hub-details">
        <summary>
          {t("customRules")} · {f.customRules.length}
        </summary>
        <form
          data-dirty={!!label || !!terms || undefined}
          className="xt-rule-editor"
          onSubmit={(e) => {
            e.preventDefault();
            const rule = validateRule(
              {
                id: editing ?? crypto.randomUUID(),
                label,
                terms: terms
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
                match,
                severity,
                enabled: true,
              },
              "custom",
            );
            if (!rule) {
              notify("invalidRule", true);
              return;
            }
            if (!editing && f.customRules.length >= 100) {
              notify("limitRules", true);
              return;
            }
            void commit({
              customRules: editing
                ? f.customRules.map((r) => (r.id === editing ? rule : r))
                : [...f.customRules, rule],
            })
              .then(() => {
                setLabel("");
                setTerms("");
                setEditing(null);
              })
              .catch(() => {});
          }}
        >
          <label>
            {t("ruleName")}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            {t("terms")}
            <textarea
              aria-label={t("terms")}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
            />
          </label>
          <p className="xt-hub-small">{t("termsHint")}</p>
          <div className="xt-hub-two">
            <label>
              {t("match")}
              <select
                value={match}
                onChange={(e) => setMatch(e.target.value as typeof match)}
              >
                <option value="any">{t("any")}</option>
                <option value="all">{t("all")}</option>
              </select>
            </label>
            <label>
              {t("severity")}
              <select
                value={severity}
                onChange={(e) =>
                  setSeverity(Number(e.target.value) as typeof severity)
                }
              >
                <option value="3">{t("loose")}</option>
                <option value="2">{t("standard")}</option>
                <option value="1">{t("strict")}</option>
              </select>
            </label>
          </div>
          <div className="xt-hub-action-row">
            <button className="xt-secondary" type="submit">
              <Plus size={14} />
              {t("addRule")}
            </button>
            {editing && (
              <button
                type="button"
                className="xt-text-button"
                onClick={() => {
                  setEditing(null);
                  setLabel("");
                  setTerms("");
                }}
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </form>
        {f.customRules.map((rule) => (
          <div className="xt-local-rule" key={rule.id}>
            <label>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) =>
                  void commit({
                    customRules: f.customRules.map((r) =>
                      r.id === rule.id
                        ? { ...r, enabled: e.target.checked }
                        : r,
                    ),
                  }).catch(() => {})
                }
              />
              <span>
                <strong>{rule.label}</strong>
                <small>{rule.terms.join(" · ")}</small>
              </span>
            </label>
            <button
              className="xt-icon"
              aria-label={`${t("edit")} ${rule.label}`}
              onClick={() => {
                setEditing(rule.id);
                setLabel(rule.label);
                setTerms(rule.terms.join("\n"));
                setMatch(rule.match);
                setSeverity(rule.severity);
              }}
            >
              <Edit2 size={14} />
            </button>
            <button
              className="xt-icon"
              aria-label={`${t("remove")} ${rule.label}`}
              onClick={() =>
                void commit({
                  customRules: f.customRules.filter((r) => r.id !== rule.id),
                }).catch(() => {})
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </details>
      <details className="xt-hub-details">
        <summary>
          {t("allRules")} ·{" "}
          {BUILTIN_RULES.length + f.importedRules.length + f.customRules.length}
        </summary>
        <div className="xt-all-rules">
          {[...BUILTIN_RULES, ...f.importedRules, ...f.customRules].map(
            (rule) => (
              <label key={rule.id}>
                <input
                  type="checkbox"
                  checked={
                    rule.id.startsWith("builtin-")
                      ? !f.disabledBuiltinIds.includes(rule.id)
                      : rule.enabled
                  }
                  onChange={(e) =>
                    void commit(
                      rule.id.startsWith("builtin-")
                        ? {
                            disabledBuiltinIds: e.target.checked
                              ? f.disabledBuiltinIds.filter(
                                  (id) => id !== rule.id,
                                )
                              : [...f.disabledBuiltinIds, rule.id],
                          }
                        : rule.id.startsWith("import:")
                          ? {
                              importedRules: f.importedRules.map((r) =>
                                r.id === rule.id
                                  ? { ...r, enabled: e.target.checked }
                                  : r,
                              ),
                            }
                          : {
                              customRules: f.customRules.map((r) =>
                                r.id === rule.id
                                  ? { ...r, enabled: e.target.checked }
                                  : r,
                              ),
                            },
                    ).catch(() => {})
                  }
                />
                <span>
                  <strong>{ruleLabel(rule, settings.language)}</strong>
                  <small>
                    {t(strengthKey(rule.severity))} · {rule.terms.join(" · ")}
                  </small>
                </span>
              </label>
            ),
          )}
        </div>
      </details>
      <p className="xt-hub-small">{t("ruleCaution")}</p>
      <p className="xt-hub-small">{t("ruleCheck")}</p>
      <button
        className="xt-text-button xt-reset-filter"
        onClick={() =>
          void update({ filtering: defaultFiltering() }).catch(() => {})
        }
      >
        {t("resetFilter")}
      </button>
    </section>
  );
}

export function AppearancePanel({ settings, update, notify }: PanelProps) {
  const t = hubT(settings.language),
    a = settings.appearance;
  const [name, setName] = useState(""),
    [paper, setPaper] = useState("#fffdf9"),
    [ink, setInk] = useState("#292923"),
    [accent, setAccent] = useState("#b74723"),
    [editing, setEditing] = useState<string | null>(null);
  const commit = (appearance: typeof a) => update({ appearance });
  return (
    <section className="xt-hub-card">
      <h1>{t("presets")}</h1>
      <p className="xt-hub-description">{t("paletteHelp")}</p>
      <label className="xt-hub-inline-label">
        {t("theme")}
        <select
          aria-label={t("theme")}
          value={settings.theme}
          onChange={(e) =>
            void update({ theme: e.target.value as Settings["theme"] }).catch(
              () => {},
            )
          }
        >
          {(["auto", "light", "dark"] as const).map((value) => (
            <option value={value} key={value}>
              {t(value)}
            </option>
          ))}
        </select>
      </label>
      <div className="xt-palette-grid">
        {[...PALETTES, ...a.custom].map((card) => (
          <div
            className={`xt-color-card ${a.selected === card.id ? "selected" : ""}`}
            key={card.id}
          >
            <button
              aria-pressed={a.selected === card.id}
              onClick={() =>
                void commit({ ...a, selected: card.id }).catch(() => {})
              }
              aria-label={paletteLabel(card, settings.language)}
            >
              <span className="xt-card-swatches">
                <i style={{ background: card.paper }} />
                <i style={{ background: card.ink }} />
                <i style={{ background: card.accent }} />
              </span>
              <strong>{paletteLabel(card, settings.language)}</strong>
              {a.selected === card.id && <Check size={14} />}
            </button>
            {a.custom.some((c) => c.id === card.id) && (
              <div>
                <button
                  className="xt-text-button"
                  aria-label={`${t("edit")} ${card.name}`}
                  onClick={() => {
                    setEditing(card.id);
                    setName(card.name);
                    setPaper(card.paper);
                    setInk(card.ink);
                    setAccent(card.accent);
                  }}
                >
                  {t("edit")}
                </button>
                <button
                  className="xt-text-button"
                  aria-label={`${t("remove")} ${card.name}`}
                  onClick={() =>
                    void commit({
                      selected: a.selected === card.id ? "warm" : a.selected,
                      custom: a.custom.filter((p) => p.id !== card.id),
                    }).catch(() => {})
                  }
                >
                  {t("remove")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <h2>{t("customPalette")}</h2>
      <form
        data-dirty={!!name || undefined}
        className="xt-palette-editor"
        onSubmit={(e) => {
          e.preventDefault();
          const card: Palette = {
            id: editing ?? crypto.randomUUID(),
            name: name.trim(),
            paper,
            ink,
            accent,
          };
          if (!validPalette(card)) {
            notify("paletteError", true);
            return;
          }
          if (!editing && a.custom.length >= 12) {
            notify("paletteLimit", true);
            return;
          }
          void commit({
            selected: card.id,
            custom: editing
              ? a.custom.map((p) => (p.id === editing ? card : p))
              : [...a.custom, card],
          })
            .then(() => {
              setEditing(null);
              setName("");
            })
            .catch(() => {});
        }}
      >
        <label>
          {t("name")}
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="xt-color-inputs">
          <label>
            {t("background")}
            <input
              type="color"
              value={paper}
              onChange={(e) => setPaper(e.target.value)}
            />
          </label>
          <label>
            {t("textColor")}
            <input
              type="color"
              value={ink}
              onChange={(e) => setInk(e.target.value)}
            />
          </label>
          <label>
            {t("accent")}
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          </label>
        </div>
        <div className="xt-hub-action-row">
          <button className="xt-secondary" type="submit">
            {t("savePalette")}
          </button>
          {editing && (
            <button
              type="button"
              className="xt-text-button"
              onClick={() => {
                setEditing(null);
                setName("");
              }}
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
