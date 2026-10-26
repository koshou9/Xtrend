import type { Command, GraphPage, Reply } from "../core/types";
import { cleanReply } from "../core/wire";
import { extractGraph } from "../core/normalize";
import { boundedText } from "../core/response";
import { installObserver } from "./observer";

const CHANNEL = "xtrend:native:v1";
const PREFIX = "xtrend-native-";
type Action = Extract<Command, { type: "graph" | "grok" }>;

// X rejects embedded pages; its own top-level tab builds the current signed requests.
export function installNativePage() {
  const token = location.hash.match(/^#xtrend-native=([a-f0-9-]{36})$/)?.[1];
  if (
    !token ||
    !["https://x.com", "https://pro.x.com"].includes(location.origin)
  )
    return;
  window.name = PREFIX + token;
  const graphRoute = location.pathname.match(
    /^\/i\/status\/(\d{1,30})\/(retweets|quotes)$/,
  );
  if (!graphRoute && location.pathname !== "/i/grok") return;
  if (graphRoute) installObserver();
  let pending: { id: string; command: Action } | null = null;
  const graphPages: GraphPage[] = [];
  let lastError = "";
  let submitted = false;
  let prepared = false;
  let streaming = false;
  let draft = "";
  let stableAt = 0;
  let privacyClickedAt = 0;
  const reply = (value?: Reply, error?: string) => {
    if (!pending) return;
    window.postMessage(
      { channel: CHANNEL, event: "reply", id: pending.id, reply: value, error },
      location.origin,
    );
    pending = null;
  };
  const serveGraph = () => {
    if (pending?.command.type !== "graph" || !graphPages.length) return;
    const cursor = pending.command.cursor;
    const index = cursor
      ? graphPages.findIndex((page) => page.cursor === cursor) + 1
      : 0;
    if (cursor && index === 0) reply(undefined, "refreshConnection");
    else if (graphPages[index]) reply({ page: graphPages[index] });
  };
  const acceptGraph = (page: GraphPage) => {
    if (!graphPages.some((previous) => previous.cursor === page.cursor)) {
      if (graphPages.length >= 100) {
        reply(undefined, "responseTooLarge");
        return;
      }
      graphPages.push(page);
    }
    serveGraph();
  };
  window.addEventListener("message", (event) => {
    if (
      !graphRoute ||
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== "xtrend:v1" ||
      event.data.event !== "snapshot"
    )
      return;
    const graph = event.data.snapshot?.graph;
    if (
      graph?.id !== graphRoute[1] ||
      graph.kind !== (graphRoute[2] === "retweets" ? "repost" : "quote")
    )
      return;
    const clean = cleanReply({ page: graph.page });
    if (clean && "page" in clean) {
      acceptGraph(clean.page);
    }
  });
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const result = originalFetch.call(this, input, init);
    try {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      );
      const graph =
        !!graphRoute &&
        url.origin === location.origin &&
        /\/(Retweeters|QuoteTweets|SearchTimeline)$/.test(url.pathname);
      // Only observe generation in this fresh Grok page, never history or credentials.
      const generation =
        !graphRoute &&
        submitted &&
        [location.hostname, "grok.x.com", "grok.com"].includes(url.hostname) &&
        (
          init?.method ?? (input instanceof Request ? input.method : "GET")
        ).toUpperCase() === "POST" &&
        /(?:add_response|conversations\/new|responses|chat\/completions)/.test(
          url.pathname,
        );
      if (graph || generation)
        void (async () => {
          try {
            const response = await result;
            if (!response.ok) {
              lastError =
                response.status === 429
                  ? "rateLimited"
                  : response.status === 401 || response.status === 403
                    ? "accessDenied"
                    : "requestFailed";
              reply(undefined, lastError);
              return;
            }
            if (graph) {
              const data = JSON.parse(
                await boundedText(response.clone(), 8 * 1024 * 1024),
              );
              if (Array.isArray(data.errors) && data.errors.length) {
                lastError = "requestFailed";
                reply(undefined, lastError);
                return;
              }
              const page = extractGraph(
                data,
                graphRoute![1]!,
                graphRoute![2] === "retweets" ? "repost" : "quote",
              );
              acceptGraph(page);
            } else {
              streaming = true;
              const clone = response.clone();
              const { readGrokResponse } = await import("./observer");
              try {
                reply({ text: await readGrokResponse(clone) });
              } catch {
                /* The native rendered answer also supports WebSocket and newer formats. */
              } finally {
                streaming = false;
              }
            }
          } catch {
            lastError = "requestFailed";
            if (graph) reply(undefined, lastError);
          }
        })();
    } catch {
      /* Observation must not change X requests. */
    }
    return result;
  };
  const xhrRequests = new WeakMap<
    XMLHttpRequest,
    { url: URL; method: string }
  >();
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...args: any[]
  ) {
    const result = (xhrOpen as any).call(this, method, url, ...args);
    try {
      xhrRequests.set(this, {
        url: new URL(String(url), location.href),
        method: method.toUpperCase(),
      });
    } catch {
      /* Preserve native URL handling. */
    }
    return result;
  } as typeof xhrOpen;
  XMLHttpRequest.prototype.send = function (body) {
    const request = xhrRequests.get(this);
    if (
      !graphRoute &&
      submitted &&
      pending?.command.type === "grok" &&
      request?.method === "POST" &&
      [location.hostname, "grok.x.com", "grok.com"].includes(
        request.url.hostname,
      ) &&
      /grok|conversations|responses/i.test(request.url.pathname) &&
      typeof body === "string" &&
      body.includes(JSON.stringify(pending.command.prompt))
    ) {
      streaming = true;
      this.addEventListener(
        "load",
        () => {
          void (async () => {
            try {
              if (this.status < 200 || this.status >= 300)
                return reply(
                  undefined,
                  this.status === 429 ? "rateLimited" : "accessDenied",
                );
              const text =
                this.responseType === "json"
                  ? JSON.stringify(this.response)
                  : this.responseText;
              if (text.length > 8 * 1024 * 1024)
                return reply(undefined, "responseTooLarge");
              const { readGrokResponse } = await import("./observer");
              reply({ text: await readGrokResponse(new Response(text)) });
            } catch {
              /* A completed rendered answer can still be used. */
            } finally {
              streaming = false;
            }
          })();
        },
        { once: true },
      );
    }
    return xhrSend.call(this, body);
  };
  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.origin === location.origin &&
      event.data?.channel === CHANNEL &&
      event.data.event === "probe"
    ) {
      window.postMessage({ channel: CHANNEL, event: "ready" }, location.origin);
      return;
    }
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== CHANNEL ||
      event.data.event !== "request" ||
      pending
    )
      return;
    const { id, command } = event.data;
    if (typeof id !== "string" || id.length > 100 || !command) return;
    if (graphRoute) {
      if (
        command.type !== "graph" ||
        command.tweetId !== graphRoute[1] ||
        command.kind !== (graphRoute[2] === "retweets" ? "repost" : "quote") ||
        (command.cursor &&
          (typeof command.cursor !== "string" || command.cursor.length > 4096))
      )
        return;
    } else if (
      command.type !== "grok" ||
      typeof command.prompt !== "string" ||
      !command.prompt.trim() ||
      command.prompt.length > 20000 ||
      typeof command.temporary !== "boolean"
    )
      return;
    pending = { id, command };
    if (lastError) return reply(undefined, lastError);
    if (graphRoute) {
      serveGraph();
      if (pending && command.cursor) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        for (const el of document.querySelectorAll<HTMLElement>(
          'main [style*="overflow"]',
        ))
          if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      }
    }
  });
  const timer = setInterval(() => {
    if (!pending) return;
    if (
      location.pathname.includes("/login") ||
      document.querySelector('a[href="/login"]')
    )
      return reply(undefined, "accessDenied");
    if (pending.command.type === "graph") return;
    if (!submitted) {
      const input = document.querySelector<HTMLTextAreaElement>(
        'main textarea:not([aria-hidden="true"]), [data-testid="GrokDrawer"] textarea',
      );
      if (!input) return;
      const privateMode =
        /此次聊天不会出现在你的历史记录中|This (?:chat|conversation) (?:won.t|will not) (?:appear|be saved) (?:in|to) your (?:chat )?history|このチャット.*履歴/.test(
          document.querySelector("main")?.textContent ?? "",
        );
      if (privateMode !== pending.command.temporary) {
        if (!privacyClickedAt) {
          const toggle = [
            ...document.querySelectorAll<HTMLButtonElement>("main button"),
          ].find((button) =>
            /^(私密|临时|Private|Temporary(?: chat)?|一時(?:チャット)?)$/i.test(
              button.getAttribute("aria-label") ??
                button.textContent?.trim() ??
                "",
            ),
          );
          if (!toggle) return reply(undefined, "temporaryUnavailable");
          privacyClickedAt = Date.now();
          toggle.click();
        } else if (Date.now() - privacyClickedAt > 5000)
          reply(undefined, "temporaryUnavailable");
        return;
      }
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, pending.command.prompt);
      if (!prepared) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        prepared = true;
        return;
      }
      const send = [
        ...document.querySelectorAll<HTMLButtonElement>("main button"),
      ].find((button) =>
        /^(?:Ask Grok|Send(?: message)?|问\s*Grok\s*问题|发送|送信|Grok\s*に質問)/i.test(
          button.getAttribute("aria-label") ?? "",
        ),
      );
      if (!send || send.disabled) return;
      submitted = true;
      send.click();
      return;
    }
    const answers = document.querySelectorAll<HTMLElement>(
      'main .leading-relaxed.wrap-break-word, [data-testid="grok-message-assistant"], [data-message-author-role="assistant"], main .markdown, main .prose',
    );
    const texts = [...answers]
      .filter(
        (el) =>
          ![...answers].some((parent) => parent !== el && parent.contains(el)),
      )
      .map((el) => el.innerText.trim())
      .filter(Boolean);
    if (!texts.length) {
      for (const button of document.querySelectorAll<HTMLButtonElement>(
        "main button",
      )) {
        if (
          !/^(?:复制文本|Copy text|Copy response|Copy message|テキストをコピー)$/i.test(
            button.getAttribute("aria-label") ?? "",
          )
        )
          continue;
        let toolbar: HTMLElement | null = button.parentElement;
        for (
          let level = 0;
          toolbar && level < 6;
          level++, toolbar = toolbar.parentElement
        ) {
          const answer = toolbar.previousElementSibling as HTMLElement | null;
          if (
            answer?.querySelector('[dir="ltr"]') &&
            !answer.querySelector("textarea") &&
            answer.innerText.trim()
          ) {
            texts.push(answer.innerText.trim());
            break;
          }
        }
      }
    }
    const text = texts.join("\n\n");
    if (!text || text.length > 100000 || streaming) return;
    if (text !== draft) {
      draft = text;
      stableAt = Date.now();
      return;
    }
    const busy = document.querySelector(
      '[aria-label*="Stop"], [aria-label*="停止"], [data-testid="stop-button"], main [aria-busy="true"]',
    );
    if (!busy && Date.now() - stableAt >= 2500) reply({ text });
  }, 250);
  window.addEventListener("pagehide", () => clearInterval(timer), {
    once: true,
  });
  window.postMessage({ channel: CHANNEL, event: "ready" }, location.origin);
}
