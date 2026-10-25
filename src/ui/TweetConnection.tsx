import { useLayoutEffect, useRef, useState } from "react";
import type { Workspace } from "../content/model";
import { ARTICLE, findArticle } from "../content/dom";
import { connectionPath, intersectBoxes } from "../core/connection";
import type { Box } from "../core/connection";
import { useWorkspace } from "./shared";

function visibleBox(element: HTMLElement): Box | null {
  let box = intersectBoxes(element.getBoundingClientRect(), {
    left: 0,
    top: 0,
    right: innerWidth,
    bottom: innerHeight,
  });
  for (
    let parent = element.parentElement;
    parent &&
    parent !== document.body &&
    parent !== document.documentElement &&
    box;
    parent = parent.parentElement
  ) {
    // Root scrolling is clipped by the viewport above, not the root's moving box.
    const style = getComputedStyle(parent),
      bounds = parent.getBoundingClientRect();
    const clipX = /auto|scroll|hidden|clip/.test(style.overflowX),
      clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
    if (clipX || clipY)
      box = intersectBoxes(box, {
        left: clipX ? bounds.left : box.left,
        right: clipX ? bounds.right : box.right,
        top: clipY ? bounds.top : box.top,
        bottom: clipY ? bounds.bottom : box.bottom,
      });
  }
  return box;
}
type Geometry = ReturnType<typeof connectionPath> & {
  outline: Box;
  width: number;
  height: number;
};
export function TweetConnection({ model }: { model: Workspace }) {
  const state = useWorkspace(model),
    id = state.selectedTweetId;
  const marker = useRef<HTMLSpanElement>(null),
    refresh = useRef<() => void>(() => {});
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  useLayoutEffect(() => {
    if (!id) {
      setGeometry(null);
      return;
    }
    setGeometry(null);
    const root = marker.current!.getRootNode() as Document | ShadowRoot;
    let frame = 0,
      observedTarget: HTMLElement | null = null,
      observedRow: HTMLElement | null = null;
    const sizes = new ResizeObserver(() => schedule());
    const update = () => {
      frame = 0;
      const target = findArticle(id),
        row = root.querySelector<HTMLElement>(
          `.xt-ranked-row[data-tweet-id="${CSS.escape(id)}"]`,
        );
      if (!target || !row) {
        model.clearSelection();
        setGeometry(null);
        return;
      }
      if (target !== observedTarget) {
        if (observedTarget) sizes.unobserve(observedTarget);
        sizes.observe(target);
        observedTarget = target;
      }
      if (row !== observedRow) {
        if (observedRow) sizes.unobserve(observedRow);
        sizes.observe(row);
        observedRow = row;
      }
      const targetBox = visibleBox(target),
        rowBox = visibleBox(row);
      const next =
        targetBox && rowBox && !model.snapshot().modal
          ? {
              ...connectionPath(targetBox, rowBox),
              outline: targetBox,
              width: innerWidth,
              height: innerHeight,
            }
          : null;
      setGeometry((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      if (
        panel
          ?.getAnimations()
          .some((animation) => animation.playState === "running")
      )
        schedule();
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    refresh.current = schedule;
    const changed = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            !(r.target instanceof Element) ||
            !r.target.closest("[data-xtrend-connection]"),
        )
      )
        schedule();
    });
    changed.observe(document.body, { childList: true, subtree: true });
    const app = marker.current!.closest(".xt-app");
    if (app) changed.observe(app, { childList: true, subtree: true });
    const panel = root.querySelector(".xt-rankings");
    if (panel)
      changed.observe(panel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    sizes.observe(document.body);
    const blankClick = (event: MouseEvent) => {
      const elements = event
        .composedPath()
        .filter((node): node is Element => node instanceof Element);
      if (
        elements.some((el) =>
          el.matches(
            `${ARTICLE}, .xt-rankings, .xt-backdrop, .xt-edge-tab, .xt-collapsed, .xt-toast, .xt-image-reader, a, button, input, textarea, select, label, [role="button"], [role="menu"], [contenteditable="true"]`,
          ),
        )
      )
        return;
      model.clearSelection();
    };
    window.addEventListener("scroll", schedule, true);
    root.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    document.addEventListener("load", schedule, true);
    document.addEventListener("click", blankClick, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      refresh.current = () => {};
      sizes.disconnect();
      changed.disconnect();
      window.removeEventListener("scroll", schedule, true);
      root.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("load", schedule, true);
      document.removeEventListener("click", blankClick, true);
    };
  }, [id, model]);
  useLayoutEffect(() => refresh.current(), [state.revision]);
  return (
    <>
      <span ref={marker} hidden data-xtrend-connection="true" />
      {id && geometry && (
        <svg
          data-xtrend-connection="true"
          data-tweet-id={id}
          className="xt-tweet-connection"
          aria-hidden="true"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        >
          <rect
            className="xt-linked-outline"
            x={geometry.outline.left + 1}
            y={geometry.outline.top + 1}
            width={Math.max(
              0,
              geometry.outline.right - geometry.outline.left - 2,
            )}
            height={Math.max(
              0,
              geometry.outline.bottom - geometry.outline.top - 2,
            )}
            rx="14"
          />
          <path className="xt-connection-line" d={geometry.path} />
          <circle
            className="xt-connection-end"
            cx={geometry.start.x}
            cy={geometry.start.y}
            r="5"
          />
          <circle
            className="xt-connection-end"
            cx={geometry.end.x}
            cy={geometry.end.y}
            r="5"
          />
        </svg>
      )}
    </>
  );
}
