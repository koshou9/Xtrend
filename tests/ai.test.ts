import { describe, expect, it, vi } from "vitest";
vi.mock("wxt/browser", () => ({ browser: {} }));
import {
  aiEndpoint,
  commentOptions,
  commentPrompt,
  defaultAi,
  validateAi,
} from "../src/core/ai";
import { validateSettings } from "../src/core/settings";
import { requestAi } from "../src/platform/ai";
import { createBackup } from "../src/core/backup";

describe("AI comments", () => {
  it("migrates the existing custom prompt and bounds imported settings", () => {
    const settings = validateSettings({
      template: "Keep my old instructions {{text}}",
    });
    expect(settings.ai.templates[0]!.prompt).toBe(settings.template);
    const ai = validateAi(
      {
        count: 0,
        temporary: "true",
        templates: [{ id: "x", name: "", prompt: "x" }],
        openai: { endpoint: "http://evil.test", model: "x" },
      },
      "old",
    );
    expect(ai.count).toBe(10);
    expect(ai.temporary).toBe(false);
    expect(ai.templates).toHaveLength(6);
    expect(ai.openai.endpoint).toBe("https://api.openai.com/v1");
    expect(createBackup(settings)).not.toContain("ai-keys:v1");
  });
  it("adds post content once and extracts separate publishable comments", () => {
    const values = { author: "A", text: "POST", language: "zh" as const };
    const automatic = commentPrompt("简短评论", values, 3);
    expect(automatic.match(/POST/g)).toHaveLength(1);
    expect(automatic).toContain("exactly 3");
    expect(
      commentPrompt("{{text}} {{author}}", values, 1).match(/POST/g),
    ).toHaveLength(1);
    expect(
      commentOptions(
        "Here are replies:\n```text\n第一条\n```\n```\n第二条\n```\nDone",
      ),
    ).toEqual(["第一条", "第二条"]);
    expect(commentOptions("unformatted reply")).toEqual(["unformatted reply"]);
    expect(commentOptions("1. First\n2. Second")).toEqual(["First", "Second"]);
    expect(
      commentPrompt("针对【推文内容】评论", values, 1).match(/POST/g),
    ).toHaveLength(1);
  });
  it("allows HTTPS and loopback only, without embedded secrets or redirects", () => {
    expect(aiEndpoint("http://localhost:11434/v1/").href).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
    expect(aiEndpoint("https://api.test/v1/chat/completions").pathname).toBe(
      "/v1/chat/completions",
    );
    for (const url of [
      "http://evil.test/v1",
      "https://user:secret@api.test",
      "https://api.test?key=secret",
      "https://api.test#secret",
    ])
      expect(() => aiEndpoint(url)).toThrow();
  });
  it("uses the same nonstreaming format for compatible services and Ollama, and surfaces errors", async () => {
    const ai = defaultAi("reply");
    ai.provider = "openai";
    ai.openai.model = "test-model";
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "```\nA reply\n```" } }],
          }),
        ),
    );
    expect(await requestAi(ai, "prompt", "test-key", fetcher)).toEqual({
      text: "```\nA reply\n```",
    });
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(init.redirect).toBe("error");
    expect(init.credentials).toBe("omit");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "prompt" }],
      stream: false,
    });
    await expect(requestAi(ai, "prompt", "", fetcher)).rejects.toThrow(
      "missingAiKey",
    );
    ai.provider = "ollama";
    ai.ollama.model = "local-model";
    await requestAi(ai, "prompt", "", fetcher);
    await expect(
      requestAi(
        ai,
        "prompt",
        "",
        async () => new Response("", { status: 429 }),
      ),
    ).rejects.toThrow("rateLimited");
    await expect(
      requestAi(ai, "prompt", "", async () => new Response("{}")),
    ).rejects.toThrow("unrecognizedResponse");
  });
});
