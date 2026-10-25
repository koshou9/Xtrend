import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { Settings } from "../core/types";
import { paletteVariables } from "../core/palette";
const subscribe = (fn: () => void) => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", fn);
  return () => media.removeEventListener("change", fn);
};
export function usePalette(settings: Settings): CSSProperties {
  const dark = useSyncExternalStore(
    subscribe,
    () => matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return paletteVariables(
    settings.appearance,
    settings.theme === "dark" || (settings.theme === "auto" && dark),
  ) as CSSProperties;
}
