import { Bridge } from "../src/content/bridge";
import { browser } from "wxt/browser";
import { Workspace } from "../src/content/model";
import {
  captureScroll,
  currentAccount,
  findArticle,
  fillReply,
  restoreScroll,
} from "../src/content/dom";
import type { ScrollBookmark } from "../src/content/dom";
import { mountWorkspace } from "../src/content/mount";
import {
  loadSettings,
  localStoragePort,
  saveSettings,
  watchSettings,
  remoteGraphCache,
  remoteLibrary,
} from "../src/platform/storage";
import { reportMonitor } from "../src/platform/monitoring";

export default defineContentScript({
  matches: ["https://x.com/*", "https://pro.x.com/*"],
  runAt: "document_idle",
  async main(ctx) {
    if (
      location.hash.startsWith("#xtrend-native=") ||
      window.name.startsWith("xtrend-native-")
    )
      return;
    let bookmark: ScrollBookmark | null = null;
    const model = new Workspace(
      await loadSettings(),
      localStoragePort,
      saveSettings,
      {
        jump(tweet) {
          const article = findArticle(tweet.id);
          if (!article) {
            window.open(tweet.url, "_blank", "noopener,noreferrer");
            return false;
          }
          bookmark = captureScroll();
          article.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
            block: "center",
            inline: "center",
          });
          return true;
        },
        back() {
          if (bookmark) {
            restoreScroll(bookmark);
            bookmark = null;
          }
        },
        fill: fillReply,
        monitor: reportMonitor,
        cache: remoteGraphCache,
        library: remoteLibrary,
      },
      currentAccount(),
    );
    const bridge = new Bridge((snapshot) => model.ingest(snapshot));
    model.transport = bridge;
    const checkGrok = (message: any) =>
      message?.type === "xtrend:grok-check"
        ? Promise.resolve(model.snapshot().capabilities.grok)
        : undefined;
    browser.runtime.onMessage.addListener(checkGrok);
    let healthTimer: ReturnType<typeof setTimeout> | undefined;
    const reportHealth = () => {
      if (healthTimer) return;
      healthTimer = setTimeout(() => {
        healthTimer = undefined;
        void browser.runtime
          .sendMessage({ type: "xtrend:health-report", health: model.health() })
          .catch(() => {});
      }, 1500);
    };
    const stopHealth = model.subscribe(reportHealth);
    reportHealth();
    const unwatch = watchSettings((settings) => model.acceptSettings(settings)),
      unmount = mountWorkspace(model);
    void bridge
      .request({ type: "capabilities" })
      .then((reply) => {
        if ("capabilities" in reply)
          model.ingest({ tweets: [], capabilities: reply.capabilities });
      })
      .catch(() => {});
    let route = location.pathname + location.search,
      tab = document.querySelector(
        '[role="tab"][aria-selected="true"]',
      )?.textContent;
    const routeTimer = setInterval(() => {
      const next = location.pathname + location.search,
        nextTab = document.querySelector(
          '[role="tab"][aria-selected="true"]',
        )?.textContent;
      model.page(location.href);
      if (model.account(currentAccount()))
        void bridge.request({ type: "reset" }).catch(() => {});
      if (next !== route || nextTab !== tab) {
        model.reset();
        void bridge.request({ type: "reset" }).catch(() => {});
        bookmark = null;
        route = next;
        tab = nextTab;
      }
    }, 600);
    ctx.onInvalidated(() => {
      clearInterval(routeTimer);
      browser.runtime.onMessage.removeListener(checkGrok);
      clearTimeout(healthTimer);
      stopHealth();
      unwatch();
      unmount();
      bridge.destroy();
      model.destroy();
    });
    ctx.addEventListener(window, "pagehide", (event) => {
      model.open(null);
      model.reset();
      void bridge.request({ type: "reset" }).catch(() => {});
      if (!(event as PageTransitionEvent).persisted) {
        bridge.destroy();
        model.destroy();
      }
    });
  },
});
