import type { FilteringSettings, FilterRule } from "./features";
import type { Language, Tweet } from "./types";

export const RULE_VERSION = "2026.10.24";
const catalog: [string, string, string, string[], 1 | 2 | 3][] = [
  [
    "成人资源引流",
    "Adult-content solicitation",
    "成人コンテンツへの誘導",
    [
      "免费看片",
      "同城约炮",
      "裸聊加我",
      "adult content in bio",
      "成人動画はプロフ",
    ],
    3,
  ],
  [
    "付费私密资源",
    "Paid private content",
    "有料コンテンツへの誘導",
    ["私密资源私信", "付费解锁福利", "premium content dm"],
    2,
  ],
  [
    "交友联系方式引流",
    "Solicited contact",
    "連絡先への誘導",
    ["寂寞加微信", "同城加我约", "meet girls in bio"],
    2,
  ],
  [
    "群组资源引流",
    "Resource-group promotion",
    "グループへの誘導",
    ["福利群加我", "资源群私信", "vip group dm me"],
    2,
  ],
  [
    "主页资源诱导",
    "Profile-content bait",
    "プロフィールへの誘導",
    ["更多福利看主页", "完整版主页链接", "full video in my bio"],
    2,
  ],
  [
    "博彩推广",
    "Gambling promotion",
    "ギャンブル勧誘",
    ["包赢投注", "博彩开户链接", "guaranteed betting wins"],
    2,
  ],
  [
    "保证收益",
    "Guaranteed-return pitch",
    "利益保証の勧誘",
    ["保证收益加我", "稳赚不赔私信", "guaranteed returns dm"],
    2,
  ],
  [
    "交易带单",
    "Trading-signal promotion",
    "投資シグナル勧誘",
    ["带单加群", "合约跟单私信", "trading signals in bio"],
    2,
  ],
  [
    "虚假空投",
    "Airdrop promotion",
    "エアドロップ誘導",
    ["领取空投链接", "claim your free airdrop now", "エアドロップはプロフ"],
    2,
  ],
  [
    "钱包诱导",
    "Wallet-transfer solicitation",
    "ウォレット送金誘導",
    ["转币验证钱包", "send crypto to verify", "connect wallet to claim prize"],
    2,
  ],
  [
    "刷量广告",
    "Fake-engagement services",
    "反応数の販売",
    ["买粉私信", "刷赞联系", "buy followers dm"],
    2,
  ],
  [
    "推广联系方式",
    "Advertising solicitation",
    "広告募集",
    ["广告合作私信", "推广联系电报", "promotion services dm"],
    2,
  ],
  [
    "优惠链接推广",
    "Coupon-link promotion",
    "クーポン誘導",
    ["领券链接在主页", "discount code in my bio", "クーポンはプロフィール"],
    2,
  ],
  [
    "客服账号引流",
    "Support-account redirection",
    "サポートへの偽装誘導",
    ["联系客服电报", "dm our support wallet", "contact support on telegram"],
    2,
  ],
  [
    "中奖收费",
    "Prize-fee solicitation",
    "当選手数料の請求",
    ["中奖先付手续费", "pay fee to claim prize", "当選手数料を送金"],
    2,
  ],
  [
    "私信领取",
    "DM-to-claim bait",
    "DMでの受取誘導",
    ["私信领取礼包", "dm me to claim reward", "DMで特典を受け取る"],
    2,
  ],
  [
    "求转发后领取",
    "Repost-to-claim bait",
    "リポストでの受取誘導",
    ["转发后私信领取", "repost and dm to claim", "リポストしてDMで受取"],
    2,
  ],
  [
    "互赞互评",
    "Engagement exchange",
    "反応の交換",
    ["互赞互评加我", "like for like dm", "相互いいね募集"],
    2,
  ],
  [
    "无关评论推广",
    "Comment-promotion pitch",
    "コメント広告",
    ["借楼推广加我", "借楼广告联系", "sorry for spam check my bio"],
    2,
  ],
  [
    "账号交易",
    "Account-sale promotion",
    "アカウント販売",
    ["出售账号联系", "账号批发私信", "accounts for sale dm"],
    2,
  ],
  [
    "成人直播导流",
    "Adult livestream promotion",
    "成人配信誘導",
    ["福利视频直播间", "成人直播加群", "adult live show link in bio"],
    2,
  ],
  [
    "付费课程导流",
    "Unsolicited course pitch",
    "講座の勧誘",
    ["赚钱课程私信", "暴富课程加我", "get rich course dm"],
    2,
  ],
  [
    "虚假工作机会",
    "Recruitment-fee solicitation",
    "求人手数料の誘導",
    ["兼职先交押金", "job requires upfront payment", "仕事の前に保証金"],
    2,
  ],
  [
    "关注诱导",
    "Follow bait",
    "フォロー誘導",
    ["关注我看更多", "follow me for more", "続きはフォロー"],
    1,
  ],
  [
    "主页泛引流",
    "Generic profile bait",
    "一般的なプロフィール誘導",
    ["点我主页", "check my bio", "プロフィールを見て"],
    1,
  ],
  [
    "回复数字诱导",
    "Reply-token bait",
    "定型返信の誘導",
    ["回复1领取", "comment yes to receive", "欲しい人は1と返信"],
    1,
  ],
];
export const BUILTIN_RULES: FilterRule[] = catalog.map(
  ([label, , , terms, severity], index) => ({
    id: `builtin-${index + 1}`,
    label,
    terms,
    severity,
    match: "any",
    enabled: true,
  }),
);
export const ruleLabel = (rule: FilterRule, language: Language) => {
  const index = BUILTIN_RULES.findIndex((r) => r.id === rule.id);
  return index < 0
    ? rule.label
    : catalog[index]![language === "en" ? 1 : language === "ja" ? 2 : 0];
};
export const fold = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
export function parseAccounts(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,，]+/)
        .map((s) => s.trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}
