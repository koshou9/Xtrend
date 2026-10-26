import { extractGraph, extractTweets, walk } from "../core/normalize";
import type { Capabilities, Command, PageSnapshot, Reply } from "../core/types";
import { boundedText } from "../core/response";

export const CHANNEL = "xtrend:v1";
const MAX_BODY = 8 * 1024 * 1024;
type Template = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, any> | null;
  at: number;
};
type GrokTemplate = Template & {
  promptPath: string[];
  temporaryPath: string[] | null;
  conversationPaths: string[][];
};
const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function parse(value: string | null): Record<string, any> | null {
  try {
    const result = JSON.parse(value ?? "null");
    return isObject(result) ? result : null;
  } catch {
    return null;
  }
}
export function allowedURL(value: string, origin: string): boolean {
  try {
    const u = new URL(value, origin);
    if (u.origin !== origin) return false;
    if (u.pathname === "/i/api/2/grok/add_response.json") return true;
    if (!u.pathname.startsWith("/i/api/graphql/")) return false;
    const op = operation(u);
    return [
      "HomeTimeline",
      "HomeLatestTimeline",
      "TweetDetail",
      "TweetResultByRestId",
      "UserTweets",
      "UserTweetsAndReplies",
      "UserMedia",
      "SearchTimeline",
      "ListLatestTweetsTimeline",
      "Bookmarks",
      "Retweeters",
      "QuoteTweets",
      "CreateGrokConversation",
      "CreateGrokConversationResponse",
      "GrokAddResponse",
    ].includes(op);
  } catch {
    return false;
  }
}
const operation = (url: URL) =>
  decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
