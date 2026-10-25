import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Copy, PenLine, Sparkles } from "lucide-react";
import { fillTemplate } from "../core/settings";
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
    t = translator(state.settings.language);
  const [text, setText] = useState(tweet.text),
    [prompt, setPrompt] = useState(""),
    [draft, setDraft] = useState(""),
    [temporary, setTemporary] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setPrompt(
      fillTemplate(state.settings.template, {
        author: `${tweet.author.name} (@${tweet.author.handle})`,
        text,
        language: { en: "English", zh: "中文", ja: "日本語" }[
          state.settings.language
        ],
      }),
    );
  }, [text, state.settings.template, state.settings.language]);
  useEffect(() => () => controller.current?.abort(), []);
  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const reply = await model.transport.request(
        { type: "grok", prompt, temporary },
        abort.signal,
      );
      if ("text" in reply && !abort.signal.aborted) setDraft(reply.text);
    } catch (error) {
      setError(errorText(error, t));
    } finally {
      if (controller.current === abort) {
        setBusy(false);
        controller.current = null;
      }
    }
  };
  return (
    <Dialog model={model} title={t("grok")} subtitle={t("grokHint")}>
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
          {t("prompt")}
          <textarea
            value={prompt}
            rows={5}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={20000}
          />
        </label>
        <label className="xt-toggle-row">
          <span>{t("temporary")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={temporary}
            disabled={!state.capabilities.temporary || busy}
            onChange={(e) => setTemporary(e.target.checked)}
          />
          <span className="xt-toggle" aria-hidden="true" />
        </label>
        {!state.capabilities.temporary && (
          <p className="xt-field-note">{t("temporaryUnavailable")}</p>
        )}
        <div className="xt-notice">
          <p>{t("grokPrivacy")}</p>
        </div>
        {!state.capabilities.grok && (
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
            disabled={busy || !prompt.trim() || !state.capabilities.grok}
            onClick={() => void generate()}
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
          </p>
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
