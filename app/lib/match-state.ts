export type MatchBucket = "live" | "upcoming" | "finished";
export type MatchLifecycleStatus = "upcoming" | "live" | "halftime" | "finished" | "postponed" | "cancelled" | "delayed";
export type DomainMatchStatus = "scheduled" | "live" | "halftime" | "finished" | "postponed" | "cancelled" | "delayed";

const LIVE_TOKENS = new Set([
  "live", "in", "inprogress", "in_progress", "1h", "2h", "et", "aet", "p", "pen", "pens", "extra_time",
]);
const HALFTIME_TOKENS = new Set(["ht", "halftime", "half_time", "half"]);
const FINISHED_TOKENS = new Set(["finished", "ft", "fulltime", "full_time", "final", "post", "postgame", "ended", "done"]);
const UPCOMING_TOKENS = new Set(["scheduled", "upcoming", "not_started", "notstarted", "pre", "tbd"]);
const POSTPONED_TOKENS = new Set(["postponed", "ppd"]);
const CANCELLED_TOKENS = new Set(["cancelled", "canceled", "abandoned"]);
const DELAYED_TOKENS = new Set(["delayed", "delay", "suspended", "interrupted"]);

function normalizeToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseMinute(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const token = String(value || "").trim();
  if (!token) return null;
  const mm = token.match(/\d{1,3}/);
  if (!mm) return null;
  const parsed = Number(mm[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStartMs(value: unknown): number | null {
  const token = String(value || "").trim();
  if (!token) return null;
  const parsed = Date.parse(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFiniteScore(homeScore: unknown, awayScore: unknown): boolean {
  const h = Number(homeScore ?? NaN);
  const a = Number(awayScore ?? NaN);
  return Number.isFinite(h) && Number.isFinite(a);
}

export function resolveMatchStatus(input: {
  status?: unknown;
  detail?: unknown;
  minute?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  startDate?: unknown;
  nowMs?: number;
}): MatchLifecycleStatus {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const status = normalizeToken(input.status);
  const detail = normalizeToken(input.detail);
  const minute = parseMinute(input.minute);
  const startMs = parseStartMs(input.startDate);
  const scoreKnown = hasFiniteScore(input.homeScore, input.awayScore);

  if (CANCELLED_TOKENS.has(status) || CANCELLED_TOKENS.has(detail)) return "cancelled";
  if (POSTPONED_TOKENS.has(status) || POSTPONED_TOKENS.has(detail)) return "postponed";
  if (DELAYED_TOKENS.has(status) || DELAYED_TOKENS.has(detail)) return "delayed";
  if (FINISHED_TOKENS.has(status) || FINISHED_TOKENS.has(detail)) return "finished";
  if (HALFTIME_TOKENS.has(status) || HALFTIME_TOKENS.has(detail)) return "halftime";
  if (LIVE_TOKENS.has(status) || LIVE_TOKENS.has(detail)) return "live";
  if (UPCOMING_TOKENS.has(status) || UPCOMING_TOKENS.has(detail)) return "upcoming";

  // Heuristic fallback for missing upstream status.
  // Never classify as live after realistic match window has passed.
  if (startMs != null) {
    const minsFromStart = (nowMs - startMs) / 60000;
    if (minsFromStart < -2) return "upcoming";
    if (minsFromStart > 210) return "finished";
    if (minute != null && minute >= 105) return "finished";
    if (minute != null && minute >= 45 && minute <= 60) return "halftime";
    if (minute != null && minute > 0 && minsFromStart <= 210) return "live";
    if (scoreKnown && minsFromStart > 130) return "finished";
    if (minsFromStart >= 0 && minsFromStart <= 130) return "live";
    return "upcoming";
  }

  if (minute != null && minute >= 105) return "finished";
  if (minute != null && minute >= 45 && minute <= 60) return "halftime";
  if (minute != null && minute > 0) return "live";
  return "upcoming";
}

export function resolveMatchBucket(input: {
  status?: unknown;
  detail?: unknown;
  minute?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  startDate?: unknown;
}): MatchBucket {
  const status = resolveMatchStatus(input);
  if (status === "finished" || status === "cancelled" || status === "postponed") return "finished";
  if (status === "live" || status === "halftime" || status === "delayed") return "live";
  return "upcoming";
}

export function dedupeMatchesById<T extends { id?: unknown }>(matches: T[]): T[] {
  const map = new Map<string, T>();
  for (const match of matches || []) {
    const id = String(match?.id || "").trim();
    if (!id) continue;
    map.set(id, match);
  }
  return Array.from(map.values());
}

export function partitionMatches<T extends {
  id?: unknown;
  status?: unknown;
  detail?: unknown;
  minute?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  startDate?: unknown;
}>(source: T[]): { live: T[]; upcoming: T[]; finished: T[] } {
  const unique = dedupeMatchesById(source || []);
  const live: T[] = [];
  const upcoming: T[] = [];
  const finished: T[] = [];

  for (const match of unique) {
    const bucket = resolveMatchBucket(match);
    if (bucket === "live") {
      live.push({ ...match, status: "live" });
      continue;
    }
    if (bucket === "finished") {
      finished.push({ ...match, status: "finished" });
      continue;
    }
    upcoming.push({ ...match, status: "upcoming" });
  }

  return { live, upcoming, finished };
}

export function normalizeStatusLabel(status: unknown): "live" | "upcoming" | "finished" {
  return resolveMatchBucket({ status });
}

export function normalizeDomainMatchStatus(input: {
  status?: unknown;
  detail?: unknown;
  minute?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  startDate?: unknown;
}): DomainMatchStatus {
  const resolved = resolveMatchStatus(input);
  if (resolved === "upcoming") return "scheduled";
  return resolved;
}
