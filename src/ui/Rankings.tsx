import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Settings2,
  PanelRightClose,
  X,
  Eye,
  ArrowUpRight,
} from "lucide-react";
import {
  compact,
  burstIndex,
  staleReading,
  viewReadingAt,
} from "../core/metrics";
import { dockEdge, rankingApplies, selectRankings } from "../core/ranking";
import type { Column, RankedTweet } from "../core/types";
import type { Workspace } from "../content/model";
import { translator } from "./i18n";
import { Mark, TierIcon, useWorkspace, useWorkspaceSlice } from "./shared";
import { enhanceT } from "./enhance-i18n";
import { BadgeTooltip } from "./BadgeTooltip";

export function Badge({
  model,
  tweet,
}: {
  model: Workspace;
  tweet: RankedTweet;
}) {
  const settings = useWorkspaceSlice(model, (s) => s.settings),
    t = translator(settings.language);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const descriptionId = useId();
  const close = useCallback(() => setOpen(false), []);
  const enter = () => {
    clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      if (
        !anchor.current?.matches(":hover, :focus") &&
        !card.current?.matches(":hover")
      )
        close();
    }, 120);
  };
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const index = burstIndex(tweet, settings);
  const extra = enhanceT(settings.language),
    info = model.samples.info(tweet.id);
  const countKeys = [
    "views",
    "likes",
    "reposts",
    "replies",
    "bookmarks",
  ] as const;
  return (
    <span
      className="xt-badge-wrap"
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <button
        ref={anchor}
        className={`xt-badge ${tweet.tier}`}
        aria-label={`${t(tweet.tier)} ${compact(tweet.average)} / h`}
        aria-describedby={open ? descriptionId : undefined}
        onFocus={enter}
        onBlur={leave}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <TierIcon tier={tweet.tier} />
        <span>
          {compact(tweet.average)}
          <small>/h</small>
        </span>
        <span className="xt-tier-label">{t(tweet.tier)}</span>
      </button>
      {open && (
        <span hidden id={descriptionId}>
          {countKeys
            .map(
              (key) =>
                `${t(key)}: ${compact(tweet.counts[key], settings.language)}`,
            )
            .join(". ")}
          . {t("index")}: {compact(index)}. {t("indexHelp")}
        </span>
      )}
      {open && anchor.current && (
        <BadgeTooltip
          anchor={anchor.current}
          cardRef={card}
          settings={settings}
          close={close}
          enter={enter}
          leave={leave}
        >
          <strong>{t(tweet.tier)}</strong>
          <dl>
            {countKeys.map((key) => (
              <div key={key}>
                <dt>{t(key)}</dt>
                <dd>{compact(tweet.counts[key], settings.language)}</dd>
              </div>
            ))}
            <div>
              <dt>{t("index")}</dt>
              <dd>{compact(index)}</dd>
            </div>
          </dl>
          <p>{t("indexHelp")}</p>
          {tweet.createdAt &&
            viewReadingAt(tweet) - tweet.createdAt < 60_000 && (
              <p>{t("newPost")}</p>
            )}
          <small>
            {t("updated")}{" "}
            {new Date(viewReadingAt(tweet)).toLocaleTimeString(
              settings.language,
            )}
          </small>
          <p>{t("averageHelp")}</p>
          {tweet.growth !== null && info.interval && (
            <p>
              {t("measured")}: {compact(tweet.growth)} / h ·{" "}
              {new Date(info.interval.from).toLocaleTimeString(
                settings.language,
              )}{" "}
              –{" "}
              {new Date(info.interval.to).toLocaleTimeString(settings.language)}
            </p>
          )}
          {staleReading(tweet) && <p>{extra("stale")}</p>}
        </BadgeTooltip>
      )}
    </span>
  );
}
export function Rankings({
  model,
  demo = false,
}: {
  model: Workspace;
  demo?: boolean;
}) {
  const state = useWorkspace(model),
    t = translator(state.settings.language);
  const extra = enhanceT(state.settings.language);
  const [collapsed, setCollapsed] = useState(false),
    [peek, setPeek] = useState(false),
    [dragColumn, setDragColumn] = useState<Column | null>(null),
    [canBack, setCanBack] = useState(false),
    [dragActive, setDragActive] = useState(false);
  const ref = useRef<HTMLElement>(null),
    dragging = useRef<{
      pointerId: number;
      x: number;
      y: number;
      left: number;
      top: number;
      fromTab: boolean;
      wasPeek: boolean;
      last?: { x: number; y: number };
    } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    enterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    suppressClick = useRef(false),
    focusAfterOpen = useRef(false);
  const [position, setPosition] = useState(state.settings.position);
  const dock = state.settings.edgeHide ? state.settings.dock : null;
  useEffect(
    () => setPosition(state.settings.position),
    [state.settings.position],
  );
  useEffect(() => {
    setPeek(false);
  }, [dock]);
  useEffect(() => {
    if (peek && focusAfterOpen.current) {
      ref.current?.focus();
      focusAfterOpen.current = false;
    }
  }, [peek]);
  useEffect(
    () => () => {
      clearTimeout(leaveTimer.current);
      clearTimeout(enterTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (dock && !peek) model.clearSelection();
  }, [dock, peek, model]);
  useEffect(() => {
    if (!dock || !peek) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || dragging.current) return;
      const box = ref.current?.getBoundingClientRect(),
        root = ref.current?.getRootNode(),
        active =
          root instanceof ShadowRoot
            ? root.activeElement
            : document.activeElement;
      clearTimeout(leaveTimer.current);
      if (
        !box ||
        (event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom) ||
        (active && ref.current?.contains(active))
      )
        return;
      leaveTimer.current = setTimeout(() => setPeek(false), 180);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      clearTimeout(leaveTimer.current);
    };
  }, [dock, peek]);
  useEffect(() => {
    const resize = () =>
      setPosition((p) => ({
        x: Math.max(
          8,
          Math.min(
            p?.x ?? ref.current?.getBoundingClientRect().left ?? 8,
            window.innerWidth - Math.min(398, window.innerWidth - 16) - 8,
          ),
        ),
        y: Math.max(8, Math.min(p?.y ?? 102, window.innerHeight - 56)),
      }));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const panelWidth = Math.min(398, window.innerWidth - 16);
  const panelX =
    dock && !dragActive
      ? dock === "left"
        ? 8
        : window.innerWidth - panelWidth - 8
      : (position?.x ?? Math.max(8, window.innerWidth - panelWidth - 26));
  const panelY = Math.max(
    8,
    Math.min(position?.y ?? 102, window.innerHeight - 56),
  );
  const tucked = !!dock && !peek;
  const startDrag = (e: ReactPointerEvent<HTMLElement>, fromTab = false) => {
    if (
      e.button !== 0 ||
      !e.isPrimary ||
      (!fromTab && (e.target as Element).closest("button"))
    )
      return;
    clearTimeout(leaveTimer.current);
    clearTimeout(enterTimer.current);
    suppressClick.current = false;
    dragging.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: fromTab ? panelX : ref.current!.getBoundingClientRect().left,
      top: fromTab ? panelY : ref.current!.getBoundingClientRect().top,
      fromTab,
      wasPeek: peek,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragging.current;
    if (
      !d ||
      d.pointerId !== e.pointerId ||
      (!d.last && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 4)
    )
      return;
    const next = {
      x: Math.max(
        8,
        Math.min(d.left + e.clientX - d.x, window.innerWidth - panelWidth - 8),
      ),
      y: Math.max(
        8,
        Math.min(d.top + e.clientY - d.y, window.innerHeight - 56),
      ),
    };
    d.last = next;
    suppressClick.current = true;
    setDragActive(true);
    setPosition(next);
    if (d.fromTab) setPeek(true);
  };
  const cancelDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragging.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragging.current = null;
    setDragActive(false);
    setPosition(state.settings.position);
    if (d.fromTab) setPeek(d.wasPeek);
  };
  const savePosition = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragging.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragging.current = null;
    setDragActive(false);
    if (!d.last || !ref.current) return;
    const { x, y } = d.last,
      edge =
        !d.fromTab && state.settings.edgeHide
          ? dockEdge(x, ref.current.offsetWidth, window.innerWidth)
          : null;
    void model
      .update({ position: { x, y }, dock: edge })
      .catch(() => model.notify(t("saveFailed")));
    if (edge) {
      setPeek(false);
      setCollapsed(false);
    }
  };
  if (!rankingApplies(state.settings, state.scope)) return null;
  const reorder = (from: Column, to: Column) => {
    const columns = state.settings.columns.filter((c) => c !== from);
    columns.splice(state.settings.columns.indexOf(to), 0, from);
    void model.update({ columns }).catch(() => model.notify(t("saveFailed")));
  };
  const fields = state.settings.rankingFields,
    rows = selectRankings(state.ranked, model.rankingSettings());
  const columns = state.settings.columns.filter((c) =>
    c === "post"
      ? fields.rank || fields.tier || fields.username || fields.preview
      : fields[c],
  );
  const style: CSSProperties = {
    left: 0,
    top: 0,
    right: "auto",
    transform: `translate3d(${panelX + (tucked ? (dock === "left" ? -panelWidth - 8 : panelWidth + 8) : 0)}px, ${panelY}px, 0) scale(${tucked ? 0.985 : 1})`,
    transformOrigin: `${dock === "left" ? "left" : "right"} top`,
  };
  const dockPanel = () => {
    const box = ref.current!.getBoundingClientRect();
    const edge =
      box.left + box.width / 2 < window.innerWidth / 2 ? "left" : "right";
    clearTimeout(enterTimer.current);
    clearTimeout(leaveTimer.current);
    setPeek(false);
    void model
      .update({
        edgeHide: true,
        dock: edge,
        position: { x: box.left, y: box.top },
      })
      .catch(() => model.notify(t("saveFailed")));
  };
  if (collapsed && !dock)
    return (
      <button
        className="xt-collapsed"
        style={
          position ? { left: position.x, top: position.y, right: "auto" } : {}
        }
        onClick={() => setCollapsed(false)}
        aria-label={t("expand")}
      >
        <Mark small />
        <span>{t("hot")}</span>
        <ChevronRight size={16} />
      </button>
    );
  return (
    <>
      {dock && (
        <button
          className={`xt-edge-tab ${dock} ${peek ? "is-peeking" : ""}`}
          style={{
            top: Math.max(8, Math.min(panelY, window.innerHeight - 90)),
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse" && !dragging.current)
              enterTimer.current = setTimeout(() => setPeek(true), 220);
          }}
          onPointerLeave={() => clearTimeout(enterTimer.current)}
          onPointerDown={(e) => startDrag(e, true)}
          onPointerMove={moveDrag}
          onPointerUp={savePosition}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          onFocus={() => {
            if (dragging.current) return;
            focusAfterOpen.current = true;
            setPeek(true);
          }}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setPeek(true);
          }}
          aria-label={t("expand")}
          aria-expanded={peek}
          aria-hidden={peek}
          tabIndex={peek ? -1 : 0}
          title={`${t("expand")} · ${t("dragUndock")}`}
        >
          <Mark small />
          {dock === "left" ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>
      )}
      <aside
        className={`xt-rankings ${dock ? `docked dock-${dock}` : ""} ${tucked ? "is-tucked" : ""} ${dragActive ? "is-dragging" : ""}`}
        aria-hidden={tucked}
        inert={tucked}
        ref={ref}
        style={style}
        aria-label={t("hot")}
        tabIndex={-1}
        onPointerEnter={() => clearTimeout(leaveTimer.current)}
        onPointerLeave={(e) => {
          if (!dock || dragging.current || e.pointerType !== "mouse") return;
          leaveTimer.current = setTimeout(() => {
            const root = ref.current?.getRootNode(),
              active =
                root instanceof ShadowRoot
                  ? root.activeElement
                  : document.activeElement;
            if (!active || !ref.current?.contains(active)) setPeek(false);
          }, 180);
        }}
        onBlur={(e) => {
          if (
            dock &&
            !e.currentTarget.contains(e.relatedTarget as Node | null) &&
            !dragging.current
          )
            setPeek(false);
        }}
      >
        <header
          className="xt-panel-header"
          onPointerDown={(e) => startDrag(e)}
          onPointerMove={moveDrag}
          onPointerUp={savePosition}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
        >
          <GripVertical size={15} className="xt-grip" aria-label={t("move")} />
          <Mark small />
          <h2>{t("hot")}</h2>
          <div className="xt-panel-tools">
            <button
              className="xt-icon"
              onClick={() => {
                model.clearSelection();
                model.actions.back();
                setCanBack(false);
              }}
              disabled={!canBack}
              aria-label={t("back")}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              className="xt-icon"
              onClick={() => model.open({ type: "ranking-settings" })}
              aria-label={t("settings")}
            >
              <Settings2 size={16} />
            </button>
            <button
              className="xt-icon"
              onClick={dockPanel}
              aria-label={t("dockPanel")}
              title={t("dockPanel")}
            >
              <PanelRightClose size={16} />
            </button>
            <button
              className="xt-icon"
              onClick={() => (dock ? setPeek(false) : setCollapsed(true))}
              aria-label={t("collapse")}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="xt-panel-sub">
          <span>
            <i />
            {t("local")}
          </span>
          <span>
            {rows.length} {t("posts")}
          </span>
        </div>
        <p className="xt-metric-help">{demo ? t("demo") : t("metricHelp")}</p>
        {state.columns.length > 0 && (
          <label className="xt-column-select">
            {extra("columns")}
            <select
              aria-label={extra("columns")}
              value={state.column ?? ""}
              onChange={(e) => model.column(e.target.value || null)}
            >
              <option value="">{extra("allColumns")}</option>
              {state.columns.map((key, i) => (
                <option value={key} key={key}>
                  {extra("column")} {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="xt-table-head" role="row">
          {columns.map((column, i) => (
            <span
              key={column}
              draggable
              title={t("reorder")}
              onDragStart={(e) => {
                setDragColumn(column);
                e.dataTransfer.setData("text/plain", column);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragColumn) reorder(dragColumn, column);
                setDragColumn(null);
              }}
              className={`xt-col-${column}`}
            >
              <button
                className="xt-col-label"
                onKeyDown={(e) => {
                  if (
                    e.altKey &&
                    (e.key === "ArrowLeft" || e.key === "ArrowRight")
                  ) {
                    e.preventDefault();
                    const target =
                      columns[i + (e.key === "ArrowLeft" ? -1 : 1)];
                    if (target) reorder(column, target);
                  }
                }}
                title={`${t("reorder")} · Alt + ← / →`}
              >
                {t(column)}
              </button>
            </span>
          ))}
        </div>
        <div className="xt-ranked-list">
          {!rows.length && (
            <div className="xt-empty">
              <Mark />
              <h3>{state.settings.hotOnly ? t("noHotPosts") : t("noPosts")}</h3>
              <p>{t("noPostsHint")}</p>
              {state.settings.hotOnly && (
                <button
                  className="xt-text-button"
                  onClick={() =>
                    void model
                      .update({ hotOnly: false })
                      .catch(() => model.notify(t("saveFailed")))
                  }
                >
                  {t("showAllPosts")}
                </button>
              )}
            </div>
          )}
          {rows.map((tweet, index) => (
            <div key={tweet.id}>
              {(index === 0 ||
                (tweet.growth === null &&
                  rows[index - 1]?.growth !== null)) && (
                <div className="xt-ranking-group">
                  {tweet.growth === null ? t("average") : t("measured")}
                </div>
              )}
              <button
                className={`xt-ranked-row ${state.selectedTweetId === tweet.id ? "selected" : ""}`}
                data-tweet-id={tweet.id}
                aria-current={
                  state.selectedTweetId === tweet.id ? "true" : undefined
                }
                title={`${tweet.author.name}: ${tweet.text}`}
                aria-label={`${index + 1}. ${tweet.author.name}: ${tweet.text}`}
                onClick={() => {
                  if (model.locate(tweet)) setCanBack(true);
                  else model.notify(t("missingPost"));
                }}
              >
                {columns.map((column) =>
                  column === "post" ? (
                    <span className="xt-col-post" key={column}>
                      {fields.rank && (
                        <span className="xt-rank-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      )}
                      {fields.tier && (
                        <span className={`xt-rank-tier ${tweet.tier}`}>
                          <TierIcon tier={tweet.tier} />
                        </span>
                      )}
                      {(fields.username || fields.preview) && (
                        <span className="xt-row-copy">
                          {fields.username && (
                            <span className="xt-author">
                              {tweet.author.name}{" "}
                              <small>@{tweet.author.handle}</small>
                            </span>
                          )}
                          {fields.preview && (
                            <span className="xt-excerpt">
                              {tweet.text || `@${tweet.author.handle}`}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  ) : column === "views" ? (
                    <span className="xt-col-views xt-num" key={column}>
                      {compact(tweet.counts.views)}
                    </span>
                  ) : (
                    <span
                      className={`xt-col-speed xt-speed-reading xt-num ${tweet.tier}`}
                      key={column}
                      title={[
                        tweet.growth === null
                          ? t("averageHelp")
                          : t("measuredHelp"),
                        `${t("views")}: ${tweet.counts.views ?? "—"}`,
                        `${t("updated")}: ${new Date(viewReadingAt(tweet)).toLocaleString(state.settings.language)}`,
                        tweet.createdAt === null
                          ? ""
                          : `${t("published")}: ${new Date(tweet.createdAt).toLocaleString(state.settings.language)}`,
                        tweet.growth === null
                          ? ""
                          : (() => {
                              const interval = model.samples.info(
                                tweet.id,
                              ).interval;
                              return interval
                                ? `${extra("interval")}: ${new Date(interval.from).toLocaleTimeString(state.settings.language)} – ${new Date(interval.to).toLocaleTimeString(state.settings.language)}`
                                : "";
                            })(),
                        staleReading(tweet) ? extra("stale") : "",
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    >
                      <span>{compact(tweet.growth ?? tweet.average)}</span>
                      <small>
                        {staleReading(tweet)
                          ? t("staleValue")
                          : tweet.growth === null && tweet.average === null
                            ? t("unknownSpeed")
                            : new Date(viewReadingAt(tweet)).toLocaleTimeString(
                                state.settings.language,
                                { hour12: false },
                              )}
                      </small>
                    </span>
                  ),
                )}
              </button>
            </div>
          ))}
        </div>
        <footer className="xt-panel-footer">
          <button
            className="xt-text-button"
            onClick={() => model.open({ type: "filtered" })}
          >
            {extra("showFiltered")} · {state.filtered.length}
          </button>
          <button
            className="xt-text-button"
            onClick={() => model.open({ type: "batch" })}
          >
            {extra("batch")}
          </button>
          <button
            className="xt-text-button"
            onClick={() => model.open({ type: "settings" })}
          >
            Xtrend
            <ArrowUpRight size={12} />
          </button>
        </footer>
      </aside>
    </>
  );
}
