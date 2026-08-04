export type HealCategory =
  | "API"
  | "UI"
  | "CRASH"
  | "PERFORMANCE"
  | "PLAYER"
  | "PLAYBACK"
  | "NAV"
  | "AD"
  | "DATA";

export type HealLevel = "info" | "warn" | "error";

export type HealLogEntry = {
  id: string;
  ts: number;
  level: HealLevel;
  category: HealCategory;
  message: string;
  context?: Record<string, unknown>;
};

export type PlayerGuardInput = {
  id?: string | null;
  type?: string | null;
  sourceUrl?: string | null;
};
