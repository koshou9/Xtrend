import type { Language } from "./types";

export interface AiSettings {
  provider: "grok" | "openai" | "ollama";
  openai: { endpoint: string; model: string };
  ollama: { endpoint: string; model: string };
  count: number;
  temporary: boolean;
  selected: string;
  templates: { id: string; name: string; prompt: string }[];
}
export function defaultAi(template: string): AiSettings {
  return {
    provider: "grok",
    openai: { endpoint: "https://api.openai.com/v1", model: "" },
    ollama: { endpoint: "http://localhost:11434/v1", model: "" },
    count: 10,
    temporary: false,
    selected: "default",
    templates: [
      { id: "default", name: "默认评论", prompt: template },
      {
        id: "short",
        name: "中文短评",
        prompt: "用中文写简短自然的评论，每条不超过30字。",
      },
      {
        id: "sharp",
        name: "犀利观点",
        prompt: "针对原帖提出犀利、有依据的观点，不编造事实，不攻击个人。",
      },
      {
        id: "casual",
        name: "贴吧老哥",
        prompt:
          "用贴吧老哥的口吻评论，接地气，不装文艺，不写成新闻评论；每条30字以内，简短精悍。",
      },
      {
        id: "targeted",
        name: "针对性回应",
        prompt: "紧扣原帖的具体论点回应，避免空泛赞同和套话，不编造事实。",
      },
      {
        id: "deep",
        name: "深度回应",
        prompt:
          "结合原帖给出有逻辑的深入回应，说明理由与适用边界，不编造事实。",
      },
    ],
  };
}
export function aiEndpoint(value: string): URL {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  )
    throw new Error("invalidAiConfig");
  url.pathname = url.pathname.replace(/\/$/, "");
  if (!url.pathname.endsWith("/chat/completions"))
    url.pathname += "/chat/completions";
  return url;
}
export function validateAi(input: unknown, template: string): AiSettings {
  const defaults = defaultAi(template);
  if (!input || typeof input !== "object") return defaults;
  const v = input as Partial<AiSettings>;
  const templates = Array.isArray(v.templates)
    ? v.templates
        .slice(0, 30)
        .filter(
          (t) =>
            t &&
            typeof t.id === "string" &&
            /^[\w-]{1,60}$/.test(t.id) &&
            typeof t.name === "string" &&
            t.name.trim() &&
            t.name.length <= 60 &&
            typeof t.prompt === "string" &&
            t.prompt.trim() &&
            t.prompt.length <= 12000,
        )
    : [];
  const unique = templates
    .filter((t, i) => templates.findIndex((x) => x.id === t.id) === i)
    .map(({ id, name, prompt }) => ({ id, name, prompt }));
  const connection = (value: unknown, fallback: AiSettings["openai"]) => {
    const config = value as AiSettings["openai"] | undefined;
    try {
      if (
        !config ||
        typeof config.endpoint !== "string" ||
        config.endpoint.length > 2048
      )
        return fallback;
      aiEndpoint(config.endpoint);
      return {
        endpoint: config.endpoint,
        model:
          typeof config.model === "string"
            ? config.model.trim().slice(0, 200)
            : "",
      };
    } catch {
      return fallback;
    }
  };
  return {
    provider: ["grok", "openai", "ollama"].includes(v.provider ?? "")
      ? v.provider!
      : "grok",
    openai: connection(v.openai, defaults.openai),
    ollama: connection(v.ollama, defaults.ollama),
    count:
      Number.isInteger(v.count) && v.count! >= 1 && v.count! <= 30
        ? v.count!
        : 10,
    temporary: typeof v.temporary === "boolean" ? v.temporary : false,
    templates: unique.length ? unique : defaults.templates,
    selected: unique.some((t) => t.id === v.selected)
      ? v.selected!
      : (unique[0]?.id ?? "default"),
  };
}
export function commentPrompt(
  template: string,
  values: { author: string; text: string; language: Language },
  count: number,
): string {
  const source = template.replace(/【推文内容】|\[推文内容\]/g, "{{text}}");
  let prompt = source.replace(
    /\{\{(author|text|language)\}\}/g,
    (_, key: keyof typeof values) => values[key],
  );
  if (!source.includes("{{text}}")) prompt += `\n\n推文内容：\n${values.text}`;
  return `${prompt}\n\nGenerate exactly ${count} distinct replies in ${values.language}. Return only publishable reply text, each reply in its own fenced code block. No numbering or explanation outside the blocks.`;
}
export function commentOptions(text: string): string[] {
  const blocks = [...text.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)]
    .map((m) => m[1]!.trim())
    .filter(Boolean);
  const numbered = text
    .trim()
    .split(/(?:^|\n)\s*\d+[.)、]\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return (
    blocks.length
      ? blocks
      : /^\s*\d+[.)、]\s+/.test(text) && numbered.length > 1
        ? numbered
        : [text.trim()]
  )
    .filter(Boolean)
    .slice(0, 30);
}
