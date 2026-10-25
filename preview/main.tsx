import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  Copy,
  Eye,
  Image,
  Network,
  Settings2,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { Workspace } from "../src/content/model";
import { defaultSettings } from "../src/core/settings";
import { App } from "../src/ui/App";
import { Badge } from "../src/ui/Rankings";
import { Wordmark, useWorkspace } from "../src/ui/shared";
import { translator } from "../src/ui/i18n";
import { toMarkdown } from "../src/core/markdown";
import { compact } from "../src/core/metrics";
import { rankingApplies, lowViewTweet } from "../src/core/ranking";
import { fixtureRelations, fixtureTweets } from "../tests/fixtures";
import type { Settings } from "../src/core/types";
import { ExtensionHub } from "../src/ui/ExtensionHub";
import type { HubServices } from "../src/platform/monitoring";
import { usePalette } from "../src/ui/palette";
import "../src/ui/styles.css";
import "./preview.css";

const data = new Map<string, unknown>();
const storage = {
  async get(key: string) {
    return data.get(key);
  },
  async set(key: string, value: unknown) {
    data.set(key, structuredClone(value));
  },
  async remove(key: string) {
    data.delete(key);
  },
};
const settings = { ...defaultSettings("en"), theme: "light" as const };
let before = 0;
const fixtureMode =
  import.meta.env.DEV &&
  ["127.0.0.1", "localhost"].includes(location.hostname) &&
  new URLSearchParams(location.search).get("test-fixtures") === "1";
const tweets = fixtureMode ? fixtureTweets() : [];
const model = new Workspace(
  settings,
  storage,
  async (value: Settings) => {
    data.set("settings:v1", value);
  },
  {
    jump(tweet) {
      before = window.scrollY;
      document
        .getElementById(`post-${tweet.id}`)
        ?.scrollIntoView({ block: "center" });
      return true;
    },
    back() {
      window.scrollTo({ top: before });
    },
    fill() {
      return false;
    },
  },
  "fixture_account",
);
const services: HubServices = {
  preview: true,
  configureBark: async () => {
    throw new Error("operationFailed");
  },
  flush: async () => {},
  diagnostics: async () => ({
    version: "local-preview",
    checkedAt: Date.now(),
    storageBytes: JSON.stringify([...data]).length,
    monitorCount: 0,
    barkEnabled: false,
    barkPermitted: false,
    pages: [{ site: "local fixture", ...model.health() }],
  }),
  events: async () => [],
  clearEvents: async () => {},
  authorizeBark: async () => {
    throw new Error("operationFailed");
  },
  testBark: async () => "off",
  retry: async () => {
    throw new Error("operationFailed");
  },
  watchEvents: () => () => {},
};
model.transport = {
  async request(command, signal) {
    if (!fixtureMode) throw new Error("noConnection");
    if (command.type === "capabilities")
      return {
        capabilities: {
          reposts: true,
          quotes: true,
          grok: true,
          temporary: false,
        },
      };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 350);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("cancelled"));
        },
        { once: true },
      );
    });
    if (command.type === "graph")
      return {
        page: {
          relations: fixtureRelations(tweets[0]!).filter(
            (r) => r.kind === command.kind,
          ),
          cursor: command.cursor ? null : "fixture-next",
          observedAt: Date.now(),
        },
      };
    if (command.type === "grok")
      return {
        text: "This is a synthetic reply for local UI verification. No request was sent to X or Grok.",
      };
    return {
      capabilities: {
        reposts: true,
        quotes: true,
        grok: true,
        temporary: false,
      },
    };
  },
};
tweets.forEach((tweet) => model.upsert(tweet));
if (fixtureMode)
  model.ingest({
    tweets: [],
    capabilities: { reposts: true, quotes: true, grok: true, temporary: false },
  });
