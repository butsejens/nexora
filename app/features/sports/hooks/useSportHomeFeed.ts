import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { buildSportLiveQuery, buildSportScheduleQuery } from "@/services/realtime-engine";
import { getMatchdayYmd } from "@/lib/date/matchday";
import { resolveMatchStatus } from "@/lib/match-state";

type MatchLike = any;

export function useMatchStatusResolver() {
  return useMemo(() => ({ resolveMatchStatus }), []);
}

export function useSportHomeFeed(enabled: boolean, date?: string) {
  const selectedDate = date || getMatchdayYmd();
  const query = useQuery(buildSportScheduleQuery(selectedDate, enabled));

  const normalized = useMemo(() => {
    const live = (Array.isArray(query.data?.live) ? query.data?.live : []) as any[];
    const upcoming = (Array.isArray(query.data?.upcoming) ? query.data?.upcoming : []) as any[];
    const finished = (Array.isArray(query.data?.finished) ? query.data?.finished : []) as any[];
    const halftime = live.filter((match) => String(match?.status || "").toLowerCase() === "halftime");
    return { live, upcoming, finished, halftime };
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
    const source = Array.isArray(query.data?.live) ? query.data.live : [];
    return source as any[];
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
