import { useEffect, useMemo, useRef } from "react";

import { useNexora } from "@/context/NexoraContext";
import { useFollowState } from "@/context/UserStateContext";
import { resolveMatchBucket } from "@/lib/match-state";
import { fetchFollowedMatchSnapshot } from "@/services/realtime-engine";
import { logRealtimeEvent } from "@/services/realtime-telemetry";
import { createWebsocketService } from "@/services/websocketService";
import {
  initializeMatchNotifications,
  loadMatchSnapshots,
  pushMatchNotification,
  saveMatchSnapshots,
  saveMatchSubscriptions,
  toEventHash,
  type MatchSnapshot,
} from "@/lib/match-notifications";
import { useOnboardingStore } from "@/store/onboarding-store";

const EVENT_GOAL_REGEX = /\b(goal|penalty|red card|own goal|equalizer|winner)\b/i;
const EVENT_LINEUP_REGEX = /\b(lineup|line-ups|starting xi|bench)\b/i;

function safeText(value: unknown): string {
  return String(value || "").trim();
}

function shouldTrackEvent(event: any, goalsEnabled: boolean, lineupsEnabled: boolean): boolean {
  const text = `${safeText(event?.type)} ${safeText(event?.detail)}`;
  return (goalsEnabled && EVENT_GOAL_REGEX.test(text)) || (lineupsEnabled && EVENT_LINEUP_REGEX.test(text));
}

function buildSmartScoreNotification(match: any, prevHome: number, prevAway: number, homeNow: number, awayNow: number) {
  const home = safeText(match.homeTeam) || "Home";
  const away = safeText(match.awayTeam) || "Away";
  const scoreLine = `${home} ${homeNow}-${awayNow} ${away}`;

  if (homeNow > prevHome && awayNow === prevAway) {
    const tookLead = homeNow > awayNow && prevHome <= prevAway;
    const equalized = homeNow === awayNow && prevHome < prevAway;
    return {
      title: tookLead ? `${home} takes the lead` : equalized ? "Equalizer" : "Goal update",
      body: scoreLine,
    };
  }

  if (awayNow > prevAway && homeNow === prevHome) {
    const tookLead = awayNow > homeNow && prevAway <= prevHome;
    const equalized = awayNow === homeNow && prevAway < prevHome;
    return {
      title: tookLead ? `${away} takes the lead` : equalized ? "Equalizer" : "Goal update",
      body: scoreLine,
    };
  }

  return { title: "Score update", body: scoreLine };
}

