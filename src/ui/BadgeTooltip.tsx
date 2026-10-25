import { useLayoutEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import type { Settings } from "../core/types";
import { usePalette } from "./palette";
import sheet from "./styles.css?inline";

export function BadgeTooltip({
  anchor,
  cardRef,
  settings,
  close,
  enter,
  leave,
  children,
}: {
  anchor: HTMLButtonElement;
  cardRef: RefObject<HTMLDivElement | null>;
  settings: Settings;
  close: () => void;
  enter: () => void;
  leave: () => void;
  children: ReactNode;
}) {
  const palette = usePalette(settings);
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.dataset.xtrend = "tooltip";
    element.style.cssText =
      "position:fixed;inset:0;z-index:2147483600;pointer-events:none;";
    const shadow = element.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = sheet;
    shadow.append(style);
    return element;
  });
  useLayoutEffect(() => {
    // Tweet containers clip and stack their descendants independently.
    document.documentElement.append(host);
    const card = cardRef.current!;
    const position = () => {
      const box = anchor.getBoundingClientRect();
      const { width, height } = card.getBoundingClientRect();
      const below = box.bottom + 8;
      card.style.left = `${Math.max(8, Math.min(box.right - width, innerWidth - width - 8))}px`;
      card.style.top = `${Math.max(8, Math.min(below + height <= innerHeight - 8 ? below : box.top - height - 8, innerHeight - height - 8))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(card);
    const dismiss = (event: Event) => {
      if (!event.composedPath().includes(card)) close();
    };
    const outside = (event: Event) => {
      if (!event.composedPath().includes(anchor)) dismiss(event);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("scroll", dismiss, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
      host.remove();
    };
  }, [host, anchor, close, cardRef]);
  return createPortal(
    <div
      className="xt-inline"
      data-theme={settings.theme}
      lang={settings.language}
      style={palette}
    >
      <div
        ref={cardRef}
        role="tooltip"
        className="xt-tooltip"
        onPointerEnter={enter}
        onPointerLeave={leave}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    host.shadowRoot!,
  );
}
