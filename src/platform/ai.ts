import { browser } from "wxt/browser";
import { aiEndpoint, type AiSettings } from "../core/ai";
import { boundedText } from "../core/response";
import { barkPermission } from "./monitoring";

export const AI_KEYS = "ai-keys:v1";
export async function requestAi(
  ai: AiSettings,
  prompt: unknown,
  key: string,
  fetcher = fetch,
): Promise<{ text: string }> {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20000)
    throw new Error("invalidPrompt");
  if (ai.provider === "grok") throw new Error("invalidAiConfig");
  const config = ai[ai.provider],
    url = aiEndpoint(config.endpoint);
  if (!config.model.trim()) throw new Error("invalidAiConfig");
  if (ai.provider === "openai" && !key) throw new Error("missingAiKey");
  // shortcut: bound first-response time to 25s; use streaming if slower models need support.
  const response = await fetcher(url, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
    headers: {
      "content-type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "rateLimited"
        : response.status === 401 || response.status === 403
          ? "accessDenied"
          : "requestFailed",
    );
  const data = JSON.parse(await boundedText(response, 1024 * 1024));
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim() || text.length > 100000)
    throw new Error("unrecognizedResponse");
  return { text };
}
export async function generateAi(ai: AiSettings, prompt: unknown) {
  if (ai.provider === "grok") throw new Error("invalidAiConfig");
  const origin = aiEndpoint(ai[ai.provider].endpoint).origin;
  if (!(await barkPermission(origin + "/*")))
    throw new Error("permissionDenied");
  const keys = ((await browser.storage.local.get(AI_KEYS))[AI_KEYS] ??
    {}) as Record<string, string>;
  return requestAi(
    ai,
    prompt,
    ai.provider === "openai" ? (keys[origin] ?? "") : "",
  );
}