export function validAccounts(values: string[]): boolean {
  return (
    values.length <= 200 && values.every((v) => /^[a-zA-Z0-9_]{1,50}$/.test(v))
  );
}
export function defaultFiltering(): FilteringSettings {
  return {
    enabled: false,
    strength: "standard",
    whitelist: [],
    blacklist: [],
    customRules: [],
    importedRules: [],
    disabledBuiltinIds: [],
    importedAt: null,
  };
}
export function validateRule(
  value: unknown,
  prefix: string,
): FilterRule | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<FilterRule>;
  if (
    typeof v.label !== "string" ||
    !v.label.trim() ||
    v.label.length > 100 ||
    !Array.isArray(v.terms) ||
    !v.terms.length ||
    v.terms.length > 20 ||
    !v.terms.every((t) => typeof t === "string" && t.trim() && t.length <= 128)
  )
    return null;
  return {
    id: `${prefix}:${
      typeof v.id === "string"
        ? v.id
            .split(":")
            .at(-1)!
            .replace(/[^a-zA-Z0-9_-]/g, "")
            .slice(-80)
        : "rule"
    }`,
    label: v.label.trim(),
    terms: [...new Set(v.terms.map((t) => t.trim()))],
    match: v.match === "all" ? "all" : "any",
    severity: v.severity === 1 || v.severity === 3 ? v.severity : 2,
    enabled: v.enabled !== false,
  };
}
export function validateFiltering(value: unknown): FilteringSettings {
  const d = defaultFiltering();
  if (!value || typeof value !== "object") return d;
  const v = value as Partial<FilteringSettings>;
  const accounts = (a: unknown) =>
    Array.isArray(a)
      ? [
          ...new Set(
            a
              .filter(
                (s): s is string =>
                  typeof s === "string" && /^[\w]{1,50}$/.test(s),
              )
              .map((s) => s.toLowerCase()),
          ),
        ].slice(0, 200)
      : [];
  const rules = (a: unknown, prefix: string) =>
    Array.isArray(a)
      ? a.slice(0, 100).flatMap((r) => validateRule(r, prefix) ?? [])
      : [];
  return {
    ...d,
    enabled: v.enabled === true,
    strength:
      v.strength === "loose" || v.strength === "strict"
        ? v.strength
        : "standard",
    whitelist: accounts(v.whitelist),
    blacklist: accounts(v.blacklist),
    customRules: rules(v.customRules, "custom"),
    importedRules: rules(v.importedRules, "import"),
    disabledBuiltinIds: Array.isArray(v.disabledBuiltinIds)
      ? v.disabledBuiltinIds.filter((id) =>
          BUILTIN_RULES.some((r) => r.id === id),
        )
      : [],
    importedAt:
      typeof v.importedAt === "number" && Number.isFinite(v.importedAt)
        ? v.importedAt
        : null,
  };
}
export function activeRules(settings: FilteringSettings): FilterRule[] {
  const threshold = { loose: 3, standard: 2, strict: 1 }[settings.strength];
  return [
    ...BUILTIN_RULES.filter((r) => !settings.disabledBuiltinIds.includes(r.id)),
    ...settings.importedRules,
    ...settings.customRules,
  ].filter((r) => r.enabled && r.severity >= threshold);
}
export function filterReason(
  tweet: Tweet,
  settings: FilteringSettings,
): string | null {
  if (!settings.enabled) return null;
  const handle = tweet.author.handle.toLowerCase();
  if (settings.whitelist.includes(handle)) return null;
  if (settings.blacklist.includes(handle)) return "blacklist";
  const text = fold(tweet.text);
  return (
    activeRules(settings).find((rule) =>
      rule.match === "all"
        ? rule.terms.every((term) => text.includes(fold(term)))
        : rule.terms.some((term) => text.includes(fold(term))),
    )?.id ?? null
  );
}
export function detailTweetId(url: string): string | null {
  try {
    return (
      new URL(url).pathname.match(
        /^\/(?:\w+\/status|i\/web\/status)\/(\d+)/,
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}
export function importRules(text: string): FilterRule[] {
  if (new TextEncoder().encode(text).byteLength > 100000)
    throw new Error("invalidRules");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("invalidRules");
  }
  if (
    data?.version !== 1 ||
    !Array.isArray(data.rules) ||
    data.rules.length > 100
  )
    throw new Error("invalidRules");
  const rules = data.rules.map((r: unknown) => validateRule(r, "import"));
  if (
    rules.some((r: FilterRule | null) => !r) ||
    new Set(rules.map((r: FilterRule) => r?.id)).size !== rules.length
  )
    throw new Error("invalidRules");
  return rules as FilterRule[];
}
