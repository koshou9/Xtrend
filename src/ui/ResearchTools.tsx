import { useEffect, useId, useState } from "react";
import type { Settings, Tweet } from "../core/types";
import {
  readingPresets,
  type LibraryPort,
  type ReadingQuery,
  type SavedPost,
} from "../core/research";
import {
  filterReason,
  BUILTIN_RULES,
  ruleLabel,
  validateRule,
} from "../core/filtering";
import type { Workspace } from "../content/model";
import { researchT } from "./research-i18n";
import { translator } from "./i18n";
import { downloadText } from "./files";
import { Dialog, External } from "./shared";

export function ReadingSearch({
  language,
  query,
  change,
}: {
  language: Settings["language"];
  query: ReadingQuery;
  change(value: ReadingQuery): void;
}) {
  const t = researchT(language),
    id = useId();
  return (
    <details className="xt-reading-search">
      <summary>{t("search")}</summary>
      <div className="xt-research-fields">
        {(["text", "author", "since"] as const).map((key) => (
          <label key={key} htmlFor={`${id}-${key}`}>
            {t(key === "text" ? "search" : key)}
            <input
              id={`${id}-${key}`}
              aria-label={t(key === "text" ? "search" : key)}
              type={key === "since" ? "date" : "search"}
              maxLength={200}
              value={query[key]}
              onChange={(e) => change({ ...query, [key]: e.target.value })}
            />
          </label>
        ))}
        <button
          className="xt-text-button"
          onClick={() => change({ text: "", author: "", since: "" })}
        >
          {t("clear")}
        </button>
        <small>{t("loaded")}</small>
      </div>
    </details>
  );
}
export function ReadingPresets({
  settings,
  update,
}: {
  settings: Settings;
  update(patch: Partial<Settings>): Promise<void>;
}) {
  const t = researchT(settings.language),
    [error, setError] = useState(false);
  return (
    <details className="xt-reading-presets">
      <summary>{t("presets")}</summary>
      <p className="xt-field-note">{t("presetHelp")}</p>
      <div className="xt-hub-action-row">
        {(Object.keys(readingPresets) as (keyof typeof readingPresets)[]).map(
          (key) => (
            <button
              className="xt-secondary"
              key={key}
              onClick={() => {
                setError(false);
                void update(readingPresets[key]).catch(() => setError(true));
              }}
            >
              {t(key)}
            </button>
          ),
        )}
      </div>
      {error && <p role="alert">{t("error")}</p>}
    </details>
  );
}
export function SavedPosts({
  library,
  language,
  tweet,
}: {
  library: LibraryPort;
  language: Settings["language"];
  tweet?: Tweet;
}) {
  const t = researchT(language),
    common = translator(language),
    id = useId();
  const [entries, setEntries] = useState<SavedPost[]>([]),
    [current, setCurrent] = useState<SavedPost | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    let active = true,
      revision = 0,
      initialized = false;
    const load = async () => {
      const request = ++revision;
      try {
        const data = await library.list();
        if (!active || request !== revision) return;
        setEntries(data);
        setReady(true);
        if (!initialized && tweet)
          setCurrent(
            data.find((e) => e.tweet.id === tweet.id) ?? {
              tweet,
              tags: [],
              note: "",
              savedAt: Date.now(),
            },
          );
        initialized = true;
      } catch {
        if (active) setError(t("error"));
      }
    };
    void load();
    const stop = library.watch?.(() => void load());
    return () => {
      active = false;
      stop?.();
    };
  }, [library, tweet?.id]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setEntries(await library.list());
      setCurrent(null);
    } catch (e) {
      setError(
        t(
          e instanceof Error && e.message === "libraryFull"
            ? "libraryFull"
            : "error",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const filtered = entries.filter((e) =>
    `${e.tweet.text} ${e.tweet.author.name} ${e.tweet.author.handle} ${e.tags.join(" ")} ${e.note}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="xt-reading-tools xt-saved-posts">
      <p>{t("libraryHelp")}</p>
      <label htmlFor={`${id}-search`}>
        {t("search")}
        <input
          id={`${id}-search`}
          type="search"
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button
        className="xt-secondary"
        disabled={!entries.length || busy}
        onClick={() =>
          downloadText(
            "xtrend-saved-posts.json",
            JSON.stringify(
              { format: "xtrend-saved-posts", version: 1, entries },
              null,
              2,
            ),
          )
        }
      >
        {t("exportLibrary")}
      </button>
      {error && (
        <p role="alert" className="xt-error">
          {error}
        </p>
      )}
      {current && (
        <form
          data-dirty={
            JSON.stringify([current.note, current.tags]) !==
              JSON.stringify([
                entries.find((e) => e.tweet.id === current.tweet.id)?.note ??
                  "",
                entries.find((e) => e.tweet.id === current.tweet.id)?.tags ??
                  [],
              ]) || undefined
          }
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => library.save({ ...current, savedAt: Date.now() }));
          }}
        >
          <strong>@{current.tweet.author.handle}</strong>
          <p>{current.tweet.text}</p>
          <label htmlFor={`${id}-tags`}>
            {t("tags")}
            <input
              id={`${id}-tags`}
              aria-label={t("tags")}
              maxLength={309}
              value={current.tags.join(", ")}
              onChange={(e) =>
                setCurrent({
                  ...current,
                  tags: e.target.value.split(/[,，]/).map((v) => v.trim()),
                })
              }
            />
          </label>
          <label htmlFor={`${id}-note`}>
            {t("note")}
            <textarea
              id={`${id}-note`}
              aria-label={t("note")}
              maxLength={2000}
              rows={3}
              value={current.note}
              onChange={(e) => setCurrent({ ...current, note: e.target.value })}
            />
          </label>
          <div className="xt-hub-action-row">
            <button
              className="xt-primary"
              disabled={
                busy ||
                !ready ||
                current.tags.length > 10 ||
                current.tags.some((v) => v.length > 30)
              }
            >
              {t("save")}
            </button>
            <button
              type="button"
              className="xt-secondary"
              disabled={busy}
              onClick={() => setCurrent(null)}
            >
              {common("cancel")}
            </button>
          </div>
        </form>
      )}
      <ul className="xt-saved-list">
        {filtered.map((entry) => (
          <li key={entry.tweet.id}>
            <strong>{entry.tweet.author.name}</strong>
            <External href={entry.tweet.url}>{common("openOriginal")}</External>
            <p>{entry.tweet.text.slice(0, 280)}</p>
            <small>{entry.tags.join(" · ")}</small>
            <p>{entry.note}</p>
            <div className="xt-hub-action-row">
              <button
                className="xt-secondary"
                disabled={busy}
                onClick={() => setCurrent(entry)}
              >
                {t("note")}
              </button>
              <button
                className="xt-text-button"
                disabled={busy}
                onClick={() => void run(() => library.remove(entry.tweet.id))}
              >
                {t("remove")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {ready && !filtered.length && <p>{t("empty")}</p>}
    </div>
  );
}
export function SavedDialog({
  model,
  tweet,
}: {
  model: Workspace;
  tweet?: Tweet;
}) {
  return (
    <Dialog
      model={model}
      title={researchT(model.snapshot().settings.language)("library")}
    >
      <SavedPosts
        library={model.library}
        language={model.snapshot().settings.language}
        tweet={tweet}
      />
    </Dialog>
  );
}
export function RulePreview({
  settings,
  label,
  terms,
  match,
  severity,
  editing,
}: {
  settings: Settings;
  label: string;
  terms: string;
  match: "any" | "all";
  severity: 1 | 2 | 3;
  editing: string | null;
}) {
  const t = researchT(settings.language),
    id = useId(),
    [text, setText] = useState(""),
    [handle, setHandle] = useState("");
  const draft = validateRule(
    {
      id: "preview",
      label: label || t("preview"),
      terms: terms.split("\n").filter((v) => v.trim()),
      match,
      severity,
    },
    "custom",
  );
  const filtering = {
    ...settings.filtering,
    enabled: true,
    customRules: [
      ...settings.filtering.customRules.filter((r) => r.id !== editing),
      ...(draft ? [draft] : []),
    ],
  };
  const reason = filterReason(
    { text, author: { name: handle, handle, id: "0" } } as Tweet,
    filtering,
  );
  const rule = [
    ...BUILTIN_RULES,
    ...filtering.importedRules,
    ...filtering.customRules,
  ].find((r) => r.id === reason);
  return (
    <details className="xt-rule-preview">
      <summary>{t("preview")}</summary>
      <p>{t("previewHelp")}</p>
      <label htmlFor={`${id}-handle`}>
        {t("handle")}
        <input
          id={`${id}-handle`}
          aria-label={t("handle")}
          maxLength={50}
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
        />
      </label>
      <label htmlFor={`${id}-sample`}>
        {t("sample")}
        <textarea
          id={`${id}-sample`}
          aria-label={t("sample")}
          maxLength={10000}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {text && (
        <p role="status">
          {reason ? t("hidden") : t("visible")}
          {reason && ` · ${rule ? ruleLabel(rule, settings.language) : reason}`}
        </p>
      )}
    </details>
  );
}
