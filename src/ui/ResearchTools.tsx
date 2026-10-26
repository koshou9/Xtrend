import { useEffect, useId, useRef, useState } from "react";
import { Bookmark, Download, Upload, Pencil, Trash2 } from "lucide-react";
import type { Settings, Tweet } from "../core/types";
import {
  readingPresets,
  readSavedPosts,
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
    [tags, setTags] = useState(""),
    [baseline, setBaseline] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<
      | ""
      | "error"
      | "libraryFull"
      | "invalidLibrary"
      | "finishEdit"
      | "tagsInvalid"
    >(""),
    [message, setMessage] = useState(false),
    [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [removing, setRemoving] = useState<string | null>(null),
    [discard, setDiscard] = useState(false),
    [imported, setImported] = useState<SavedPost[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    tagInput = useRef<HTMLInputElement>(null);
  const parsedTags = [
    ...new Set(
      tags
        .split(/[,，]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  const dirty =
    !!current && JSON.stringify([current.note, parsedTags]) !== baseline;
  const beginEdit = (entry: SavedPost | null) => {
    setCurrent(entry);
    setTags(entry?.tags.join(", ") ?? "");
    setBaseline(JSON.stringify([entry?.note ?? "", entry?.tags ?? []]));
    setDiscard(false);
    setError("");
    setMessage(false);
  };
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
          beginEdit(
            data.find((e) => e.tweet.id === tweet.id) ?? {
              tweet,
              tags: [],
              note: "",
              savedAt: Date.now(),
            },
          );
        initialized = true;
      } catch {
        if (active) setError("error");
      }
    };
    void load();
    const stop = library.watch?.(() => void load());
    return () => {
      active = false;
      stop?.();
    };
  }, [library, tweet?.id]);
  useEffect(() => {
    if (current) tagInput.current?.focus();
  }, [current?.tweet.id]);
  const run = async (work: () => Promise<void>, closeEditor = false) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage(false);
    try {
      await work();
      setEntries(await library.list());
      if (closeEditor) beginEdit(null);
      setMessage(true);
      return true;
    } catch (e) {
      setError(
        e instanceof Error && e.message === "libraryFull"
          ? "libraryFull"
          : e instanceof Error && e.message === "invalidLibrary"
            ? "invalidLibrary"
            : "error",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const edit = (entry: SavedPost) => {
    if (dirty && current?.tweet.id !== entry.tweet.id) {
      setError("finishEdit");
      return;
    }
    if (current?.tweet.id !== entry.tweet.id) beginEdit(entry);
    else tagInput.current?.focus();
  };
  const queryText = query.trim().toLocaleLowerCase();
  const filtered = entries
    .filter(
      (e) =>
        (!tag || e.tags.includes(tag)) &&
        `${e.tweet.text} ${e.tweet.author.name} ${e.tweet.author.handle} ${e.tags.join(" ")} ${e.note}`
          .toLocaleLowerCase()
          .includes(queryText),
    )
    .sort((a, b) => b.savedAt - a.savedAt);
  const tagOptions = [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) =>
    a.localeCompare(b, language),
  );
  return (
    <div className="xt-reading-tools xt-saved-posts">
      <div className="xt-library-meta">
        <strong>
          {t("savedCount")} {entries.length} / 100
        </strong>
        <span>
          {t("shownCount")} {filtered.length}
        </span>
      </div>
      <div className="xt-library-toolbar">
        <label htmlFor={`${id}-search`}>
          {t("searchLibrary")}
          <input
            id={`${id}-search`}
            type="search"
            name="saved-search"
            value={query}
            placeholder={t("searchLibraryHint")}
            maxLength={200}
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label htmlFor={`${id}-filter`}>
          {t("filterTag")}
          <select
            id={`${id}-filter`}
            aria-label={t("filterTag")}
            name="saved-tag-filter"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">{t("allTags")}</option>
            {[...new Set([...tagOptions, ...(tag ? [tag] : [])])].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="xt-library-actions">
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
          <Download size={14} />
          {t("exportLibrary")}
        </button>
        {library.restore && (
          <>
            <button
              className="xt-secondary"
              disabled={!ready || busy}
              onClick={() => {
                if (dirty) {
                  setError("finishEdit");
                  return;
                }
                fileInput.current?.click();
              }}
            >
              <Upload size={14} />
              {t("importLibrary")}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="xt-visually-hidden"
              tabIndex={-1}
              aria-label={t("importLibrary")}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError("");
                setMessage(false);
                setImported(null);
                try {
                  if (file.size > 3 * 1024 * 1024 || dirty)
                    throw new Error("invalidLibrary");
                  setImported(readSavedPosts(await file.text()));
                } catch {
                  setError("invalidLibrary");
                }
              }}
            />
          </>
        )}
        {(query || tag) && (
          <button
            className="xt-text-button"
            onClick={() => {
              setQuery("");
              setTag("");
            }}
          >
            {t("clear")}
          </button>
        )}
      </div>
      {message && (
        <p className="xt-status" role="status">
          {t("saved")}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="xt-error" role="alert">
          {t(error)}
        </p>
      )}
      {imported && (
        <section
          className="xt-library-confirm"
          role="group"
          aria-label={t("importLibrary")}
        >
          <p>{t("importHelp")}</p>
          <strong>
            {
              imported.filter(
                (e) => !entries.some((saved) => saved.tweet.id === e.tweet.id),
              ).length
            }{" "}
            / {imported.length}
          </strong>
          <div className="xt-library-actions">
            <button
              className="xt-primary"
              disabled={busy}
              onClick={async () => {
                if (dirty) {
                  setError("finishEdit");
                  return;
                }
                if (await run(() => library.restore!(imported)))
                  setImported(null);
              }}
            >
              {t("confirmImport")}
            </button>
            <button
              className="xt-secondary"
              disabled={busy}
              onClick={() => setImported(null)}
            >
              {common("cancel")}
            </button>
          </div>
        </section>
      )}
      {current && (
        <form
          className="xt-library-editor"
          data-dirty={dirty || undefined}
          aria-label={
            entries.some((e) => e.tweet.id === current.tweet.id)
              ? t("editTitle")
              : t("newTitle")
          }
          onSubmit={(e) => {
            e.preventDefault();
            if (
              parsedTags.length > 10 ||
              parsedTags.some((value) => value.length > 30)
            ) {
              setError("tagsInvalid");
              tagInput.current?.focus();
              return;
            }
            void run(
              () => library.save({ ...current, tags: parsedTags }),
              true,
            );
          }}
        >
          <div className="xt-saved-entry-head">
            <div>
              <h3>
                {entries.some((e) => e.tweet.id === current.tweet.id)
                  ? t("editTitle")
                  : t("newTitle")}
              </h3>
              <strong>{current.tweet.author.name}</strong>
              <span>@{current.tweet.author.handle}</span>
            </div>
            <External href={current.tweet.url}>
              {common("openOriginal")}
            </External>
          </div>
          <p className="xt-saved-excerpt">{current.tweet.text.slice(0, 200)}</p>
          {current.tweet.text.length > 200 && (
            <details className="xt-saved-full">
              <summary>{t("fullText")}</summary>
              <p>{current.tweet.text}</p>
            </details>
          )}
          <label htmlFor={`${id}-tags`}>
            {t("tags")}
            <input
              ref={tagInput}
              id={`${id}-tags`}
              aria-label={t("tags")}
              name="tags"
              maxLength={400}
              value={tags}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => {
                setTags(e.target.value);
                setDiscard(false);
                setError("");
              }}
            />
          </label>
          <label htmlFor={`${id}-note`}>
            {t("note")}
            <textarea
              id={`${id}-note`}
              aria-label={t("note")}
              name="note"
              maxLength={2000}
              rows={3}
              value={current.note}
              onChange={(e) => {
                setCurrent({ ...current, note: e.target.value });
                setDiscard(false);
                setError("");
              }}
            />
            <small>{current.note.length} / 2000</small>
          </label>
          {discard && (
            <div
              className="xt-library-confirm"
              role="group"
              aria-label={t("discardEdit")}
            >
              <p>{t("discardEdit")}</p>
              <div className="xt-library-actions">
                <button
                  type="button"
                  className="xt-secondary"
                  onClick={() => setDiscard(false)}
                >
                  {t("keepEditing")}
                </button>
                <button
                  type="button"
                  className="xt-text-button"
                  onClick={() => beginEdit(null)}
                >
                  {t("discard")}
                </button>
              </div>
            </div>
          )}
          <div className="xt-library-editor-actions">
            <button
              className="xt-primary"
              type="submit"
              disabled={busy || !ready}
            >
              {t("save")}
            </button>
            <button
              type="button"
              className="xt-secondary"
              disabled={busy}
              onClick={() => (dirty ? setDiscard(true) : beginEdit(null))}
            >
              {common("cancel")}
            </button>
          </div>
        </form>
      )}
      <ul className="xt-saved-list">
        {filtered.map((entry) => (
          <li key={entry.tweet.id} data-saved-id={entry.tweet.id}>
            <div className="xt-saved-entry-head">
              <div>
                <strong>{entry.tweet.author.name}</strong>
                <span>@{entry.tweet.author.handle}</span>
                <time dateTime={new Date(entry.savedAt).toISOString()}>
                  {t("savedAt")}{" "}
                  {new Date(entry.savedAt).toLocaleString(language)}
                </time>
              </div>
              <External href={entry.tweet.url}>
                {common("openOriginal")}
              </External>
            </div>
            <p className="xt-saved-excerpt">{entry.tweet.text.slice(0, 280)}</p>
            {entry.tweet.text.length > 280 && (
              <details className="xt-saved-full">
                <summary>{t("fullText")}</summary>
                <p>{entry.tweet.text}</p>
              </details>
            )}
            {!!entry.tags.length && (
              <div className="xt-saved-tags">
                {entry.tags.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={tag === value}
                    onClick={() => setTag(tag === value ? "" : value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
            {entry.note && <p className="xt-saved-note">{entry.note}</p>}
            {removing === entry.tweet.id ? (
              <div
                className="xt-library-confirm"
                role="group"
                aria-label={t("removeConfirm")}
              >
                <p>{t("removeConfirm")}</p>
                <div className="xt-library-actions">
                  <button
                    className="xt-secondary"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                  >
                    {common("cancel")}
                  </button>
                  <button
                    className="xt-primary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await run(
                          () => library.remove(entry.tweet.id),
                          current?.tweet.id === entry.tweet.id,
                        )
                      )
                        setRemoving(null);
                    }}
                  >
                    {t("confirmRemove")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="xt-library-actions">
                <button
                  className="xt-secondary"
                  disabled={busy}
                  onClick={() => edit(entry)}
                >
                  <Pencil size={14} />
                  {t("editSaved")}
                </button>
                <button
                  className="xt-text-button"
                  disabled={busy}
                  onClick={() => setRemoving(entry.tweet.id)}
                >
                  <Trash2 size={14} />
                  {t("remove")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {ready && !filtered.length && (
        <div className="xt-library-empty">
          <Bookmark size={28} />
          <strong>{entries.length ? t("empty") : t("libraryEmpty")}</strong>
          {!entries.length && <p>{t("libraryEmptyHelp")}</p>}
        </div>
      )}
      {!ready && <p role="status">{common("loading")}</p>}
      <details className="xt-library-help">
        <summary>{common("local")}</summary>
        <p>{t("libraryHelp")}</p>
      </details>
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
  const editor = useRef<HTMLDivElement>(null),
    [closing, setClosing] = useState(false);
  const language = model.snapshot().settings.language,
    t = researchT(language);
  const resume = () => {
    setClosing(false);
    editor.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  };
  return (
    <Dialog
      model={model}
      title={t("library")}
      className="xt-saved-dialog"
      onRequestClose={() => {
        if (closing) resume();
        else if (editor.current?.querySelector('[data-dirty="true"]'))
          setClosing(true);
        else model.open(null);
      }}
    >
      {closing && (
        <section
          className="xt-library-confirm xt-library-close-confirm"
          role="alert"
          aria-label={t("discardEdit")}
        >
          <p>{t("discardEdit")}</p>
          <div className="xt-library-actions">
            <button autoFocus className="xt-secondary" onClick={resume}>
              {t("keepEditing")}
            </button>
            <button className="xt-primary" onClick={() => model.open(null)}>
              {t("discard")}
            </button>
          </div>
        </section>
      )}
      <div className="xt-saved-dialog-body" ref={editor}>
        <SavedPosts library={model.library} language={language} tweet={tweet} />
      </div>
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
