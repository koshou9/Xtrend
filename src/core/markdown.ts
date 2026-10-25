import type { Tweet, Language } from "./types";
const escape = (s: string) => s.replace(/([\\`*_{}\[\]<>])/g, "\\$1");
export function toMarkdown(tweet: Tweet, language: Language = "en"): string {
  const labels = {
    en: [
      "Date unavailable",
      "View original",
      "Incomplete text: only the visible excerpt was available.",
    ],
    zh: ["日期未知", "查看原文", "正文不完整：仅取得页面摘录。"],
    ja: [
      "日時不明",
      "元のポスト",
      "本文が不完全です。表示された抜粋のみ取得しました。",
    ],
  }[language];
  const date =
    tweet.createdAt === null
      ? labels[0]
      : new Date(tweet.createdAt).toISOString();
  const body = escape(tweet.text)
    .replace(/^(\s{0,3})([#+\-])(?=\s)/gm, "$1\\$2")
    .replace(/^(\s{0,3}\d+)([.)])(?=\s)/gm, "$1\\$2");
  return `**${escape(tweet.author.name)} (@${escape(tweet.author.handle)})**\n\n${date}\n\n[${labels[1]}](${tweet.url})\n\n${body}${tweet.complete ? "" : `\n\n> ${labels[2]}`}\n`;
}
