import { researchT } from "./research-i18n";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Copy, PenLine, Sparkles } from "lucide-react";
import { commentPrompt, commentOptions } from "../core/ai";
import { aiT, templateName } from "./ai-i18n";
import type { Tweet } from "../core/types";
import type { Workspace } from "../content/model";
import { copyText } from "../content/dom";
import { translator, errorText } from "./i18n";
import { Dialog, useWorkspace } from "./shared";
export function GrokAssistant({
  model,
  tweet,
}: {
  model: Workspace;
  tweet: Tweet;
}) {
  const state = useWorkspace(model),
    t = translator(state.settings.language),
    a = aiT(state.settings.language),
    ai = state.settings.ai;
  const [text, setText] = useState(tweet.text),
    [prompt, setPrompt] = useState(""),
    [draft, setDraft] = useState(""),
    [temporary, setTemporary] = useState(ai.temporary),
    [selected, setSelected] = useState(ai.selected),
    [options, setOptions] = useState<string[]>([]),
    [option, setOption] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setPrompt(
      commentPrompt(
        ai.templates.find((x) => x.id === selected)?.prompt ??
          ai.templates[0]!.prompt,
        {
          author: `${tweet.author.name} (@${tweet.author.handle})`,
          text,
          language: state.settings.language,
        },
        ai.count,
      ),
    );
  }, [text, ai, selected, state.settings.language]);
  useEffect(() => () => controller.current?.abort(), []);
  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const reply = await model.transport.request(
        ai.provider === "grok"
          ? { type: "grok", prompt, temporary }
          : { type: "ai", prompt },
        abort.signal,
      );
      if ("text" in reply && !abort.signal.aborted) {
        const values = commentOptions(reply.text);
        setOptions(values);
        setOption(0);
        setDraft(values[0] ?? "");
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setError(
        [
          "invalidAiConfig",
          "missingAiKey",
          "permissionDenied",
          "requestFailed",
        ].includes(code)
          ? a(code as "invalidAiConfig")
          : errorText(error, t),
      );
    } finally {
      if (controller.current === abort) {
        setBusy(false);
        controller.current = null;
      }
    }
  };
  return (
    <Dialog
      model={model}
      title={a("service")}
      subtitle={ai.provider === "grok" ? t("grokHint") : ai[ai.provider].model}
    >
      <div className="xt-grok-form">
        <label>
          {t("input")}
          <textarea
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            maxLength={15000}
          />
        </label>
        <label>
          {a("templates")}
          <select
            value={selected}
            aria-label={a("templates")}
            disabled={busy}
            onChange={(e) => setSelected(e.target.value)}
          >
            {ai.templates.map((item) => (
              <option key={item.id} value={item.id}>
                {templateName(item, state.settings.language)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("prompt")}
          <textarea
            value={prompt}
            rows={5}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={20000}
          />
        </label>
        {ai.provider === "grok" && (
          <label className="xt-toggle-row">
            <span>{t("temporary")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={temporary}
              disabled={busy}
              onChange={(e) => setTemporary(e.target.checked)}
            />
            <span className="xt-toggle" aria-hidden="true" />
          </label>
        )}
        {temporary && ai.provider === "grok" && (
          <p className="xt-field-note">{a("temporaryHint")}</p>
        )}
        <div className="xt-notice">
          <p>
            {ai.provider === "grok"
              ? t("grokPrivacy")
              : ai[ai.provider].endpoint}
          </p>
        </div>
        {ai.provider === "grok" && !state.capabilities.grok && (
          <div className="xt-connection-help">
            <p>{t("learnGrok")}</p>
            <a className="xt-link" href="https://x.com/i/grok">
              {t("openGrok")}
              <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        <div className="xt-generate-row">
          <button
            className="xt-primary"
            disabled={
              busy ||
              !prompt.trim() ||
              prompt.length > 20000 ||
              (ai.provider === "grok" && !state.capabilities.grok)
            }
            onClick={(e) => {
              // Host-page scripts can click open shadow roots; require a real user event.
              if (e.isTrusted) void generate();
            }}
          >
            <Sparkles size={16} />
            {busy ? t("loading") : draft ? t("regenerate") : t("generate")}
          </button>
          {busy && (
            <button
              className="xt-secondary"
              onClick={() => controller.current?.abort()}
            >
              {t("cancel")}
            </button>
          )}
        </div>
        {error && (
          <p className="xt-error" role="alert">
            {error}
            <span className="xt-field-note">
              {" "}
              {researchT(state.settings.language)("refreshHelp")}
            </span>
          </p>
        )}
        {options.length > 0 && (
          <label>
            {a("options")}
            <select
              value={option}
              aria-label={a("options")}
              onChange={(e) => {
                setOptions((values) =>
                  values.map((value, index) =>
                    index === option ? draft : value,
                  ),
                );
                const index = Number(e.target.value);
                setOption(index);
                setDraft(options[index]!);
              }}
            >
              {options.map((value, index) => (
                <option key={index} value={index}>
                  {index + 1}. {value.slice(0, 100)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t("draft")}
          <textarea
            className="xt-draft"
            value={draft}
            placeholder={t("readyDraft")}
            rows={5}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <div className="xt-draft-actions">
          <button
            className="xt-secondary"
            disabled={!draft}
            onClick={async () => {
              if (await copyText(draft)) model.notify(t("copied"));
              else model.open({ type: "copy", text: draft });
            }}
          >
            <Copy size={15} />
            {t("copy")}
          </button>
          <button
            className="xt-secondary"
            disabled={!draft}
            onClick={() => {
              if (model.actions.fill(tweet, draft)) model.notify(t("inserted"));
              else setError(t("insertHelp"));
            }}
          >
            <PenLine size={15} />
            {t("insert")}
          </button>
        </div>
        <p className="xt-field-note">{t("security")}</p>
      </div>
    </Dialog>
  );
}