function variables(template: Template): Record<string, any> {
  const u = new URL(template.url);
  return (
    template.body?.variables ?? parse(u.searchParams.get("variables")) ?? {}
  );
}
function findPaths(
  value: unknown,
  keys: string[],
  path: string[] = [],
): string[][] {
  if (Array.isArray(value))
    return value.flatMap((child, index) =>
      findPaths(child, keys, [...path, String(index)]),
    );
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    keys.includes(key)
      ? [[...path, key]]
      : findPaths(child, keys, [...path, key]),
  );
}
export function classifyGrok(
  template: Template,
  allowLinked = false,
): GrokTemplate | null {
  if (!template.body || template.method !== "POST") return null;
  const pathname = new URL(template.url).pathname;
  if (
    !/grok/i.test(pathname) ||
    !/(new|create|add_response|GrokConversation)/i.test(pathname)
  )
    return null;
  // Only first-turn requests can be replayed. Never append a draft to an existing conversation.
  const identifiers = findPaths(template.body, [
    "conversationId",
    "conversation_id",
    "parentResponseId",
    "parent_response_id",
  ]);
  for (const path of identifiers) {
    let value: any = template.body;
    for (const key of path) value = value[key];
    if (
      value !== null &&
      value !== "" &&
      value !== undefined &&
      !(
        allowLinked &&
        ["conversationId", "conversation_id"].includes(path.at(-1)!)
      )
    )
      return null;
  }
  // Attached files, previous messages and tool calls are never replayed.
  let unsafe = false;
  walk(template.body, (value) => {
    for (const [key, child] of Object.entries(value)) {
      if (
        /attachment|history|messages|toolResults|imageAttachments|files/i.test(
          key,
        ) &&
        child != null &&
        child !== "" &&
        (!Array.isArray(child) || child.length > 0)
      )
        unsafe = true;
      if (
        key === "responses" &&
        (!Array.isArray(child) ||
          child.length !== 1 ||
          !isObject(child[0]) ||
          child[0].sender !== 1 ||
          typeof child[0].message !== "string")
      )
        unsafe = true;
    }
  });
  if (unsafe) return null;
  const promptPaths = findPaths(template.body, ["message", "prompt", "query"]);
  if (promptPaths.length !== 1) return null;
  const temporaryPaths = findPaths(template.body, [
    "temporary",
    "isTemporary",
    "is_temporary",
  ]);
  return {
    ...template,
    promptPath: promptPaths[0]!,
    temporaryPath: temporaryPaths.length === 1 ? temporaryPaths[0]! : null,
    conversationPaths: identifiers.filter((path) =>
      ["conversationId", "conversation_id"].includes(path.at(-1)!),
    ),
  };
}
export function extractGrokText(data: unknown): string {
  const result: string[] = [];
  walk(data, (value) => {
    if (typeof value.token === "string") result.push(value.token);
    else if (
      isObject(value.modelResponse) &&
      typeof value.modelResponse.message === "string"
    )
      result.push(value.modelResponse.message);
    else if (
      (value.sender === "assistant" ||
        value.sender === 2 ||
        value.role === "assistant") &&
      typeof value.message === "string"
    )
      result.push(value.message);
    else if (
      isObject(value.result) &&
      typeof value.result.message === "string" &&
      !value.result.error &&
      !value.result.sender
    )
      result.push(value.result.message);
  });
  return result.join("");
}
export async function readGrokResponse(
  response: Response,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.body) throw new Error("emptyResponse");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "",
    size = 0,
    text = "";
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) throw new Error("responseTooLarge");
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending
          .slice(0, newline)
          .replace(/^data:\s*/, "")
          .trim();
        pending = pending.slice(newline + 1);
        if (!line || line === "[DONE]") continue;
        try {
          text += extractGrokText(JSON.parse(line));
        } catch {
          /* Wait for a complete structured line. */
        }
      }
    }
    pending += decoder.decode();
    if (pending.trim()) {
      try {
        text += extractGrokText(JSON.parse(pending.replace(/^data:\s*/, "")));
      } catch {
        /* Unrecognized text is not presented as a draft. */
      }
    }
    if (!text.trim()) throw new Error("unrecognizedResponse");
    return text;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function installObserver() {
  if (!["https://x.com", "https://pro.x.com"].includes(location.origin)) return;
  const originalFetch = window.fetch;
  const recent = new Map<string, ReturnType<typeof extractTweets>[number]>();
  const controllers = new Map<string, AbortController>();
  let sessionFingerprint = "";

  const reset = () => {
    recent.clear();
    for (const controller of controllers.values()) controller.abort();
  };
  window.addEventListener("pagehide", () => {
    reset();
    sessionFingerprint = "";
  });
  const capabilities = (): Capabilities => ({
    reposts: true,
    quotes: true,
    grok: true,
    temporary: true,
  });
  const emit = (snapshot: PageSnapshot) =>
    window.postMessage(
      { channel: CHANNEL, event: "snapshot", snapshot },
      location.origin,
    );
  const inspect = (template: Template, data: unknown) => {
    const fingerprint = template.headers["x-csrf-token"];
    if (fingerprint && sessionFingerprint && fingerprint !== sessionFingerprint)
      reset();
    if (fingerprint) sessionFingerprint = fingerprint;
    const url = new URL(template.url),
      op = operation(url);
    const tweets = extractTweets(data);
    for (const tweet of tweets) recent.set(tweet.id, tweet);
    while (recent.size > 500) recent.delete(recent.keys().next().value!);
    const vars = variables(template),
      id = String(
        vars.tweetId ??
          vars.tweet_id ??
          vars.focalTweetId ??
          (vars.rawQuery ?? "").match(/^quoted_tweet_id:(\d+)/)?.[1] ??
          "",
      );
    const kind =
      op === "Retweeters"
        ? "repost"
        : ["QuoteTweets", "SearchTimeline"].includes(op)
          ? "quote"
          : null;
    emit({
      tweets,
      capabilities: capabilities(),
      ...(/^\d+$/.test(id) && kind
        ? { graph: { id, kind, page: extractGraph(data, id, kind) } }
        : {}),
    });
  };
  const safeInspect = (template: Template, data: unknown) => {
    try {
      inspect(template, data);
    } catch {
      /* X responses must continue unchanged even when parsing fails. */
    }
  };
  const filteredHeaders = (headers: Headers) => {
    const allowed = [
      "authorization",
      "content-type",
      "x-csrf-token",
      "x-twitter-auth-type",
      "x-twitter-active-user",
      "x-twitter-client-language",
    ];
    return Object.fromEntries(
      [...headers].filter(([key]) => allowed.includes(key)),
    );
  };
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const promise = originalFetch.call(this, input, init);
    try {
      const rawURL = input instanceof Request ? input.url : String(input),
        url = new URL(rawURL, location.href).href;
      if (!allowedURL(url, location.origin)) return promise;
      const headers = new Headers(
        input instanceof Request ? input.headers : undefined,
      );
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
      const bodyPromise =
        typeof init?.body === "string"
          ? Promise.resolve(init.body)
          : input instanceof Request && input.method !== "GET" && !init?.body
            ? input
                .clone()
                .text()
                .catch(() => "")
            : Promise.resolve("");
      void promise
        .then(async (response) => {
          if (
            !response.ok ||
            Number(response.headers.get("content-length")) > MAX_BODY
          )
            return;
          const contentType = response.headers.get("content-type") ?? "";
          if (!/json|event-stream/.test(contentType)) return;
          // Clone before the first await: X may consume the original body immediately.
          const clone = response.clone();
          const [body, text] = await Promise.all([
            bodyPromise,
            boundedText(clone, MAX_BODY),
          ]);
          if (text.length > MAX_BODY || body.length > 100000) return;
          const template = {
            url,
            method: (
              init?.method ?? (input instanceof Request ? input.method : "GET")
            ).toUpperCase(),
            headers: filteredHeaders(headers),
            body: parse(body),
            at: Date.now(),
          };
          try {
            safeInspect(template, JSON.parse(text));
          } catch {
            if (classifyGrok(template)) {
              const records = text.split("\n").flatMap((line) => {
                try {
                  return [JSON.parse(line.replace(/^data:\s*/, ""))];
                } catch {
                  return [];
                }
              });
              if (records.some((record) => extractGrokText(record)))
                safeInspect(template, records);
            }
          }
        })
        .catch(() => {});
    } catch {
      /* Observation cannot change fetch behavior. */
    }
    return promise;
  };
  const xhrState = new WeakMap<
    XMLHttpRequest,
    { url: string; method: string; headers: Record<string, string> }
  >();
  const open = XMLHttpRequest.prototype.open,
    send = XMLHttpRequest.prototype.send,
    setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...args: any[]
  ) {
    const result = (open as any).call(this, method, url, ...args);
    try {
      xhrState.set(this, {
        url: new URL(String(url), location.href).href,
        method: method.toUpperCase(),
        headers: {},
      });
    } catch {
      /* Invalid URLs remain the browser's concern. */
    }
    return result;
  } as typeof open;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    const result = setHeader.call(this, name, value),
      state = xhrState.get(this);
    if (state) state.headers[name.toLowerCase()] = value;
    return result;
  };
  XMLHttpRequest.prototype.send = function (body) {
    const state = xhrState.get(this);
    if (state && allowedURL(state.url, location.origin)) {
      this.addEventListener(
        "load",
        () => {
          try {
            if (
              this.status < 200 ||
              this.status >= 300 ||
              !/json/.test(this.getResponseHeader("content-type") ?? "")
            )
              return;
            const data =
              this.responseType === "json"
                ? this.response
                : this.responseType === "" || this.responseType === "text"
                  ? JSON.parse(this.responseText.slice(0, MAX_BODY))
                  : null;
            safeInspect(
              {
                ...state,
                headers: filteredHeaders(new Headers(state.headers)),
                body: typeof body === "string" ? parse(body) : null,
                at: Date.now(),
              },
              data,
            );
          } catch {
            /* Observation cannot change XHR behavior. */
          }
        },
        { once: true },
      );
    }
    return send.call(this, body);
  };
  const request = async (
    command: Command,
    signal: AbortSignal,
  ): Promise<Reply> => {
    if (command.type === "capabilities") {
      emit({ tweets: [...recent.values()], capabilities: capabilities() });
      return { capabilities: capabilities() };
    }
    if (command.type === "reset") {
      reset();
      sessionFingerprint = "";
      emit({ tweets: [], capabilities: capabilities() });
      return { capabilities: capabilities() };
    }
    if (command.type === "cancel") return { capabilities: capabilities() };
    throw new Error("invalidRequest");
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== CHANNEL ||
      event.data?.event !== "command"
    )
      return;
    const { id, command } = event.data;
    if (
      typeof id !== "string" ||
      id.length > 100 ||
      !isObject(command) ||
      !["capabilities", "reset", "cancel"].includes(command.type)
    )
      return;
    if (command.type === "cancel") {
      controllers.get(String(command.target))?.abort();
      return;
    }
    if (controllers.size >= 3) return;
    const controller = new AbortController();
    controllers.set(id, controller);
    const timer = setTimeout(() => controller.abort(), 60_000);
    void request(command as Command, controller.signal)
      .then((reply) => {
        window.postMessage(
          { channel: CHANNEL, event: "reply", id, reply },
          location.origin,
        );
      })
      .catch((error) => {
        const message =
          error instanceof Error
            ? error.name === "AbortError"
              ? "cancelled"
              : error.message
            : "requestFailed";
        const safeCodes = [
          "learnGraph",
          "learnGrok",
          "invalidRequest",
          "invalidPrompt",
          "temporaryUnavailable",
          "refreshConnection",
          "rateLimited",
          "accessDenied",
          "requestFailed",
          "cancelled",
          "slowDown",
          "responseTooLarge",
          "unrecognizedResponse",
          "emptyResponse",
        ];
        window.postMessage(
          {
            channel: CHANNEL,
            event: "reply",
            id,
            error: safeCodes.includes(message) ? message : "requestFailed",
          },
          location.origin,
        );
      })
      .finally(() => {
        clearTimeout(timer);
        controllers.delete(id);
      });
  });
}
