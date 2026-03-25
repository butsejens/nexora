export type MatchBucket = "live" | "upcoming" | "finished";
export type DomainMatchStatus = "scheduled" | "live" | "halftime" | "finished";

const LIVE_STATES = new Set([
  "live",
  "in",
  "inprogress",
  "in_progress",
  "ht",
  "halftime",
  "half",
  "1h",
  "2h",
  "et",
  "aet",
  "p",
  "pen",
  "pens",
  "extra_time",
]);

const FINISHED_STATES = new Set([
  "finished",
  "ft",
  "fulltime",
  "full_time",
  "final",
  "post",
  "postgame",
  "ended",
  "done",
]);

const NON_START_STATES = new Set([
  "scheduled",
  "upcoming",
  "not_started",
  "notstarted",
  "pre",
  "tbd",
]);

const HALFTIME_TOKENS = new Set([
  "ht",
  "halftime",
  "half_time",
  "half",
]);

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

function isHalftime(status?: unknown, detail?: unknown): boolean {
  const statusToken = normalizeToken(status);
  const detailToken = normalizeToken(detail);
  return HALFTIME_TOKENS.has(statusToken) || HALFTIME_TOKENS.has(detailToken);
}

export function resolveMatchBucket(input: {
  status?: unknown;
  detail?: unknown;
  minute?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  startDate?: unknown;
}): MatchBucket {
  const status = normalizeToken(input.status);
  const detail = normalizeToken(input.detail);
  const minute = parseMinute(input.minute);
  const homeScore = Number(input.homeScore ?? NaN);
  const awayScore = Number(input.awayScore ?? NaN);

  if (LIVE_STATES.has(status) || LIVE_STATES.has(detail)) return "live";
  if (FINISHED_STATES.has(status) || FINISHED_STATES.has(detail)) return "finished";
  if (NON_START_STATES.has(status) || NON_START_STATES.has(detail)) return "upcoming";

  if (minute != null && minute > 0) {
    return "live";
  }

  if (Number.isFinite(homeScore) && Number.isFinite(awayScore) && (homeScore > 0 || awayScore > 0)) {
    const startTime = String(input.startDate || "").trim();
    if (startTime) {
      const startMs = Date.parse(startTime);
      if (Number.isFinite(startMs) && startMs < Date.now() - 2 * 60 * 60 * 1000) {
        return "finished";
      }
    }
  }

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
}>(
  source: T[],
): { live: T[]; upcoming: T[]; finished: T[] } {
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
  const bucket = resolveMatchBucket(input);
  if (bucket === "finished") return "finished";
  if (bucket === "live") return isHalftime(input.status, input.detail) ? "halftime" : "live";
  return "scheduled";
}
