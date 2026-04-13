import { cacheGetStale, cacheSet } from "@/lib/services/cache-service";

type MatchLike = Record<string, any>;

type MatchInteractionStore = {
  matchViews: Record<string, number>;
  teamViews: Record<string, number>;
  leagueViews: Record<string, number>;
};

export type RankedMatch = {
  match: MatchLike;
  score: number;
  isTrending: boolean;
  isUpsetPotential: boolean;
  reasons: string[];
};

export type RankMatchesInput = {
  matches: MatchLike[];
  favoriteTeams?: string[];
  preferredLeagues?: string[];
  interactions?: MatchInteractionStore | null;
  now?: Date;
};

const INTERACTIONS_KEY = "ai:match-interactions:v1";

function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function teamName(match: MatchLike, side: "home" | "away"): string {
  const direct = side === "home" ? match?.homeTeam : match?.awayTeam;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") {
    return String(direct?.name || direct?.displayName || "");
  }
  return "";
}

function scoreValue(match: MatchLike, side: "home" | "away"): number {
  const direct = Number(side === "home" ? match?.homeScore : match?.awayScore);
  if (Number.isFinite(direct)) return direct;
  const nested = Number(side === "home" ? match?.score?.home : match?.score?.away);
  return Number.isFinite(nested) ? nested : 0;
}

function startTime(match: MatchLike): number | null {
  const raw = String(match?.startTime || match?.startDate || "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function boostForKickoffWindow(match: MatchLike, nowMs: number): number {
  const ts = startTime(match);
  if (ts == null) return 0;
  const diffMin = Math.round((ts - nowMs) / 60000);
  if (diffMin < -150) return 0;
  if (diffMin <= 20 && diffMin >= -20) return 16;
  if (diffMin > 20 && diffMin <= 120) return 10;
  if (diffMin > 120 && diffMin <= 300) return 5;
  return 0;
}

function matchStatusScore(match: MatchLike): number {
  const status = normalize(match?.status);
  if (status.includes("live")) return 38;
  if (status.includes("half")) return 34;
  if (status.includes("upcoming") || status.includes("scheduled")) return 18;
  if (status.includes("finished")) return 8;
  return 10;
}

function interactionBoost(match: MatchLike, interactions: MatchInteractionStore | null | undefined): number {
  if (!interactions) return 0;
  const matchId = String(match?.id || "");
  const home = normalize(teamName(match, "home"));
  const away = normalize(teamName(match, "away"));
  const league = normalize(match?.league || match?.competition?.displayName || match?.competition?.name);

  return (
    Math.min(12, Number(interactions.matchViews?.[matchId] || 0) * 2) +
    Math.min(10, Number(interactions.teamViews?.[home] || 0) * 1.4) +
    Math.min(10, Number(interactions.teamViews?.[away] || 0) * 1.4) +
    Math.min(8, Number(interactions.leagueViews?.[league] || 0) * 1.2)
  );
}

function preferenceBoost(match: MatchLike, favoriteTeams: string[], preferredLeagues: string[]) {
  const reasons: string[] = [];
  let score = 0;

  const home = normalize(teamName(match, "home"));
  const away = normalize(teamName(match, "away"));
  const league = normalize(match?.league || match?.competition?.displayName || match?.competition?.name);

  const followsHome = favoriteTeams.some((team) => home.includes(team));
  const followsAway = favoriteTeams.some((team) => away.includes(team));
  if (followsHome || followsAway) {
    score += 26;
    reasons.push("Favorite team");
  }

  if (preferredLeagues.some((entry) => league.includes(entry))) {
    score += 12;
    reasons.push("Preferred league");
  }

  return { score, reasons };
}

function upsetPotential(match: MatchLike): boolean {
  const status = normalize(match?.status);
  if (!status.includes("live")) return false;
  const home = scoreValue(match, "home");
  const away = scoreValue(match, "away");
  const minute = Number(match?.minute || 0);
  const diff = Math.abs(home - away);
  return minute >= 65 && diff <= 1;
}

function isTrending(match: MatchLike): boolean {
  const status = normalize(match?.status);
  const minute = Number(match?.minute || 0);
  const diff = Math.abs(scoreValue(match, "home") - scoreValue(match, "away"));
  return status.includes("live") && minute >= 30 && diff <= 1;
}

export async function loadMatchInteractions(): Promise<MatchInteractionStore> {
  return (await cacheGetStale<MatchInteractionStore>(INTERACTIONS_KEY)) || {
    matchViews: {},
    teamViews: {},
    leagueViews: {},
  };
}

export async function recordMatchInteraction(match: MatchLike): Promise<void> {
  const current = await loadMatchInteractions();
  const matchId = String(match?.id || "");
  const home = normalize(teamName(match, "home"));
  const away = normalize(teamName(match, "away"));
  const league = normalize(match?.league || match?.competition?.displayName || match?.competition?.name);

  if (matchId) current.matchViews[matchId] = Number(current.matchViews[matchId] || 0) + 1;
  if (home) current.teamViews[home] = Number(current.teamViews[home] || 0) + 1;
  if (away) current.teamViews[away] = Number(current.teamViews[away] || 0) + 1;
  if (league) current.leagueViews[league] = Number(current.leagueViews[league] || 0) + 1;

  await cacheSet(INTERACTIONS_KEY, current, 0);
}

export function rankMatchesForUser(input: RankMatchesInput): RankedMatch[] {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const favoriteTeams = (input.favoriteTeams || []).map(normalize).filter(Boolean);
  const preferredLeagues = (input.preferredLeagues || []).map(normalize).filter(Boolean);

  return (Array.isArray(input.matches) ? input.matches : [])
    .map((match) => {
      const reasons: string[] = [];
      const trend = isTrending(match);
      const upset = upsetPotential(match);
      let score = matchStatusScore(match) + boostForKickoffWindow(match, nowMs);

      const preference = preferenceBoost(match, favoriteTeams, preferredLeagues);
      score += preference.score;
      reasons.push(...preference.reasons);

      const engagement = interactionBoost(match, input.interactions);
      if (engagement > 0) reasons.push("Based on your watch behavior");
      score += engagement;

      if (trend) {
        score += 14;
        reasons.push("Trending live match");
      }
      if (upset) {
        score += 12;
        reasons.push("Upset potential");
      }

      if (!reasons.length) reasons.push("High matchday relevance");

      return {
        match,
        score,
        isTrending: trend,
        isUpsetPotential: upset,
        reasons: reasons.slice(0, 3),
      };
    })
    .sort((left, right) => right.score - left.score);
}
