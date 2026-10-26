import type {
  AppearanceSettings,
  BarkSettings,
  FilteringSettings,
  MonitoringSettings,
  NotificationSettings,
} from "./features";
import type { AiSettings } from "./ai";
export type Language = "en" | "zh" | "ja";
export type Count = number | null;
export interface Author {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
}
export interface Tweet {
  id: string;
  author: Author;
  text: string;
  createdAt: number | null;
  url: string;
  counts: {
    views: Count;
    likes: Count;
    reposts: Count;
    replies: Count;
    bookmarks: Count;
  };
  photos: string[];
  observedAt: number;
  // The view count's own reading time; unrelated DOM scans must not refresh it.
  viewsObservedAt?: number;
  complete: boolean;
  source: "graphql" | "page";
  replyTo?: string | null;
}
export type Column = "post" | "views" | "speed";
export type RankingField =
  | "rank"
  | "tier"
  | "username"
  | "preview"
  | "views"
  | "speed";
export type PageScope = "home" | "list" | "profile" | "detail";
export interface Settings {
  version: 1;
  language: Language;
  theme: "auto" | "light" | "dark";
  rising: number;
  viral: number;
  badges: boolean;
  panel: boolean;
  images: boolean;
  position: { x: number; y: number } | null;
  columns: Column[];
  rankingLimit: number;
  hotOnly: boolean;
  minimumViews: number;
  rankingScopes: PageScope[];
  edgeHide: boolean;
  dock: "left" | "right" | null;
  rankingFields: Record<RankingField, boolean>;
  template: string;
  ai: AiSettings;
  filtering: FilteringSettings;
  appearance: AppearanceSettings;
  monitoring: MonitoringSettings;
  bark: BarkSettings;
  notifications: NotificationSettings;
  columnRules: Record<
    string,
    { rankingLimit: number; minimumViews: number; monitor: boolean }
  >;
}
export interface RankedTweet extends Tweet {
  average: number | null;
  growth: number | null;
  tier: "normal" | "rising" | "viral";
}
export type Relation =
  | { kind: "repost"; author: Author }
  | { kind: "quote"; author: Author; tweet: Tweet };
export interface GraphPage {
  relations: Relation[];
  cursor: string | null;
  observedAt: number;
}
export interface Capabilities {
  reposts: boolean;
  quotes: boolean;
  grok: boolean;
  temporary: boolean;
}
export interface PageSnapshot {
  tweets: Tweet[];
  graph?: { id: string; kind: "repost" | "quote"; page: GraphPage };
  capabilities: Capabilities;
}
export type Command =
  | { type: "capabilities" }
  | { type: "reset" }
  | {
      type: "graph";
      tweetId: string;
      kind: "repost" | "quote";
      cursor?: string;
    }
  | { type: "grok"; prompt: string; temporary: boolean }
  | { type: "ai"; prompt: string }
  | { type: "cancel"; target: string };
export type Reply =
  | { capabilities: Capabilities }
  | { page: GraphPage }
  | { text: string };
export interface PageTransport {
  request(command: Command, signal?: AbortSignal): Promise<Reply>;
}
