export interface FilterRule {
  id: string;
  label: string;
  terms: string[];
  match: "any" | "all";
  severity: 1 | 2 | 3;
  enabled: boolean;
}
export interface FilteringSettings {
  enabled: boolean;
  strength: "loose" | "standard" | "strict";
  whitelist: string[];
  blacklist: string[];
  customRules: FilterRule[];
  importedRules: FilterRule[];
  disabledBuiltinIds: string[];
  importedAt: number | null;
}
export interface Palette {
  id: string;
  name: string;
  paper: string;
  ink: string;
  accent: string;
}
export interface AppearanceSettings {
  selected: string;
  custom: Palette[];
}
export interface MonitoringSettings {
  enabled: boolean;
  accounts: string[];
  keywords: string[];
  minViews: number;
  minVelocity: number;
  repeatPercent?: number;
  targets?: {
    kind: "account" | "keyword";
    value: string;
    minViews: number;
    minVelocity: number;
  }[];
}
export interface NotificationSettings {
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  mergeMinutes: number;
  cooldownMinutes: number;
}
export interface BarkSettings {
  enabled: boolean;
  server: string;
  deviceKey: string;
}
export interface MonitorHit {
  id: string;
  account: string;
  author: { name: string; handle: string };
  url: string;
  views: number | null;
  velocity: number | null;
  reasons: string[];
  at: number;
  observedAt?: number;
}
export type PushStatus =
  | "off"
  | "sent"
  | "failed"
  | "permission"
  | "limited"
  | "queued"
  | "quiet"
  | "backoff";
export interface MonitorEvent extends MonitorHit {
  key: string;
  pushStatus: PushStatus;
  pushedAt: number | null;
  dueAt?: number;
}
