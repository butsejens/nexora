import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { buildSportLiveQuery, buildSportScheduleQuery } from "@/services/realtime-engine";
import { getMatchdayYmd } from "@/lib/date/matchday";
import { resolveMatchStatus, type MatchLifecycleStatus } from "@/lib/match-state";

type MatchLike = {
  id?: unknown;
  status?: unknown;
  detail?: unknown;
  statusDetail?: unknown;
  minute?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  startTime?: unknown;
  date?: unknown;
  score?: { home?: unknown; away?: unknown };
};

function statusOf(match: MatchLike): MatchLifecycleStatus {
  return resolveMatchStatus({
    status: match?.status,
    detail: match?.statusDetail ?? match?.detail,
    minute: match?.minute,
    homeScore: match?.score?.home ?? match?.homeScore,
    awayScore: match?.score?.away ?? match?.awayScore,
    startDate: match?.startTime ?? match?.date,
  });
}

function splitByStatus(matches: MatchLike[]) {
  const live: MatchLike[] = [];
  const upcoming: MatchLike[] = [];
  const finished: MatchLike[] = [];
  const halftime: MatchLike[] = [];

  for (const match of matches) {
    const status = statusOf(match);
    if (status === "halftime") {
      halftime.push({ ...match, status });
      live.push({ ...match, status });
      continue;
    }
    if (status === "live" || status === "delayed") {
      live.push({ ...match, status });
      continue;
    }
    if (status === "finished" || status === "cancelled" || status === "postponed") {
      finished.push({ ...match, status });
      continue;
    }
    upcoming.push({ ...match, status: "upcoming" });
  }

  return { live, upcoming, finished, halftime };
}

export function useMatchStatusResolver() {
  return useMemo(() => ({ resolveMatchStatus }), []);
}

export function useSportHomeFeed(enabled: boolean, date?: string) {
  const selectedDate = date || getMatchdayYmd();
  const query = useQuery(buildSportScheduleQuery(selectedDate, enabled));

  const normalized = useMemo(() => {
    const source = [
      ...(query.data?.live || []),
      ...(query.data?.upcoming || []),
      ...(query.data?.finished || []),
    ] as MatchLike[];
    return splitByStatus(source);
  }, [query.data?.finished, query.data?.live, query.data?.upcoming]);

  return {
    ...query,
    date: selectedDate,
    live: normalized.live,
    upcoming: normalized.upcoming,
    finished: normalized.finished,
    halftime: normalized.halftime,
    hasData: normalized.live.length + normalized.upcoming.length + normalized.finished.length > 0,
  };
}

export function useLiveMatches(enabled: boolean, date?: string) {
  const query = date
    ? useQuery(buildSportScheduleQuery(date, enabled))
    : useQuery(buildSportLiveQuery(enabled));

  const live = useMemo(() => {
    const source = date
      ? [
          ...(query.data?.live || []),
          ...(query.data?.upcoming || []),
          ...(query.data?.finished || []),
        ]
      : [
          ...(query.data?.live || []),
          ...(query.data?.upcoming || []),
          ...(query.data?.finished || []),
        ];
    return splitByStatus(source as MatchLike[]).live;
  }, [date, query.data?.finished, query.data?.live, query.data?.upcoming]);

  return { ...query, live, hasData: live.length > 0 };
}

export function useMatchdayMatches(date: string, enabled: boolean) {
  return useSportHomeFeed(enabled, date);
}

export function useExploreMatches(date: string, enabled: boolean) {
  const feed = useSportHomeFeed(enabled, date);
  return {
    ...feed,
    matches: [...feed.live, ...feed.upcoming, ...feed.finished],
  };
}

export function useFinishedMatches(date: string, enabled: boolean) {
  const feed = useSportHomeFeed(enabled, date);
  return { ...feed, matches: feed.finished, hasData: feed.finished.length > 0 };
}

export function useUpcomingMatches(date: string, enabled: boolean) {
  const feed = useSportHomeFeed(enabled, date);
  return { ...feed, matches: feed.upcoming, hasData: feed.upcoming.length > 0 };
}