export function MatchAlertsBridge() {
  const { notificationsEnabled } = useNexora();
  const notificationPrefs = useOnboardingStore((state) => state.notifications);
  const { followedMatches } = useFollowState();

  const alertMatches = useMemo(
    () => followedMatches.filter((match) => Boolean(match.notificationsEnabled)).slice(0, 20),
    [followedMatches],
  );

  const snapshotsRef = useRef<Record<string, MatchSnapshot>>({});
  const cooldownRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      await initializeMatchNotifications();
      const snapshots = await loadMatchSnapshots();
      if (!active) return;
      snapshotsRef.current = snapshots || {};
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void saveMatchSubscriptions(
      alertMatches.map((match) => ({
        id: String(match.matchId || ""),
        espnLeague: match.espnLeague || undefined,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
      })),
    ).catch(() => undefined);
  }, [alertMatches]);

  useEffect(() => {
    if (!notificationsEnabled || alertMatches.length === 0) return;

    const shouldNotify = (key: string, cooldownMs = 10_000) => {
      const now = Date.now();
      const lastAt = Number(cooldownRef.current[key] || 0);
      if (now - lastAt < cooldownMs) return false;
      cooldownRef.current[key] = now;
      return true;
    };

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const websocketUrl = String(process.env.EXPO_PUBLIC_SPORTS_WS_URL || "").trim();
    const socket = websocketUrl
      ? createWebsocketService(websocketUrl, { name: "match-alerts" })
      : null;

    const computePollInterval = () => {
      const snapshots = Object.values(snapshotsRef.current);
      const hasLiveMatch = snapshots.some((snapshot) => snapshot?.status === "live");
      return hasLiveMatch ? 8_000 : 25_000;
    };

    const scheduleNextPoll = () => {
      if (cancelled) return;
      const nextMs = computePollInterval();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void poll();
      }, nextMs);
    };

    const poll = async () => {
      const nextSnapshots = { ...snapshotsRef.current };
      let changed = false;

      await Promise.allSettled(
        alertMatches.map(async (match) => {
          const id = String(match.matchId || "");
          if (!id) return;

          try {
            const detail = await fetchFollowedMatchSnapshot(id, match.espnLeague || "eng.1");
            if (!detail || !detail.id) return;

            const previous = nextSnapshots[id];
            const currentStatus = resolveMatchBucket({
              status: detail?.status,
              detail: detail?.status,
              minute: detail?.minute,
              homeScore: detail?.homeScore,
              awayScore: detail?.awayScore,
              startDate: detail?.startDate,
            });
            const homeScore = Number(detail?.homeScore ?? 0);
            const awayScore = Number(detail?.awayScore ?? 0);
            const keyEvents = Array.isArray(detail?.keyEvents) ? detail.keyEvents : [];
            const trackedHashes = keyEvents
              .filter((event: any) => shouldTrackEvent(event, notificationPrefs.goals, notificationPrefs.lineups))
              .map((event: any) => toEventHash(event));

            if (previous) {
              if (
                notificationPrefs.matches &&
                previous.status !== "live" &&
                currentStatus === "live" &&
                shouldNotify(`${id}:start`, 20_000)
              ) {
                await pushMatchNotification("Match started", `${safeText(match.homeTeam)} - ${safeText(match.awayTeam)} has kicked off`, { matchId: id });
              }

              if (
                notificationPrefs.matches &&
                previous.status !== "finished" &&
                currentStatus === "finished" &&
                shouldNotify(`${id}:finished`, 20_000)
              ) {
                await pushMatchNotification("Match finished", `${safeText(match.homeTeam)} ${homeScore}-${awayScore} ${safeText(match.awayTeam)}`, { matchId: id });
              }

              if (
                notificationPrefs.goals &&
                currentStatus === "live" &&
                (previous.homeScore !== homeScore || previous.awayScore !== awayScore) &&
                shouldNotify(`${id}:score`, 10_000)
              ) {
                const scoreUpdate = buildSmartScoreNotification(match, Number(previous.homeScore || 0), Number(previous.awayScore || 0), homeScore, awayScore);
                await pushMatchNotification(scoreUpdate.title, scoreUpdate.body, { matchId: id });
              }

              const seenHashes = new Set(previous.eventHashes || []);
              const newEvents = keyEvents.filter((event: any) => {
                const hash = toEventHash(event);
                return !seenHashes.has(hash) && shouldTrackEvent(event, notificationPrefs.goals, notificationPrefs.lineups);
              });

              if (newEvents.length > 0 && shouldNotify(`${id}:events`, 10_000)) {
                const latest = newEvents[newEvents.length - 1];
                const body = `${safeText(match.homeTeam)} ${homeScore}-${awayScore} ${safeText(match.awayTeam)}\n${safeText(latest?.time)} ${safeText(latest?.type)}${safeText(latest?.detail) ? `: ${safeText(latest?.detail)}` : ""}`.trim();
                const title = notificationPrefs.lineups && EVENT_LINEUP_REGEX.test(`${safeText(latest?.type)} ${safeText(latest?.detail)}`)
                  ? "Lineup update"
                  : "Match event";
                await pushMatchNotification(title, body, { matchId: id });
              }
            }

            nextSnapshots[id] = {
              status: currentStatus,
              homeScore,
              awayScore,
              eventHashes: trackedHashes,
            };
            changed = true;
          } catch {
            return;
          }
        }),
      );

      if (changed && !cancelled) {
        snapshotsRef.current = nextSnapshots;
        await saveMatchSnapshots(nextSnapshots);
      }

      logRealtimeEvent("realtime", "match-alerts-poll", {
        trackedMatches: alertMatches.length,
        changed,
        nextPollMs: computePollInterval(),
      });

      scheduleNextPoll();
    };

    void poll();
    const unsubscribe = socket
      ? socket.subscribe(() => {
          logRealtimeEvent("realtime", "match-alerts-websocket-refresh", {
            trackedMatches: alertMatches.length,
          });
          void poll();
        })
      : undefined;
    socket?.connect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      socket?.close();
    };
  }, [alertMatches, notificationPrefs.goals, notificationPrefs.lineups, notificationPrefs.matches, notificationsEnabled]);

  return null;
}