import { describe, expect, it } from "vitest";
import { extractGraph } from "../src/core/normalize";
import { rawTweet } from "./fixtures";
import {
  allowedURL,
  classifyGrok,
  readGrokResponse,
} from "../src/page/observer";
describe("restricted page transport", () => {
  it("recognizes current quote result links without including unrelated tweets", () => {
    const original = rawTweet("100");
    const quote = {
      ...rawTweet("200"),
      quoted_status_result: { result: original },
    };
    expect(
      extractGraph(
        { entries: [quote, rawTweet("300")] },
        "100",
        "quote",
      ).relations.map((r) => r.kind === "quote" && r.tweet.id),
    ).toEqual(["200"]);
    expect(
      extractGraph({ entries: [quote] }, "999", "quote").relations,
    ).toEqual([]);
  });
  it("allows only same-origin X API routes", () => {
    expect(
      allowedURL("/i/api/graphql/observed/Retweeters", "https://x.com"),
    ).toBe(true);
    expect(allowedURL("/i/api/graphql/hash/QuoteTweets", "https://x.com")).toBe(
      true,
    );
    expect(
      allowedURL("/i/api/graphql/hash/SearchTimeline", "https://x.com"),
    ).toBe(true);
    expect(
      allowedURL("/i/api/graphql/hash/CreateGrokConversation", "https://x.com"),
    ).toBe(true);
    expect(allowedURL("/i/api/2/grok/add_response.json", "https://x.com")).toBe(
      true,
    );
    for (const url of [
      "https://api.x.ai/chat",
      "https://tracker.test/i/api/graphql/a/b",
      "https://pro.x.com/i/api/graphql/a/b",
      "/logout",
      "/i/api/1.1/account/settings.json",
      "/i/api/graphql/hash/DmInbox",
      "/i/api/graphql/hash/CreateTweet",
      "/i/api/2/grok/conversation_history.json",
    ])
      expect(allowedURL(url, "https://x.com")).toBe(false);
  });
  const template = (body: Record<string, unknown>) => ({
    url: "https://x.com/i/api/2/grok/add_response.json",
    method: "POST",
    headers: {},
    body,
    at: Date.now(),
  });
  it("learns only text-only first-turn requests", () => {
    expect(
      classifyGrok(template({ message: "hello", temporary: false })),
    ).not.toBeNull();
    expect(
      classifyGrok(
        template({
          message: "hello",
          conversationId: "existing-private-conversation",
        }),
      ),
    ).toBeNull();
    expect(
      classifyGrok(
        template({ message: "hello", fileAttachments: ["private-file"] }),
      ),
    ).toBeNull();
  });
  it("assembles UTF-8 tokens split across stream chunks", async () => {
    const bytes = new TextEncoder().encode(
      'data: {"result":{"response":{"token":"你"}}}\n\ndata: {"result":{"response":{"token":"好"}}}\n\ndata: [DONE]\n',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7)
          controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    });
    expect(await readGrokResponse(new Response(stream))).toBe("你好");
  });
  it("does not present arbitrary server errors as generated drafts", async () => {
    await expect(
      readGrokResponse(new Response('{"error":"access denied"}')),
    ).rejects.toThrow("unrecognizedResponse");
  });
  it("respects cancellation", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      readGrokResponse(new Response("hello"), abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("handles modelResponse format from alternative Grok responses", async () => {
    const bytes = new TextEncoder().encode(
      'data: {"modelResponse":{"message":"Generated draft reply"}}\n\ndata: [DONE]\n',
    );
    expect(await readGrokResponse(new Response(bytes))).toBe(
      "Generated draft reply",
    );
  });
});