// These are local illustration fixtures, not downloaded or X-hosted media.
const longImage =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="2300"><rect width="900" height="2300" fill="#ece7dc"/><path d="M-100 500Q500 100 1000 700L1000 1800Q400 1300-100 1900Z" fill="#b74723"/><text x="70" y="140" font-family="sans-serif" font-size="50" fill="#292923">A longer way of looking.</text><text x="70" y="2220" font-family="sans-serif" font-size="24" fill="#292923">LOCAL IMAGE FIXTURE / 900 × 2300</text></svg>`,
  );
const mode = new URLSearchParams(location.search).get("view");
function Preview() {
  const state = useWorkspace(model),
    t = translator(state.settings.language),
    [dark, setDark] = useState(false);
  const palette = usePalette(state.settings);
  if (mode === "popup")
    return (
      <div className="xt-app preview-popup" data-theme={state.settings.theme}>
        <div>
          <div className="fixture-warning">
            {t(fixtureMode ? "demo" : "preview")}
          </div>
          <ExtensionHub
            settings={state.settings}
            update={(patch) => model.update(patch)}
            services={services}
            clearCache={() => model.cache.clear()}
          />
        </div>
      </div>
    );
  return (
    <div className="xt-app fixture-page" data-theme={state.settings.theme}>
      <div className="fixture-warning">
        {t(fixtureMode ? "demo" : "preview")}
      </div>
      <nav className="fixture-nav">
        <Wordmark />
        <div>
          <span>Reading, with intention.</span>
          <button
            className="fixture-theme"
            onClick={() => {
              setDark(!dark);
              model.settings({
                ...state.settings,
                theme: dark ? "light" : "dark",
              });
            }}
          >
            {dark ? "Light" : "Dark"}
          </button>
          <button
            aria-label={t("settings")}
            onClick={() => model.open({ type: "settings" })}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </nav>
      <div className="fixture-layout">
        <aside className="fixture-sidebar">
          <a className="selected">Your timeline</a>
          <a>Following</a>
          <a>Saved moments</a>
          <hr />
          <p>
            A quiet place
            <br />
            to notice more.
          </p>
          <small>EVERYTHING STAYS HERE.</small>
        </aside>
        <main className="fixture-feed">
          <header>
            <div>
              <span className="fixture-date">SATURDAY, OCTOBER 24</span>
              <h1>A little more perspective.</h1>
            </div>
            <Eye size={19} />
          </header>
          <div className="fixture-tabs">
            <span>For you</span>
            <span>Following</span>
            <span>Reading list</span>
          </div>
          {[...state.ranked]
            .filter(
              (tweet) =>
                !rankingApplies(state.settings, state.scope) ||
                !lowViewTweet(tweet, state.settings),
            )
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((tweet, i) => (
              <article
                key={tweet.id}
                id={`post-${tweet.id}`}
                data-xtrend-fixture="true"
                data-testid="tweet"
                data-tweet-id={tweet.id}
                className="fixture-post"
              >
                <div className="fixture-post-heading">
                  <div className="xt-avatar">
                    {tweet.author.name.slice(0, 1)}
                  </div>
                  <div>
                    <strong>{tweet.author.name}</strong>
                    <p>
                      @{tweet.author.handle} ·{" "}
                      <a href={tweet.url}>
                        <time
                          dateTime={new Date(tweet.createdAt!).toISOString()}
                        >
                          {i + 2}h
                        </time>
                      </a>
                    </p>
                  </div>
                  <div
                    className="xt-inline"
                    style={palette}
                    data-theme={state.settings.theme}
                  >
                    <Badge model={model} tweet={tweet} />
                  </div>
                </div>
                <p className="fixture-post-text">{tweet.text}</p>
                {i === 1 && (
                  <button
                    className="fixture-art"
                    onClick={() =>
                      model.open({
                        type: "image",
                        photos: [longImage],
                        index: 0,
                      })
                    }
                    aria-label={t("photo")}
                  >
                    <div className="fixture-circle" />
                    <span>
                      THE ART OF
                      <br />
                      PAYING ATTENTION.
                    </span>
                    <small>FIELD NOTES / 2026</small>
                    <ArrowUpRight size={22} />
                  </button>
                )}
                <footer>
                  <span>
                    <Eye size={13} />
                    {compact(tweet.counts.views)}
                  </span>
                  <span>{compact(tweet.counts.likes)} likes</span>
                  <div>
                    <button
                      aria-label={t("markdown")}
                      title={t("markdown")}
                      onClick={() =>
                        model.open({ type: "copy", text: toMarkdown(tweet) })
                      }
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      aria-label={`${t("star")} ${tweet.author.name}`}
                      title={t("star")}
                      onClick={() => model.open({ type: "star", tweet })}
                    >
                      <Network size={16} />
                    </button>
                    <button
                      aria-label={`${t("grok")} ${tweet.author.name}`}
                      title={t("grok")}
                      onClick={() => model.open({ type: "grok", tweet })}
                    >
                      <Sparkles size={16} />
                    </button>
                    <button
                      aria-label={t("photo")}
                      title={t("photo")}
                      onClick={() =>
                        model.open({
                          type: "image",
                          photos: [longImage],
                          index: 0,
                        })
                      }
                    >
                      <Image size={16} />
                    </button>
                  </div>
                </footer>
              </article>
            ))}
        </main>
        <aside className="fixture-right">
          <p>YOUR READING DESK</p>
          <h2>
            Find the signal.
            <br />
            Keep your place.
          </h2>
          <span>
            The same timeline.
            <br />A clearer point of view.
          </span>
        </aside>
      </div>
      <App model={model} demo={fixtureMode} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
