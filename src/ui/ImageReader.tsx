import { useEffect, useRef, useState } from "react";
import {
  AlignVerticalJustifyStart,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minus,
  Plus,
  X,
} from "lucide-react";
import type { Workspace } from "../content/model";
import { highResolutionCandidates, zoomAt } from "../core/images";
import { translator } from "./i18n";
import { useWorkspace } from "./shared";
type Transform = { x: number; y: number; scale: number };
export function ImageReader({
  model,
  photos,
  index: start,
}: {
  model: Workspace;
  photos: string[];
  index: number;
}) {
  const state = useWorkspace(model),
    t = translator(state.settings.language);
  const [index, setIndex] = useState(start),
    [long, setLong] = useState(false),
    [source, setSource] = useState(photos[start]!),
    [quality, setQuality] = useState("quality"),
    [failed, setFailed] = useState(false);
  const [transform, setTransform] = useState<Transform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const stage = useRef<HTMLDivElement>(null),
    image = useRef<HTMLImageElement>(null),
    pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const modal = useRef<HTMLDivElement>(null),
    dimensions = useRef({ width: 0, height: 0 });
  const fit = () => {
    const stageBox = stage.current?.getBoundingClientRect(),
      d = dimensions.current;
    if (!stageBox || !d.width || !d.height) return;
    const scale = Math.min(
      (stageBox.width - 40) / d.width,
      (stageBox.height - 40) / d.height,
      1,
    );
    setTransform({
      x: (stageBox.width - d.width * scale) / 2,
      y: (stageBox.height - d.height * scale) / 2,
      scale,
    });
  };
  useEffect(() => {
    let active = true;
    const loaders: HTMLImageElement[] = [];
    setSource(photos[index]!);
    setQuality("quality");
    setFailed(false);
    void (async () => {
      const candidates = highResolutionCandidates(photos[index]!);
      for (let i = 0; i < candidates.length && active; i++) {
        const candidate = candidates[i]!;
        const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
          const loader = new Image();
          loaders.push(loader);
          const timer = setTimeout(() => {
            loader.onload = null;
            loader.onerror = null;
            loader.src = "";
            resolve(null);
          }, 12000);
          loader.onload = () => {
            clearTimeout(timer);
            resolve(loader);
          };
          loader.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };
          loader.referrerPolicy = "no-referrer";
          loader.src = candidate;
        });
        if (loaded && active) {
          dimensions.current = {
            width: loaded.naturalWidth,
            height: loaded.naturalHeight,
          };
          setSource(candidate);
          setQuality(i === 0 && candidates.length > 1 ? "" : "fallback");
          fit();
          return;
        }
      }
      if (active) {
        setFailed(true);
        setQuality("");
      }
    })();
    return () => {
      active = false;
      loaders.forEach((loader) => {
        loader.onload = null;
        loader.onerror = null;
        loader.src = "";
      });
    };
  }, [index]);
  const zoom = (factor: number, point?: { x: number; y: number }) => {
    if (long) return;
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    setTransform((current) =>
      zoomAt(current, factor, point ?? { x: box.width / 2, y: box.height / 2 }),
    );
  };
  useEffect(() => {
    const previous = document.activeElement;
    modal.current?.focus();
    const handler = (event: KeyboardEvent) => {
      const target = event.composedPath()[0];
      if (
        target instanceof Element &&
        target.matches('input, textarea, [contenteditable="true"]')
      )
        return;
      if (
        [
          "Escape",
          "+",
          "=",
          "-",
          "0",
          "ArrowLeft",
          "ArrowRight",
          "Tab",
        ].includes(event.key)
      )
        event.stopImmediatePropagation();
      if (event.key === "Escape") model.open(null);
      if (["+", "=", "-", "0", "ArrowLeft", "ArrowRight"].includes(event.key))
        event.preventDefault();
      if (event.key === "+" || event.key === "=") zoom(1.2);
      if (event.key === "-") zoom(1 / 1.2);
      if (event.key === "0") {
        setLong(false);
        fit();
      }
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (event.key === "ArrowRight")
        setIndex((i) => Math.min(photos.length - 1, i + 1));
      if (event.key === "Tab") {
        const controls = [
          ...(modal.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? []),
        ];
        const root = modal.current?.getRootNode();
        const active =
          root instanceof ShadowRoot
            ? root.activeElement
            : document.activeElement;
        if (
          event.shiftKey &&
          (active === controls[0] || active === modal.current)
        ) {
          event.preventDefault();
          controls.at(-1)?.focus();
        } else if (!event.shiftKey && active === controls.at(-1)) {
          event.preventDefault();
          controls[0]?.focus();
        }
      }
    };
    const wheel = (event: WheelEvent) => {
      if (long) return;
      event.preventDefault();
      event.stopPropagation();
      const box = stage.current!.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.002), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    document.addEventListener("keydown", handler, true);
    stage.current?.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", fit);
    return () => {
      document.removeEventListener("keydown", handler, true);
      stage.current?.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", fit);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [long, index]);
  return (
    <div
      className="xt-image-reader"
      role="dialog"
      aria-modal="true"
      aria-label={t("photo")}
      tabIndex={-1}
      ref={modal}
    >
      <header>
        <span className="xt-image-title">
          Xtrend<span>/ {t("photo")}</span>
        </span>
        <div className="xt-image-tools">
          <span>
            {index + 1} / {photos.length}
          </span>
          <button
            className={long ? "active" : ""}
            onClick={() => {
              setLong(!long);
              if (long) fit();
            }}
            title={t("longImage")}
            aria-label={t("longImage")}
            aria-pressed={long}
          >
            <AlignVerticalJustifyStart size={19} />
          </button>
          <button disabled={long} onClick={() => zoom(1 / 1.2)} aria-label="−">
            <Minus size={19} />
          </button>
          <span className="xt-zoom-label">
            {Math.round(transform.scale * 100)}%
          </span>
          <button disabled={long} onClick={() => zoom(1.2)} aria-label="+">
            <Plus size={19} />
          </button>
          <button
            onClick={() => {
              setLong(false);
              fit();
            }}
            aria-label={t("fit")}
          >
            <Maximize size={18} />
          </button>
          <button onClick={() => model.open(null)} aria-label={t("close")}>
            <X size={21} />
          </button>
        </div>
      </header>
      <div
        className={`xt-image-stage ${long ? "long" : ""}`}
        ref={stage}
        onDoubleClick={() => {
          if (long) return;
          if (Math.abs(transform.scale - 1) < 0.01) fit();
          else {
            const box = stage.current!.getBoundingClientRect();
            setTransform({
              scale: 1,
              x: (box.width - dimensions.current.width) / 2,
              y: (box.height - dimensions.current.height) / 2,
            });
          }
        }}
        onPointerDown={(e) => {
          if (long || (e.target as Element).closest("button")) return;
          pan.current = {
            x: e.clientX,
            y: e.clientY,
            tx: transform.x,
            ty: transform.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (pan.current) {
            const p = pan.current;
            setTransform((current) => ({
              ...current,
              x: p.tx + e.clientX - p.x,
              y: p.ty + e.clientY - p.y,
            }));
          }
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
        onPointerCancel={() => {
          pan.current = null;
        }}
      >
        {!failed && (
          <img
            ref={image}
            src={source}
            alt={t("photo")}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              if (!dimensions.current.width) {
                dimensions.current = {
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                };
                fit();
              }
            }}
            style={
              long
                ? {}
                : {
                    width: dimensions.current.width || undefined,
                    height: dimensions.current.height || undefined,
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  }
            }
          />
        )}
        {failed && <p className="xt-image-error">{t("imageFailed")}</p>}
      </div>
      {photos.length > 1 && (
        <>
          <button
            className="xt-image-prev"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            aria-label={t("previous")}
          >
            <ChevronLeft />
          </button>
          <button
            className="xt-image-next"
            disabled={index === photos.length - 1}
            onClick={() => setIndex(index + 1)}
            aria-label={t("next")}
          >
            <ChevronRight />
          </button>
        </>
      )}
      <footer>
        <span>{t("imageHelp")}</span>
        {quality && (
          <span role="status">{t(quality as "quality" | "fallback")}</span>
        )}
      </footer>
    </div>
  );
}
