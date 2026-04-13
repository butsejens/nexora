/**
 * Nexora – Smart Feed Service
 *
 * Builds a personalized, ranked content feed from multiple data sources:
 *   - Live & upcoming matches (prioritized by AI match ranking)
 *   - AI insights (upset alerts, hot teams, match intelligence)
 *   - Trending teams from followed list
 *   - Player highlights (top scorers from major leagues)
 *   - Match posters (high-rated upcoming matches)
 *   - Live match intelligence cards
 *
 * The feed is assembled once per data refresh, sorted by a composite
 * relevance score that factors in: liveness, personalization, recency,
 * and content diversity.
 */

import { rankMatchesForUser } from "@/lib/ai/match-ranking-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedItemType =
  | "live_match"
  | "top_match"
  | "ai_insight"
  | "trending_team"
  | "player_highlight"
  | "match_poster"
  | "upset_alert"
  | "hot_team"
  | "section_header";

export type FeedItem = {
  id: string;
  type: FeedItemType;
  title: string;
  subtitle?: string;
  /** Composite relevance score (higher = more relevant) */
  score: number;
  /** Data payload — shape depends on type */
  data: Record<string, any>;
  /** Timestamp for ordering tiebreaks */
  timestamp: number;
};

export type SmartFeedInput = {
  /** All matches from the matchday API */
  matches: Record<string, any>[];
  /** User's followed team names (lowercased) */
  followedTeams: string[];
  /** User's followed match IDs */
  followedMatchIds: string[];
  /** Preferred league codes (e.g. ["eng.1", "bel.1"]) */
  preferredLeagues: string[];
  /** Top scorers data from major leagues */
  topScorers?: {
    name: string;
    team: string;
    goals: number;
    league: string;
    photo?: string;
    id?: string;
  }[];
  /** Highlight videos */
  highlights?: Record<string, any>[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(v: unknown): string {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function teamName(match: Record<string, any>, side: "home" | "away"): string {
  const val = match?.[`${side}Team`];
  if (typeof val === "string") return val;
  if (val && typeof val === "object")
    return String(val.name || val.displayName || "");
  return "";
}

function matchId(match: Record<string, any>): string {
  return String(match?.id || "").trim();
}

function isLive(match: Record<string, any>): boolean {
  const status = norm(match?.status);
  return (
    status.includes("live") ||
    status.includes("in_progress") ||
    status.includes("halftime")
  );
}

function isUpcoming(match: Record<string, any>): boolean {
  const status = norm(match?.status);
  return (
    status.includes("upcoming") ||
    status.includes("scheduled") ||
    status.includes("pre")
  );
}

// ─── Feed Builder ─────────────────────────────────────────────────────────────

/**
 * Build a complete smart feed from available data sources.
 * Returns items sorted by composite score (highest first).
 */
export function buildSmartFeed(input: SmartFeedInput): FeedItem[] {
  const items: FeedItem[] = [];
  const now = Date.now();
  const followSet = new Set(input.followedTeams.map(norm));
  const followMatchSet = new Set(input.followedMatchIds);

  // ── 1. Rank all matches ─────────────────────────────────────────────────
  const ranked = rankMatchesForUser({
    matches: input.matches,
    favoriteTeams: input.followedTeams,
    preferredLeagues: input.preferredLeagues,
  });

  // ── 2. Live matches (highest priority) ──────────────────────────────────
  const liveMatches = ranked.filter((r) => isLive(r.match));
  for (const rm of liveMatches.slice(0, 8)) {
    const m = rm.match;
    const home = teamName(m, "home");
    const away = teamName(m, "away");
    const isFollowed =
      followSet.has(norm(home)) ||
      followSet.has(norm(away)) ||
      followMatchSet.has(matchId(m));
    const minute = m.minute || m.clock || "";

    items.push({
      id: `live:${matchId(m)}`,
      type: "live_match",
      title: `${home} vs ${away}`,
      subtitle: `LIVE ${minute}' · ${m.homeScore ?? 0}-${m.awayScore ?? 0}`,
      score: 100 + rm.score + (isFollowed ? 30 : 0),
      data: { match: m, ranked: rm, isFollowed },
      timestamp: now,
    });

    // Upset alert — if underdog is winning
    if (rm.isUpsetPotential) {
      items.push({
        id: `upset:${matchId(m)}`,
        type: "upset_alert",
        title: `Upset developing: ${home} vs ${away}`,
        subtitle: `${m.homeScore ?? 0}-${m.awayScore ?? 0} at ${minute}'`,
        score: 95 + (isFollowed ? 20 : 0),
        data: { match: m, reasons: rm.reasons },
        timestamp: now,
      });
    }
  }

  // ── 3. Top upcoming matches ─────────────────────────────────────────────
  const upcomingMatches = ranked.filter((r) => isUpcoming(r.match));
  for (const rm of upcomingMatches.slice(0, 10)) {
    const m = rm.match;
    const home = teamName(m, "home");
    const away = teamName(m, "away");
    const isFollowed =
      followSet.has(norm(home)) ||
      followSet.has(norm(away)) ||
      followMatchSet.has(matchId(m));

    items.push({
      id: `top:${matchId(m)}`,
      type: "top_match",
      title: `${home} vs ${away}`,
      subtitle: formatKickoff(m.startTime || m.startDate),
      score: 60 + rm.score * 0.6 + (isFollowed ? 25 : 0),
      data: { match: m, ranked: rm, isFollowed },
      timestamp: now,
    });

    // Match poster for high-rated matches
    if (rm.score >= 40) {
      items.push({
        id: `poster:${matchId(m)}`,
        type: "match_poster",
        title: `${home} vs ${away}`,
        subtitle: `Match Rating: ${Math.min(10, Math.round(rm.score / 8))}/10`,
        score: 50 + rm.score * 0.4,
        data: {
          match: m,
          ranked: rm,
          matchRating: Math.min(10, Math.round(rm.score / 8)),
        },
        timestamp: now,
      });
    }
  }

  // ── 4. Trending followed teams ──────────────────────────────────────────
  const teamMentions = new Map<string, number>();
  for (const rm of ranked) {
    const home = norm(teamName(rm.match, "home"));
    const away = norm(teamName(rm.match, "away"));
    if (followSet.has(home))
      teamMentions.set(home, (teamMentions.get(home) || 0) + rm.score);
    if (followSet.has(away))
      teamMentions.set(away, (teamMentions.get(away) || 0) + rm.score);
  }

  const trendingTeams = Array.from(teamMentions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  for (const [team, relevance] of trendingTeams) {
    const teamMatches = ranked.filter(
      (r) =>
        norm(teamName(r.match, "home")) === team ||
        norm(teamName(r.match, "away")) === team,
    );
    const nextMatch = teamMatches.find(
      (r) => isUpcoming(r.match) || isLive(r.match),
    );

    items.push({
      id: `trending:${team}`,
      type: "trending_team",
      title: input.followedTeams.find((t) => norm(t) === team) || team,
      subtitle: nextMatch
        ? `Next: ${teamName(nextMatch.match, "home")} vs ${teamName(nextMatch.match, "away")}`
        : `${teamMatches.length} matches today`,
      score: 40 + Math.min(30, relevance * 0.3),
      data: {
        teamName: team,
        matchCount: teamMatches.length,
        nextMatch: nextMatch?.match,
      },
      timestamp: now,
    });
  }

  // ── 5. Player highlights ────────────────────────────────────────────────
  if (input.topScorers?.length) {
    const followedScorers = input.topScorers.filter((p) =>
      followSet.has(norm(p.team)),
    );
    const topScorers =
      followedScorers.length >= 2 ? followedScorers : input.topScorers;

    for (const player of topScorers.slice(0, 5)) {
      items.push({
        id: `player:${player.id || player.name}`,
        type: "player_highlight",
        title: player.name,
        subtitle: `${player.goals} goals · ${player.team}`,
        score: 35 + (followSet.has(norm(player.team)) ? 15 : 0),
        data: { player },
        timestamp: now,
      });
    }
  }

  // ── 6. AI insights from match rankings ──────────────────────────────────
  const insightCandidates = ranked
    .filter((r) => r.reasons.length > 0 && r.score >= 30)
    .slice(0, 4);

  for (const rm of insightCandidates) {
    const m = rm.match;
    const home = teamName(m, "home");
    const away = teamName(m, "away");

    items.push({
      id: `insight:${matchId(m)}`,
      type: "ai_insight",
      title: `${home} vs ${away}`,
      subtitle: rm.reasons[0] || "AI analysis available",
      score: 30 + rm.score * 0.3,
      data: { match: m, reasons: rm.reasons, isTrending: rm.isTrending },
      timestamp: now,
    });
  }

  // ── 7. Hot team alerts ──────────────────────────────────────────────────
  const hotTeams = ranked.filter((r) => r.isTrending).slice(0, 3);

  for (const rm of hotTeams) {
    const m = rm.match;
    const home = teamName(m, "home");
    const away = teamName(m, "away");

    items.push({
      id: `hot:${matchId(m)}`,
      type: "hot_team",
      title: `Trending: ${home} vs ${away}`,
      subtitle:
        rm.reasons.find((r) => r.toLowerCase().includes("form")) ||
        "In excellent form",
      score:
        38 + (followSet.has(norm(home)) || followSet.has(norm(away)) ? 15 : 0),
      data: { match: m, reasons: rm.reasons },
      timestamp: now,
    });
  }

  // ── Sort and deduplicate ────────────────────────────────────────────────
  items.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // ── Inject section headers for visual grouping ──────────────────────────
  return injectSectionHeaders(deduped);
}

// ─── Section Headers ──────────────────────────────────────────────────────────

function injectSectionHeaders(items: FeedItem[]): FeedItem[] {
  const result: FeedItem[] = [];
  let lastType: FeedItemType | null = null;

  const SECTION_LABELS: Partial<Record<FeedItemType, string>> = {
    live_match: "Live Now",
    upset_alert: "Upset Alerts",
    top_match: "Top Matches",
    match_poster: "Must Watch",
    trending_team: "Your Teams",
    player_highlight: "Player Watch",
    ai_insight: "AI Insights",
    hot_team: "Trending",
  };

  for (const item of items) {
    if (item.type !== lastType && SECTION_LABELS[item.type]) {
      result.push({
        id: `header:${item.type}`,
        type: "section_header",
        title: SECTION_LABELS[item.type]!,
        score: item.score + 0.5,
        data: {},
        timestamp: item.timestamp,
      });
    }
    lastType = item.type;
    result.push(item);
  }

  return result;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatKickoff(value: unknown): string {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return "Kickoff TBD";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return isToday
    ? `Today ${time}`
    : `${d.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}
