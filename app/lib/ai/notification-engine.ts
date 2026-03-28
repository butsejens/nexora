import { cacheGetStale, cacheSet } from "@/lib/services/cache-service";
import { pushMatchNotification } from "@/lib/match-notifications";

export type AlertPriority = "priority" | "silent";
export type AlertType = "goal" | "match_start" | "upset" | "ai_match_pick" | "media_release";

export type SmartAlert = {
  id: string;
  type: AlertType;
  priority: AlertPriority;
  title: string;
  body: string;
  createdAt: string;
  route?: string;
  params?: Record<string, string>;
};

export type NotificationEngineInput = {
  notifications: {
    matches?: boolean;
    goals?: boolean;
    news?: boolean;
  };
  followedTeamNames: string[];
  trackedMatches: {
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    status?: string;
    homeScore?: number;
    awayScore?: number;
    espnLeague?: string;
  }[];
  rankedMatchPick?: {
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    league?: string;
  } | null;
  releases?: { id?: string | number; title?: string; year?: number }[];
};

const ALERTS_KEY = "ai:smart-alerts:v1";
const SNAPSHOTS_KEY = "ai:smart-alert-snapshots:v1";

function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function alertId(type: AlertType, key: string): string {
  return `${type}:${key}`;
}

async function loadSnapshots() {
  return (await cacheGetStale<Record<string, { status: string; homeScore: number; awayScore: number }>>(SNAPSHOTS_KEY)) || {};
}

async function saveSnapshots(value: Record<string, { status: string; homeScore: number; awayScore: number }>) {
  await cacheSet(SNAPSHOTS_KEY, value, 0);
}

export async function loadSmartAlerts(): Promise<SmartAlert[]> {
  return (await cacheGetStale<SmartAlert[]>(ALERTS_KEY)) || [];
}

export async function runNotificationEngine(input: NotificationEngineInput): Promise<SmartAlert[]> {
  const alerts = await loadSmartAlerts();
  const snapshots = await loadSnapshots();
  const nextAlerts: SmartAlert[] = [...alerts];
  const followedTeams = input.followedTeamNames.map(normalize).filter(Boolean);

  const upsertAlert = (alert: SmartAlert) => {
    if (nextAlerts.some((existing) => existing.id === alert.id)) return;
    nextAlerts.unshift(alert);
  };

  for (const match of input.trackedMatches) {
    const key = String(match.matchId || "");
    if (!key) continue;
    const previous = snapshots[key];
    const current = {
      status: normalize(match.status || ""),
      homeScore: Number(match.homeScore || 0),
      awayScore: Number(match.awayScore || 0),
    };

    const home = String(match.homeTeam || "Home");
    const away = String(match.awayTeam || "Away");
    const watchedByFollow = followedTeams.some((team) => normalize(home).includes(team) || normalize(away).includes(team));

    if (input.notifications.matches && previous && previous.status !== "live" && current.status === "live") {
      upsertAlert({
        id: alertId("match_start", key),
        type: "match_start",
        priority: watchedByFollow ? "priority" : "silent",
        title: "Match gestart",
        body: `${home} - ${away} is live.`,
        createdAt: new Date().toISOString(),
        route: "/match-detail",
        params: { matchId: key, espnLeague: String(match.espnLeague || "") },
      });
    }

    const scoreChanged = previous && (previous.homeScore !== current.homeScore || previous.awayScore !== current.awayScore);
    if (input.notifications.goals && scoreChanged && watchedByFollow) {
      const scorer = current.homeScore > previous.homeScore ? home : away;
      upsertAlert({
        id: alertId("goal", `${key}:${current.homeScore}-${current.awayScore}`),
        type: "goal",
        priority: "priority",
        title: "Goal alert",
        body: `${scorer} scoort: ${home} ${current.homeScore}-${current.awayScore} ${away}`,
        createdAt: new Date().toISOString(),
        route: "/match-detail",
        params: { matchId: key, espnLeague: String(match.espnLeague || "") },
      });
    }

    if (current.status === "live" && Math.abs(current.homeScore - current.awayScore) <= 1) {
      upsertAlert({
        id: alertId("upset", `${key}:${current.homeScore}-${current.awayScore}`),
        type: "upset",
        priority: watchedByFollow ? "priority" : "silent",
        title: "Upset alert",
        body: `${home} - ${away} blijft volledig open (${current.homeScore}-${current.awayScore}).`,
        createdAt: new Date().toISOString(),
        route: "/match-detail",
        params: { matchId: key, espnLeague: String(match.espnLeague || "") },
      });
    }

    snapshots[key] = current;
  }

  if (input.rankedMatchPick) {
    const pick = input.rankedMatchPick;
    upsertAlert({
      id: alertId("ai_match_pick", String(pick.matchId)),
      type: "ai_match_pick",
      priority: "silent",
      title: "AI Matchday Pick",
      body: `${pick.homeTeam} - ${pick.awayTeam}${pick.league ? ` (${pick.league})` : ""}`,
      createdAt: new Date().toISOString(),
      route: "/match-detail",
      params: { matchId: String(pick.matchId) },
    });
  }

  if (input.notifications.news) {
    for (const release of (input.releases || []).slice(0, 3)) {
      const title = String(release?.title || "").trim();
      if (!title) continue;
      upsertAlert({
        id: alertId("media_release", String(release?.id || title)),
        type: "media_release",
        priority: "silent",
        title: "Nieuwe release",
        body: release?.year ? `${title} (${release.year}) staat nu in je feed.` : `${title} staat nu in je feed.`,
        createdAt: new Date().toISOString(),
        route: "/films-series",
      });
    }
  }

  const capped = nextAlerts.slice(0, 80);
  await cacheSet(ALERTS_KEY, capped, 0);
  await saveSnapshots(snapshots);

  const pushCandidates = capped.filter((item) => item.priority === "priority").slice(0, 2);
  await Promise.allSettled(pushCandidates.map((alert) => pushMatchNotification(alert.title, alert.body, alert.params)));

  return capped;
}
