import { useMemo } from "react";

type TeamSide = "home" | "away" | "center";

export type TimelineFilter = "all" | "goals" | "cards" | "subs" | "var" | "key";

export type TimelineEventItem = {
  id: string;
  kind: string;
  minuteValue: number;
  minuteLabel: string;
  phase: "first_half" | "half_time" | "second_half" | "extra_time" | "penalties" | "full_time" | "pre_match";
  side: TeamSide;
  teamName: string | null;
  title: string;
  description: string;
  secondary: string | null;
  filter: Exclude<TimelineFilter, "all"> | "other";
  isPhaseSeparator: boolean;
  isKeyMoment: boolean;
  raw: any;
};

export type LineupPlayer = {
  id: string;
  name: string;
  jersey: string;
  position: string;
  role: "GK" | "DEF" | "MID" | "ATT" | "UNK";
  isCaptain: boolean;
  isGoalkeeper: boolean;
  isStarter: boolean;
  photo?: string | null;
  subInMinute?: number;
  subOutMinute?: number;
  raw: any;
};

export type TeamLineupState = {
  teamName: string;
  formation: string | null;
  lineupState: "confirmed" | "expected" | "unavailable";
  starters: LineupPlayer[];
  bench: LineupPlayer[];
  allPlayers: LineupPlayer[];
};

export type LiveLineupChange = {
  id: string;
  minute: number;
  minuteLabel: string;
  side: TeamSide;
  teamName: string | null;
  playerIn: string | null;
  playerOut: string | null;
};

