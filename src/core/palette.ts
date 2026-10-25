import type { AppearanceSettings, Palette } from "./features";
import type { Language } from "./types";
export function paletteLabel(card: Palette, language: Language) {
  const labels: Record<string, [string, string]> = {
    warm: ["陶土", "テラコッタ"],
    forest: ["林绿", "フォレスト"],
    blue: ["墨蓝", "インクブルー"],
    graphite: ["石墨", "グラファイト"],
  };
  return language === "en" || !labels[card.id]
    ? card.name
    : labels[card.id]![language === "zh" ? 0 : 1];
}
export const PALETTES: Palette[] = [
  {
    id: "warm",
    name: "Terracotta",
    paper: "#fffdf9",
    ink: "#292923",
    accent: "#b74723",
  },
  {
    id: "forest",
    name: "Forest",
    paper: "#f8fbf7",
    ink: "#25382d",
    accent: "#326348",
  },
  {
    id: "blue",
    name: "Ink blue",
    paper: "#f7f9ff",
    ink: "#242f48",
    accent: "#3158a1",
  },
  {
    id: "graphite",
    name: "Graphite",
    paper: "#fafafa",
    ink: "#292929",
    accent: "#555555",
  },
];
const hex = (value: unknown): value is string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const rgb = (value: string) =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
export function mix(a: string, b: string, amount: number): string {
  const aa = rgb(a),
    bb = rgb(b);
  return (
    "#" +
    aa
      .map((v, i) =>
        Math.round(v * (1 - amount) + bb[i]! * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function luminance(value: string) {
  return rgb(value)
    .map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i]!, 0);
}
export function contrast(a: string, b: string) {
  const aa = luminance(a),
    bb = luminance(b);
  return (Math.max(aa, bb) + 0.05) / (Math.min(aa, bb) + 0.05);
}
export function validPalette(value: unknown): value is Palette {
  if (!value || typeof value !== "object") return false;
  const v = value as Palette;
  return (
    typeof v.id === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(v.id) &&
    typeof v.name === "string" &&
    !!v.name.trim() &&
    v.name.length <= 40 &&
    hex(v.paper) &&
    hex(v.ink) &&
    hex(v.accent) &&
    contrast(v.paper, v.ink) >= 4.5 &&
    contrast(v.paper, v.accent) >= 4.5
  );
}
export function validateAppearance(value: unknown): AppearanceSettings {
  const v =
    value && typeof value === "object"
      ? (value as Partial<AppearanceSettings>)
      : {};
  const custom = Array.isArray(v.custom)
    ? v.custom
        .filter(validPalette)
        .filter((p) => !PALETTES.some((b) => b.id === p.id))
        .slice(0, 12)
        .map(({ id, name, paper, ink, accent }) => ({
          id,
          name: name.trim(),
          paper,
          ink,
          accent,
        }))
    : [];
  return {
    selected: [...PALETTES, ...custom].some((p) => p.id === v.selected)
      ? v.selected!
      : "warm",
    custom: [...new Map(custom.map((p) => [p.id, p])).values()],
  };
}
function readable(text: string, paper: string, towards: string) {
  for (let i = 0; i <= 20; i++) {
    const value = mix(text, towards, i / 20);
    if (contrast(value, paper) >= 4.5) return value;
  }
  return towards;
}
export function paletteVariables(
  appearance: AppearanceSettings,
  dark: boolean,
): Record<string, string> {
  const p =
    [...PALETTES, ...appearance.custom].find(
      (p) => p.id === appearance.selected,
    ) ?? PALETTES[0]!;
  const paper = dark ? mix(p.ink, "#101410", 0.75) : p.paper,
    ink = dark ? mix(p.paper, "#ffffff", 0.55) : p.ink;
  const accent = dark ? readable(p.accent, paper, "#ffffff") : p.accent;
  return {
    "--paper": paper,
    "--paper-2": mix(paper, ink, 0.035),
    "--paper-3": mix(paper, ink, 0.08),
    "--ink": ink,
    "--muted": readable(mix(ink, paper, 0.45), paper, ink),
    "--line": mix(paper, ink, 0.15),
    "--accent": accent,
    "--accent-2": mix(paper, accent, 0.09),
    "--green": readable("#63795e", paper, ink),
  };
}
