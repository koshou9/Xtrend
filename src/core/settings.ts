import type {
  Settings,
  Language,
  Column,
  RankingField,
  PageScope,
} from "./types";
import { defaultFiltering, validateFiltering } from "./filtering";
import { validateAppearance } from "./palette";
import {
  defaultMonitoring,
  validateBark,
  validateMonitoring,
  validateNotifications,
} from "./monitor";

export const DEFAULT_TEMPLATE =
  "Write a thoughtful, concise reply in {{language}} to this post by {{author}}. Do not invent facts. Return only the reply.\n\n{{text}}";
export function defaultSettings(
  language = typeof navigator === "undefined" ? "en" : navigator.language,
): Settings {
  return {
    version: 1,
    language: language.startsWith("zh")
      ? "zh"
      : language.startsWith("ja")
        ? "ja"
        : "en",
    theme: "auto",
    rising: 1000,
    viral: 10000,
    badges: true,
    panel: true,
    images: true,
    position: null,
    columns: ["post", "views", "speed"],
    template: DEFAULT_TEMPLATE,
    rankingLimit: 10,
    hotOnly: false,
    minimumViews: 10000,
    rankingScopes: ["home", "list", "profile", "detail"],
    edgeHide: true,
    dock: null,
    rankingFields: {
      rank: true,
      tier: true,
      username: false,
      preview: true,
      views: true,
      speed: true,
    },
    filtering: defaultFiltering(),
    appearance: { selected: "warm", custom: [] },
    monitoring: defaultMonitoring(),
    bark: { enabled: false, server: "https://api.day.app", deviceKey: "" },
    notifications: validateNotifications(null),
    columnRules: {},
  };
}
export function validateSettings(input: unknown): Settings {
  const defaults = defaultSettings();
  if (!input || typeof input !== "object") return defaults;
  const v = input as Partial<Settings>;
  const rising =
    typeof v.rising === "number" && Number.isFinite(v.rising) && v.rising > 0
      ? v.rising
      : defaults.rising;
  const viral =
    typeof v.viral === "number" && Number.isFinite(v.viral) && v.viral > rising
      ? v.viral
      : Math.max(defaults.viral, rising * 10);
  const columns =
    Array.isArray(v.columns) &&
    v.columns.length === 3 &&
    new Set(v.columns).size === 3 &&
    v.columns.every((c) => ["post", "views", "speed"].includes(c))
      ? (v.columns as Column[])
      : defaults.columns;
  const rankingFields = { ...defaults.rankingFields };
  for (const key of Object.keys(rankingFields) as RankingField[])
    if (typeof v.rankingFields?.[key] === "boolean")
      rankingFields[key] = v.rankingFields[key];
  if (!Object.values(rankingFields).some(Boolean)) rankingFields.preview = true;
  const rankingScopes = Array.isArray(v.rankingScopes)
    ? [
        ...new Set(
          v.rankingScopes.filter((s): s is PageScope =>
            ["home", "list", "profile", "detail"].includes(s),
          ),
        ),
      ]
    : defaults.rankingScopes;
  return {
    ...defaults,
    rising,
    viral,
    columns,
    rankingFields,
    rankingScopes,
    filtering: validateFiltering(v.filtering),
    appearance: validateAppearance(v.appearance),
    monitoring: validateMonitoring(v.monitoring),
    bark: validateBark(v.bark),
    notifications: validateNotifications(v.notifications),
    columnRules:
      v.columnRules && typeof v.columnRules === "object"
        ? Object.fromEntries(
            Object.entries(v.columnRules)
              .slice(0, 32)
              .filter(
                ([key, value]) =>
                  /^pro-column-\d{1,2}$/.test(key) &&
                  value &&
                  Number.isInteger(value.rankingLimit) &&
                  value.rankingLimit >= 1 &&
                  value.rankingLimit <= 1000 &&
                  Number.isSafeInteger(value.minimumViews) &&
                  value.minimumViews >= 0,
              )
              .map(([key, value]) => [
                key,
                {
                  rankingLimit: value.rankingLimit,
                  minimumViews: value.minimumViews,
                  monitor: value.monitor !== false,
                },
              ]),
          )
        : {},
    rankingLimit:
      Number.isInteger(v.rankingLimit) &&
      v.rankingLimit! >= 1 &&
      v.rankingLimit! <= 1000
        ? v.rankingLimit!
        : defaults.rankingLimit,
    hotOnly: typeof v.hotOnly === "boolean" ? v.hotOnly : defaults.hotOnly,
    minimumViews:
      Number.isSafeInteger(v.minimumViews) && v.minimumViews! >= 0
        ? v.minimumViews!
        : defaults.minimumViews,
    edgeHide: typeof v.edgeHide === "boolean" ? v.edgeHide : defaults.edgeHide,
    dock:
      v.edgeHide !== false && (v.dock === "left" || v.dock === "right")
        ? v.dock
        : null,
    language: ["en", "zh", "ja"].includes(v.language ?? "")
      ? (v.language as Language)
      : defaults.language,
    theme: ["auto", "light", "dark"].includes(v.theme ?? "")
      ? v.theme!
      : "auto",
    badges: typeof v.badges === "boolean" ? v.badges : true,
    panel: typeof v.panel === "boolean" ? v.panel : true,
    images: typeof v.images === "boolean" ? v.images : true,
    position:
      v.position &&
      Number.isFinite(v.position.x) &&
      Number.isFinite(v.position.y)
        ? { x: v.position.x, y: v.position.y }
        : null,
    template:
      typeof v.template === "string" &&
      v.template.trim() &&
      v.template.length <= 12000
        ? v.template
        : defaults.template,
  };
}
export function fillTemplate(
  template: string,
  values: { author: string; text: string; language: string },
): string {
  return template.replace(
    /\{\{(author|text|language)\}\}/g,
    (_, key: keyof typeof values) => values[key],
  );
}
