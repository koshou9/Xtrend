import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";
import {
  X,
  ArrowUpRight,
  Flame,
  Circle,
  ShieldCheck,
  ArrowUp,
} from "lucide-react";
import type { Workspace } from "../content/model";
import { translator } from "./i18n";
export function useWorkspace(model: Workspace) {
  return useSyncExternalStore(model.subscribe, model.snapshot);
}
export function useWorkspaceSlice<T>(
  model: Workspace,
  select: (state: ReturnType<Workspace["snapshot"]>) => T,
  equal: (a: T, b: T) => boolean = Object.is,
): T {
  const cached = useRef<T>(select(model.snapshot()));
  return useSyncExternalStore(model.subscribe, () => {
    const next = select(model.snapshot());
    if (!equal(cached.current, next)) cached.current = next;
    return cached.current;
  });
}
export function useEntrance(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const animation = media.matches
      ? undefined
      : ref.current?.animate(
          [
            { transform: "translateY(10px) scale(.985)", opacity: 0 },
            { transform: "translateY(0) scale(1)", opacity: 1 },
          ],
          { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
    const onChange = () => {
      if (media.matches) animation?.cancel();
    };
    media.addEventListener("change", onChange);
    return () => {
      animation?.cancel();
      media.removeEventListener("change", onChange);
    };
  }, []);
}
export function TierIcon({ tier }: { tier: "normal" | "rising" | "viral" }) {
  const Icon = tier === "viral" ? Flame : tier === "rising" ? ArrowUp : Circle;
  return <Icon size={14} strokeWidth={2} aria-hidden="true" />;
}
export function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`xt-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
export function Wordmark() {
  return (
    <div className="xt-wordmark">
      <Mark />
      <strong>
        Xtrend<span>.</span>
      </strong>
    </div>
  );
}
export function LocalNote({ text }: { text: string }) {
  return (
    <span className="xt-local">
      <ShieldCheck size={13} aria-hidden="true" />
      {text}
    </span>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className="xt-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={13} />
    </a>
  );
}
export function Dialog({
  model,
  title,
  subtitle,
  children,
  wide = false,
  className = "",
  onRequestClose,
}: {
  model: Workspace;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  onRequestClose?: () => void;
}) {
  const state = useWorkspace(model),
    t = translator(state.settings.language);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef<() => void>(() => model.open(null));
  close.current = onRequestClose ?? (() => model.open(null));
  useEntrance(ref);
  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    root?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
      if (e.key !== "Tab") return;
      const targets = [
        ...(root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]',
        ) ?? []),
      ].filter((el) => el.getClientRects().length > 0);
      const active =
        root?.getRootNode() instanceof ShadowRoot
          ? (root.getRootNode() as ShadowRoot).activeElement
          : document.activeElement;
      const first = targets[0],
        last = targets.at(-1);
      if (!targets.length) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    root?.addEventListener("keydown", onKey);
    return () => {
      root?.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [model]);
  return (
    <div
      className="xt-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="xt-dialog-title"
        tabIndex={-1}
        ref={ref}
        className={`xt-dialog ${wide ? "wide" : ""} ${className}`}
      >
        <header className="xt-dialog-header">
          <div>
            <div className="xt-eyebrow">
              XTREND / <span>{t("local")}</span>
            </div>
            <h2 id="xt-dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="xt-icon"
            onClick={() => close.current()}
            aria-label={t("close")}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