function stableId(parts: (string | number | null | undefined)[]): string {
  return parts.map((part) => String(part ?? "").trim().toLowerCase()).join("|");
}

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTeamName(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function sameTeamName(a: unknown, b: unknown): boolean {
  const aa = normalizeTeamName(a);
  const bb = normalizeTeamName(b);
  if (!aa || !bb) return false;
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

function parseMinute(raw: any, fallbackIndex = 0): number {
  const provided = toNum(raw?.minuteValue);
  if (provided != null && provided >= 0) return provided;

  const text = String(raw?.minute || raw?.time || "");
  const match = text.match(/(\d+)(?:\+(\d+))?/);
  if (!match) return fallbackIndex;
  const base = Number(match[1] || 0);
  const extra = Number(match[2] || 0);
  return base + (extra > 0 ? extra / 100 : 0);
}

function minuteLabel(raw: any, minuteValue: number): string {
  const rawLabel = String(raw?.minute || raw?.time || "").trim();
  if (rawLabel) return rawLabel.includes("'") ? rawLabel : `${rawLabel}'`;
  return `${Math.max(0, Math.floor(minuteValue))}'`;
}

function eventText(raw: any): string {
  return `${raw?.kind || raw?.type || ""} ${raw?.title || ""} ${raw?.description || raw?.detail || raw?.text || ""}`.toLowerCase();
}

function eventKind(raw: any): string {
  return String(raw?.kind || raw?.type || "event").toLowerCase();
}

function inferSide(raw: any, homeTeam: string, awayTeam: string): TeamSide {
  const side = String(raw?.side || "").toLowerCase();
  if (side === "home" || side === "away" || side === "center") return side as TeamSide;
  const team = String(raw?.team || raw?.teamName || "");
  if (sameTeamName(team, homeTeam)) return "home";
  if (sameTeamName(team, awayTeam)) return "away";
  return "center";
}

function inferPhase(kind: string, minute: number): TimelineEventItem["phase"] {
  if (kind.includes("kickoff")) return "pre_match";
  if (kind.includes("half") && kind.includes("time")) return "half_time";
  if (kind.includes("second")) return "second_half";
  if (kind.includes("extra")) return "extra_time";
  if (kind.includes("penal")) return "penalties";
  if (kind.includes("full") || kind.includes("final")) return "full_time";
  if (minute > 90) return "extra_time";
  if (minute >= 46) return "second_half";
  return "first_half";
}

function inferFilter(kind: string, text: string): TimelineEventItem["filter"] {
  if (kind.includes("goal") || text.includes("goal") || text.includes("own goal")) return "goals";
  if (kind.includes("red") || kind.includes("yellow") || text.includes("card")) return "cards";
  if (kind.includes("sub") || text.includes("substitut")) return "subs";
  if (kind.includes("var") || text.includes("var")) return "var";
  if (kind.includes("pen") || text.includes("penalty") || text.includes("missed penalty")) return "key";
  if (kind.includes("injury") || kind.includes("chance") || kind.includes("own") || kind.includes("missed")) return "key";
  return "other";
}

function isBoundaryEvent(kind: string): boolean {
  return kind.includes("kickoff") || kind.includes("half") || kind.includes("second_half") || kind.includes("full") || kind.includes("extra") || kind.includes("penalties");
}

function roleFromPosition(position: string): LineupPlayer["role"] {
  const p = position.toLowerCase();
  if (/gk|goalkeeper/.test(p)) return "GK";
  if (/cb|lb|rb|wb|def|back/.test(p)) return "DEF";
  if (/dm|cm|am|lm|rm|mid/.test(p)) return "MID";
  if (/st|cf|lw|rw|fw|wing|att|forward|striker/.test(p)) return "ATT";
  return "UNK";
}

function normalizeLineupPlayer(player: any, fallbackIndex: number): LineupPlayer {
  const position = String(player?.positionName || player?.position || player?.pos || "").trim();
  const captainHint = String(player?.captain || player?.isCaptain || player?.role || "").toLowerCase();
  const goalkeeper = roleFromPosition(position) === "GK";

  return {
    id: String(player?.id || stableId([player?.name, player?.jersey, fallbackIndex])),
    name: String(player?.name || "Unknown"),
    jersey: String(player?.jersey || player?.shirtNumber || "—"),
    position: position || "Unknown",
    role: roleFromPosition(position),
    isCaptain: captainHint === "true" || captainHint === "1" || captainHint.includes("capt") || /\(c\)/i.test(String(player?.name || "")),
    isGoalkeeper: goalkeeper,
    isStarter: player?.starter !== false,
    photo: player?.photo || player?.image || null,
    raw: player,
  };
}

function buildFormationRows(players: LineupPlayer[], formationRaw?: string | null): LineupPlayer[][] {
  const starters = players.filter((p) => p.isStarter).slice(0, 11);
  if (!starters.length) return [];

  const formationNums = String(formationRaw || "")
    .split("-")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const byRole = {
    gk: starters.filter((p) => p.role === "GK"),
    def: starters.filter((p) => p.role === "DEF"),
    mid: starters.filter((p) => p.role === "MID"),
    att: starters.filter((p) => p.role === "ATT"),
    unk: starters.filter((p) => p.role === "UNK"),
  };

  const pool = [...starters];
  const take = (candidates: LineupPlayer[], count: number): LineupPlayer[] => {
    const out: LineupPlayer[] = [];
    for (const candidate of candidates) {
      if (out.length >= count) break;
      const idx = pool.findIndex((p) => p.id === candidate.id);
      if (idx >= 0) {
        out.push(pool[idx]);
        pool.splice(idx, 1);
      }
    }
    while (out.length < count && pool.length) {
      out.push(pool.shift() as LineupPlayer);
    }
    return out;
  };

  const gk = take(byRole.gk.length ? byRole.gk : byRole.unk, 1);
  const lines = formationNums.length >= 3 ? formationNums : [4, 3, 3];
  const built = lines.map((lineCount, index) => {
    if (index === 0) return take([...byRole.def, ...byRole.unk], lineCount);
    if (index === lines.length - 1) return take([...byRole.att, ...byRole.unk], lineCount);
    return take([...byRole.mid, ...byRole.unk], lineCount);
  });

  return [...built.reverse(), gk].filter((row) => row.length > 0);
}

function dedupeEvents(events: TimelineEventItem[]): TimelineEventItem[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = stableId([event.kind, event.minuteLabel, event.title, event.description, event.teamName, event.side]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPhaseSeparators(events: TimelineEventItem[], status: string): TimelineEventItem[] {
  const withPhases = [...events];
  const has = (phase: TimelineEventItem["phase"]) => withPhases.some((e) => e.phase === phase && e.isPhaseSeparator);

  const separators: TimelineEventItem[] = [
    {
      id: "phase:first-half",
      kind: "phase:first_half",
      minuteValue: 0,
      minuteLabel: "0'",
      phase: "first_half",
      side: "center",
      teamName: null,
      title: "First Half",
      description: "Kickoff",
      secondary: null,
      filter: "key",
      isPhaseSeparator: true,
      isKeyMoment: true,
      raw: null,
    },
    {
      id: "phase:half-time",
      kind: "phase:half_time",
      minuteValue: 45.99,
      minuteLabel: "HT",
      phase: "half_time",
      side: "center",
      teamName: null,
      title: "Half Time",
      description: "Break",
      secondary: null,
      filter: "key",
      isPhaseSeparator: true,
      isKeyMoment: true,
      raw: null,
    },
    {
      id: "phase:second-half",
      kind: "phase:second_half",
      minuteValue: 46,
      minuteLabel: "46'",
      phase: "second_half",
      side: "center",
      teamName: null,
      title: "Second Half",
      description: "Restart",
      secondary: null,
      filter: "key",
      isPhaseSeparator: true,
      isKeyMoment: true,
      raw: null,
    },
  ];

  const statusText = String(status || "").toLowerCase();
  if (statusText.includes("extra")) {
    separators.push({
      id: "phase:extra-time",
      kind: "phase:extra_time",
      minuteValue: 90.5,
      minuteLabel: "ET",
      phase: "extra_time",
      side: "center",
      teamName: null,
      title: "Extra Time",
      description: "Additional period",
      secondary: null,
      filter: "key",
      isPhaseSeparator: true,
      isKeyMoment: true,
      raw: null,
    });
  }
  if (statusText.includes("pen")) {
    separators.push({
      id: "phase:penalties",
      kind: "phase:penalties",
      minuteValue: 120,
      minuteLabel: "PEN",
      phase: "penalties",
      side: "center",
      teamName: null,
      title: "Penalties",
      description: "Shootout",
      secondary: null,
      filter: "key",
      isPhaseSeparator: true,
      isKeyMoment: true,
      raw: null,
    });
  }
  if (statusText.includes("finished") || statusText.includes("ft") || statusText.includes("full")) {
    separators.push({
      id: "phase:full-time",
      kind: "phase:full_time",
      minuteValue: 120.99,
      minuteLabel: "FT",
      phase: "full_time",
      side: "center",
      teamName: null,
      title: "Full Time",
      description: "Match ended",
      secondary: null,
      filter: "key",
      isPhaseSeparator: true,
      isKeyMoment: true,
      raw: null,
    });
  }

  for (const separator of separators) {
    if (!has(separator.phase)) withPhases.push(separator);
  }

  return withPhases;
}

export function useEventMapping(params: { events: any[]; homeTeam: string; awayTeam: string }) {
  const mappedEvents = useMemo(() => {
    const rows = (Array.isArray(params.events) ? params.events : []).map((raw, index) => {
      const kind = eventKind(raw);
      const minuteValue = parseMinute(raw, index + 1);
      const text = eventText(raw);
      const filter = inferFilter(kind, text);
      const side = inferSide(raw, params.homeTeam, params.awayTeam);
      const title = String(raw?.title || (filter === "goals" ? "Goal" : filter === "cards" ? "Card" : filter === "subs" ? "Substitution" : filter === "var" ? "VAR" : "Event"));
      const description = String(raw?.description || raw?.detail || raw?.player || raw?.text || "").trim();
      const teamName = raw?.teamName || raw?.team || null;

      return {
        id: String(raw?.id || stableId([kind, minuteValue, title, description, teamName, side, index])),
        kind,
        minuteValue,
        minuteLabel: minuteLabel(raw, minuteValue),
        phase: inferPhase(kind, minuteValue),
        side,
        teamName,
        title,
        description,
        secondary: raw?.assist || raw?.secondary || null,
        filter,
        isPhaseSeparator: isBoundaryEvent(kind),
        isKeyMoment: filter === "goals" || filter === "cards" || filter === "subs" || filter === "var" || filter === "key",
        raw,
      } as TimelineEventItem;
    });

    return dedupeEvents(rows).sort((a, b) => {
      if (a.minuteValue !== b.minuteValue) return a.minuteValue - b.minuteValue;
      if (a.isPhaseSeparator !== b.isPhaseSeparator) return a.isPhaseSeparator ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }, [params.awayTeam, params.events, params.homeTeam]);

  return { mappedEvents };
}

export function useTimeline(params: {
  events: any[];
  homeTeam: string;
  awayTeam: string;
  status?: string;
}) {
  const { mappedEvents } = useEventMapping({
    events: params.events,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
  });

  const events = useMemo(() => {
    const withPhases = buildPhaseSeparators(mappedEvents, String(params.status || ""));
    return dedupeEvents(withPhases).sort((a, b) => a.minuteValue - b.minuteValue);
  }, [mappedEvents, params.status]);

  const counters = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        if (event.filter === "goals") acc.goals += 1;
        if (event.filter === "cards") acc.cards += 1;
        if (event.filter === "subs") acc.subs += 1;
        if (event.filter === "var") acc.var += 1;
        if (event.filter === "key") acc.key += 1;
        return acc;
      },
      { goals: 0, cards: 0, subs: 0, var: 0, key: 0 },
    );
  }, [events]);

  return { events, counters };
}

export function useTimelineFilters(params: {
  events: TimelineEventItem[];
  activeFilter: TimelineFilter;
}) {
  const filteredEvents = useMemo(() => {
    if (params.activeFilter === "all") return params.events;
    return params.events.filter((event) => {
      if (event.isPhaseSeparator) return true;
      if (params.activeFilter === "key") return event.isKeyMoment;
      return event.filter === params.activeFilter;
    });
  }, [params.activeFilter, params.events]);

  const availableFilters = useMemo(() => {
    return [
      { key: "all" as const, label: "All" },
      { key: "goals" as const, label: "Goals" },
      { key: "cards" as const, label: "Cards" },
      { key: "subs" as const, label: "Subs" },
      { key: "var" as const, label: "VAR" },
      { key: "key" as const, label: "Key moments" },
    ];
  }, []);

  return { filteredEvents, availableFilters };
}

function parseSubstitutionText(raw: any): { playerIn: string | null; playerOut: string | null } {
  const playerIn = raw?.playerIn || raw?.in || null;
  const playerOut = raw?.playerOut || raw?.out || null;
  if (playerIn || playerOut) {
    return {
      playerIn: playerIn ? String(playerIn) : null,
      playerOut: playerOut ? String(playerOut) : null,
    };
  }

  const text = String(raw?.description || raw?.detail || raw?.text || "");
  const byArrow = text.split("→");
  if (byArrow.length === 2) {
    return {
      playerOut: byArrow[0]?.trim() || null,
      playerIn: byArrow[1]?.trim() || null,
    };
  }

  const inFor = text.match(/(.+)\s+for\s+(.+)/i);
  if (inFor) {
    return {
      playerIn: String(inFor[1] || "").trim() || null,
      playerOut: String(inFor[2] || "").trim() || null,
    };
  }

  return { playerIn: null, playerOut: null };
}

export function useLiveLineupChanges(params: { events: TimelineEventItem[] }) {
  const substitutions = useMemo(() => {
    return params.events
      .filter((event) => !event.isPhaseSeparator && (event.filter === "subs" || event.kind.includes("sub")))
      .map((event) => {
        const parsed = parseSubstitutionText(event.raw || {});
        return {
          id: event.id,
          minute: Math.floor(event.minuteValue),
          minuteLabel: event.minuteLabel,
          side: event.side,
          teamName: event.teamName,
          playerIn: parsed.playerIn,
          playerOut: parsed.playerOut,
        } as LiveLineupChange;
      });
  }, [params.events]);

  return { substitutions };
}

function normalizeTeamLineup(rawTeam: any, fallbackName: string): TeamLineupState {
  const players = (Array.isArray(rawTeam?.players) ? rawTeam.players : []).map((player: any, index: number) => normalizeLineupPlayer(player, index));
  const starters = players.filter((player: any) => player.isStarter);
  const bench = players.filter((player: any) => !player.isStarter);

  const lineupState: TeamLineupState["lineupState"] =
    starters.length >= 11
      ? (String(rawTeam?.lineupType || "").toLowerCase().includes("official") ? "confirmed" : "expected")
      : "unavailable";

  return {
    teamName: String(rawTeam?.team || fallbackName),
    formation: String(rawTeam?.formation || "").trim() || null,
    lineupState,
    starters,
    bench,
    allPlayers: players,
  };
}

function pickTeamByName(teams: any[], teamName: string): any | null {
  return teams.find((team) => sameTeamName(team?.team, teamName)) || null;
}

function extractExpectedFromOverview(overview: any): any {
  const probable = overview?.expectedLineup || overview?.probableLineup || overview?.predictedLineup || null;
  if (!probable) return null;

  const players = Array.isArray(probable?.players)
    ? probable.players
    : Array.isArray(probable)
      ? probable
      : [];

  if (!players.length) return null;

  return {
    team: overview?.name || overview?.team || "Team",
    formation: probable?.formation || overview?.expectedFormation || null,
    lineupType: "expected",
    players,
  };
}

export function useExpectedLineups(params: {
  homeOverview?: any;
  awayOverview?: any;
}) {
  const homeExpected = useMemo(() => extractExpectedFromOverview(params.homeOverview), [params.homeOverview]);
  const awayExpected = useMemo(() => extractExpectedFromOverview(params.awayOverview), [params.awayOverview]);

  const unavailablePlayers = useMemo(() => {
    const collect = (teamOverview: any) => {
      const injuries = Array.isArray(teamOverview?.injuries) ? teamOverview.injuries : [];
      const suspensions = Array.isArray(teamOverview?.suspensions) ? teamOverview.suspensions : [];
      return [...injuries, ...suspensions]
        .map((row: any) => String(row?.name || row?.player || ""))
        .filter(Boolean)
        .slice(0, 8);
    };

    return {
      home: collect(params.homeOverview),
      away: collect(params.awayOverview),
    };
  }, [params.awayOverview, params.homeOverview]);

  return {
    homeExpected,
    awayExpected,
    unavailablePlayers,
  };
}

export function useLineups(params: {
  confirmedTeams: any[];
  homeTeam: string;
  awayTeam: string;
  expectedHome?: any;
  expectedAway?: any;
  substitutions?: LiveLineupChange[];
}) {
  const model = useMemo(() => {
    const confirmedTeams = Array.isArray(params.confirmedTeams) ? params.confirmedTeams : [];
    const confirmedHome = pickTeamByName(confirmedTeams, params.homeTeam) || confirmedTeams[0] || null;
    const confirmedAway = pickTeamByName(confirmedTeams, params.awayTeam) || confirmedTeams[1] || null;

    const homeSource = confirmedHome || params.expectedHome || { team: params.homeTeam, players: [], lineupType: "unavailable" };
    const awaySource = confirmedAway || params.expectedAway || { team: params.awayTeam, players: [], lineupType: "unavailable" };

    const home = normalizeTeamLineup(homeSource, params.homeTeam);
    const away = normalizeTeamLineup(awaySource, params.awayTeam);

    const markSub = (team: TeamLineupState) => {
      const changes = Array.isArray(params.substitutions) ? params.substitutions : [];
      const byName = new Map<string, LiveLineupChange>();
      for (const change of changes) {
        if (change.playerIn) byName.set(change.playerIn.toLowerCase(), change);
        if (change.playerOut) byName.set(change.playerOut.toLowerCase(), change);
      }

      const mark = (players: LineupPlayer[]) =>
        players.map((player) => {
          const change = byName.get(player.name.toLowerCase());
          if (!change) return player;
          return {
            ...player,
            subInMinute: change.playerIn && change.playerIn.toLowerCase() === player.name.toLowerCase() ? change.minute : undefined,
            subOutMinute: change.playerOut && change.playerOut.toLowerCase() === player.name.toLowerCase() ? change.minute : undefined,
          };
        });

      return {
        ...team,
        starters: mark(team.starters),
        bench: mark(team.bench),
        allPlayers: mark(team.allPlayers),
      };
    };

    return {
      home: markSub(home),
      away: markSub(away),
    };
  }, [params.awayTeam, params.confirmedTeams, params.expectedAway, params.expectedHome, params.homeTeam, params.substitutions]);

  return {
    ...model,
    hasConfirmedLineups: model.home.lineupState === "confirmed" || model.away.lineupState === "confirmed",
    hasAnyLineups: model.home.allPlayers.length > 0 || model.away.allPlayers.length > 0,
  };
}

export function useFormationLayout(team: TeamLineupState | null | undefined) {
  const rows = useMemo(() => {
    if (!team) return [] as LineupPlayer[][];
    return buildFormationRows(team.starters, team.formation);
  }, [team]);

  return { rows };
}
