/**
 * Nexora – Sofascore Data Module
 *
 * Shared utilities for fetching and normalizing Sofascore data.
 * Used by server/modules/sports.js (and replaces the inline copies in index.js).
 *
 * All data is best-effort and cached aggressively.
 * Sofascore requires browser-like headers to avoid 403/bot detection.
 */

import { cache, TTL } from "./cache.js";
import { createLogger } from "./logger.js";

const log = createLogger("sofascore");

const SOFASCORE_BASE = "https://www.sofascore.com/api/v1";
const SOFASCORE_TIMEOUT_MS = Number(process.env.SOFASCORE_TIMEOUT_MS || 6_000);

function sofaHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.sofascore.com/",
    Origin: "https://www.sofascore.com",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeTeamKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamLooseKey(value) {
  return (
    normalizeTeamKey(value)
      .replace(/\b\d+\b/g, " ")
      .replace(/\bsainte\b/g, "saint")
      .replace(/\bsint\b/g, "saint")
      .replace(/\bst\b/g, "saint")
      .replace(
        /\b(fc|cf|sc|ac|afc|fk|sv|rc|as|us|ssc|club|deportivo|futbol|football)\b/g,
        " ",
      )
      // English ↔ German city name variants (UEFA/ESPN use English, SofaScore uses German)
      .replace(/\bmunich\b/g, "munchen")
      .replace(/\bcologne\b/g, "koln")
      .replace(/\bnuremberg\b/g, "nurnberg")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.88;

  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  const denom = Math.max(aTokens.size, bTokens.size, 1);
  return overlap / denom;
}

function teamNamesLikelySame(a, b) {
  const strictA = normalizeTeamKey(a);
  const strictB = normalizeTeamKey(b);
  const looseA = normalizeTeamLooseKey(a);
  const looseB = normalizeTeamLooseKey(b);

  if (!strictA || !strictB) return false;
  if (strictA === strictB) return true;
  if (looseA && looseB && looseA === looseB) return true;
  if (strictA.includes(strictB) || strictB.includes(strictA)) return true;
  if (looseA && looseB && (looseA.includes(looseB) || looseB.includes(looseA)))
    return true;

  return (
    similarityScore(strictA, strictB) >= 0.8 ||
    (looseA && looseB && similarityScore(looseA, looseB) >= 0.9)
  );
}

function buildSofaDataFromEvent(rawEvent) {
  const event = rawEvent?.event || rawEvent;
  if (!event || !event.homeTeam || !event.awayTeam) return null;
  const meta = rawEvent?.eventMeta || event?.eventMeta || {};
  return {
    id: String(event?.id || ""),
    slug: String(event?.slug || event?.customId || ""),
    tournament: String(
      event?.tournament?.name ||
        event?.tournament?.uniqueTournament?.name ||
        "",
    ),
    country: String(
      event?.tournament?.category?.country?.name ||
        event?.tournament?.category?.name ||
        "",
    ),
    venue: {
      name: String(event?.venue?.name || event?.venue?.stadium?.name || ""),
      city: String(event?.venue?.city?.name || ""),
    },
    startTimestamp: Number(event?.startTimestamp || 0) || null,
    status: {
      code: Number(event?.status?.code || 0),
      type: String(event?.status?.type || ""),
      description: String(event?.status?.description || ""),
    },
    standings: {
      homePosition: Number(meta?.homeTeamStandingsPosition || 0) || null,
      awayPosition: Number(meta?.awayTeamStandingsPosition || 0) || null,
    },
    homeTeam: {
      id: String(event?.homeTeam?.id || ""),
      name: String(event?.homeTeam?.name || ""),
      shortName: String(event?.homeTeam?.shortName || ""),
      slug: String(event?.homeTeam?.slug || ""),
    },
    awayTeam: {
      id: String(event?.awayTeam?.id || ""),
      name: String(event?.awayTeam?.name || ""),
      shortName: String(event?.awayTeam?.shortName || ""),
      slug: String(event?.awayTeam?.slug || ""),
    },
    referee: String(event?.referee?.name || event?.referee?.shortName || ""),
  };
}

// ─── Sofascore Fetchers ───────────────────────────────────────────────────────

/**
 * Fetch all Sofascore football events for a given date (YYYY-MM-DD).
 */
export async function fetchSofaEventsByDate(date) {
  const d = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];

  const key = `sofa2_events_${d}`;
  try {
    const { value } = await cache.getOrFetch(key, 5 * 60_000, async () => {
      const url = `${SOFASCORE_BASE}/sport/football/scheduled-events/${encodeURIComponent(d)}`;
      const resp = await fetch(url, {
        headers: sofaHeaders(),
        signal: AbortSignal.timeout(SOFASCORE_TIMEOUT_MS),
      });
      if (!resp.ok) return [];
      const data = await resp.json().catch(() => ({}));
      return Array.isArray(data?.events) ? data.events : [];
    });
    return Array.isArray(value) ? value : [];
  } catch (e) {
    log.warn("fetchSofaEventsByDate failed", { date: d, message: e.message });
    return [];
  }
}

/**
 * Find the Sofascore event ID for a match by team names and date.
 * Returns null if not found.
 */
export async function findSofaEventId(homeTeam, awayTeam, dateYmd) {
  const day = String(dateYmd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const base = new Date(`${day}T00:00:00Z`);
  const prev = new Date(base);
  prev.setUTCDate(base.getUTCDate() - 1);
  const next = new Date(base);
  next.setUTCDate(base.getUTCDate() + 1);

  const dateCandidates = [
    prev.toISOString().slice(0, 10),
    day,
    next.toISOString().slice(0, 10),
  ];

  const batches = await Promise.allSettled(
    dateCandidates.map((d) => fetchSofaEventsByDate(d)),
  );
  const events = [];
  for (const batch of batches) {
    if (batch.status !== "fulfilled" || !Array.isArray(batch.value)) continue;
    events.push(...batch.value);
  }

  const hk = normalizeTeamKey(homeTeam);
  const ak = normalizeTeamKey(awayTeam);
  if (!hk || !ak) return null;

  let bestId = null;
  let bestScore = 0;
  for (const raw of events) {
    const sofa = buildSofaDataFromEvent(raw);
    if (!sofa?.id) continue;
    const homeName = String(sofa.homeTeam?.name || "");
    const awayName = String(sofa.awayTeam?.name || "");
    const sh = normalizeTeamKey(homeName);
    const sa = normalizeTeamKey(awayName);
    if (!sh || !sa) continue;
    const homeMatch = teamNamesLikelySame(homeTeam, homeName);
    const awayMatch = teamNamesLikelySame(awayTeam, awayName);
    if (homeMatch && awayMatch) return sofa.id;
    // Also try reversed (Sofascore might have home/away switched for neutral venues)
    const homeMatchR = teamNamesLikelySame(awayTeam, homeName);
    const awayMatchR = teamNamesLikelySame(homeTeam, awayName);
    if (homeMatchR && awayMatchR) return sofa.id;

    const straightScore =
      similarityScore(
        normalizeTeamLooseKey(homeTeam),
        normalizeTeamLooseKey(homeName),
      ) +
      similarityScore(
        normalizeTeamLooseKey(awayTeam),
        normalizeTeamLooseKey(awayName),
      );
    const reverseScore =
      similarityScore(
        normalizeTeamLooseKey(awayTeam),
        normalizeTeamLooseKey(homeName),
      ) +
      similarityScore(
        normalizeTeamLooseKey(homeTeam),
        normalizeTeamLooseKey(awayName),
      );
    const candidateScore = Math.max(straightScore, reverseScore);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestId = sofa.id;
    }
  }
  return bestScore >= 1.55 ? bestId : null;
}

/**
 * Fetch normalized incidents (goals, cards, subs) for a Sofascore event.
 */
export async function fetchSofaIncidents(sofaEventId) {
  if (!sofaEventId) return [];

  const key = `sofa2_incidents_${sofaEventId}`;
  try {
    const { value } = await cache.getOrFetch(
      key,
      TTL.MATCH_DETAIL,
      async () => {
        const url = `${SOFASCORE_BASE}/event/${encodeURIComponent(sofaEventId)}/incidents`;
        const resp = await fetch(url, {
          headers: sofaHeaders(),
          signal: AbortSignal.timeout(SOFASCORE_TIMEOUT_MS),
        });
        if (!resp.ok) return [];
        const data = await resp.json().catch(() => ({}));
        const incidents = Array.isArray(data?.incidents) ? data.incidents : [];

        return incidents
          .map((inc) => {
            const type = String(inc?.incidentType || "").toLowerCase();
            const detail = String(
              inc?.incidentClass || inc?.reason || "",
            ).toLowerCase();
            let eventType = type;

            if (type === "period") {
              if (inc?.text === "HT" || detail.includes("half"))
                eventType = "Half Time";
              else if (inc?.text === "FT" || detail.includes("full"))
                eventType = "Full Time";
              else return null;
            } else if (
              type === "card" &&
              (detail.includes("secondyellow") ||
                detail.includes("second yellow"))
            )
              eventType = "Second Yellow";
            else if (type === "card" && detail.includes("yellow"))
              eventType = "Yellow Card";
            else if (type === "card" && detail.includes("red"))
              eventType = "Red Card";
            else if (type === "goal" && detail.includes("own"))
              eventType = "Own Goal";
            else if (
              type === "goal" &&
              (detail.includes("penal") || detail.includes("penalty"))
            )
              eventType = "Penalty Goal";
            else if (type === "goal") eventType = "Goal";
            else if (type === "substitution") eventType = "Substitution";
            else if (type === "vardecision" || type === "var")
              eventType = "VAR";
            else if (type === "injurytime")
              return null; // not useful for timeline display
            else if (type === "ingamepenalty") {
              eventType =
                detail.includes("miss") || detail.includes("saved")
                  ? "Missed Penalty"
                  : "Penalty";
            } else if (!type || type === "unknown") return null;

            return {
              time: inc?.time ?? null,
              extra: inc?.addedTime ?? null,
              team:
                inc?.isHome === true
                  ? "__HOME__"
                  : inc?.isHome === false
                    ? "__AWAY__"
                    : "",
              type: eventType,
              detail: eventType,
              text: eventType,
              player: String(inc?.player?.name || inc?.player?.shortName || ""),
              assist: String(
                inc?.assist1?.name || inc?.assist1?.shortName || "",
              ),
              playerIn:
                type === "substitution"
                  ? String(inc?.playerIn?.name || "")
                  : undefined,
              playerOut:
                type === "substitution"
                  ? String(inc?.playerOut?.name || "")
                  : undefined,
            };
          })
          .filter(Boolean);
      },
    );
    return Array.isArray(value) ? value : [];
  } catch (e) {
    log.warn("fetchSofaIncidents failed", { sofaEventId, message: e.message });
    return [];
  }
}

/**
 * Fetch match statistics (possession, shots, etc.) from Sofascore.
 * Returns { homeStats, awayStats } or null.
 */
export async function fetchSofaStatistics(sofaEventId) {
  if (!sofaEventId) return null;

  const key = `sofa2_stats_${sofaEventId}`;
  try {
    const { value } = await cache.getOrFetch(
      key,
      TTL.MATCH_DETAIL,
      async () => {
        const url = `${SOFASCORE_BASE}/event/${encodeURIComponent(sofaEventId)}/statistics`;
        const resp = await fetch(url, {
          headers: sofaHeaders(),
          signal: AbortSignal.timeout(SOFASCORE_TIMEOUT_MS),
        });
        if (!resp.ok) return null;
        const data = await resp.json().catch(() => ({}));
        const periods = Array.isArray(data?.statistics) ? data.statistics : [];
        const all =
          periods.find((p) => p?.period === "ALL") || periods[0] || {};
        const groups = Array.isArray(all?.groups) ? all.groups : [];
        const homeStats = {};
        const awayStats = {};
        for (const group of groups) {
          for (const item of group?.statisticsItems || []) {
            const statKey = String(item?.key || item?.name || "")
              .toLowerCase()
              .replace(/\s+/g, "_");
            if (!statKey) continue;
            const hv = item?.homeValue ?? item?.home ?? null;
            const av = item?.awayValue ?? item?.away ?? null;
            if (hv != null) homeStats[statKey] = hv;
            if (av != null) awayStats[statKey] = av;
          }
        }
        return Object.keys(homeStats).length ? { homeStats, awayStats } : null;
      },
    );
    return value || null;
  } catch (e) {
    log.warn("fetchSofaStatistics failed", { sofaEventId, message: e.message });
    return null;
  }
}

/**
 * Fetch event detail from Sofascore to get venue and referee.
 * Returns the event object (with .venue and .referee) or null.
 */
async function fetchSofaEventDetail(sofaEventId) {
  if (!sofaEventId) return null;
  const key = `sofa2_event_${sofaEventId}`;
  try {
    const { value } = await cache.getOrFetch(
      key,
      TTL.MATCH_DETAIL,
      async () => {
        const url = `${SOFASCORE_BASE}/event/${encodeURIComponent(sofaEventId)}`;
        const resp = await fetch(url, {
          headers: sofaHeaders(),
          signal: AbortSignal.timeout(SOFASCORE_TIMEOUT_MS),
        });
        if (!resp.ok) return null;
        const data = await resp.json().catch(() => ({}));
        return data?.event || null;
      },
    );
    return value || null;
  } catch (e) {
    log.warn("fetchSofaEventDetail failed", {
      sofaEventId,
      message: e.message,
    });
    return null;
  }
}

/**
 * Fetch lineups from Sofascore.
 * Returns array of { team, teamLogo, formation, lineupType, players (starters), bench } or null.
 */
export async function fetchSofaLineups(sofaEventId) {
  if (!sofaEventId) return null;

  const key = `sofa2_lineups_${sofaEventId}`;
  try {
    const { value } = await cache.getOrFetch(
      key,
      TTL.MATCH_DETAIL,
      async () => {
        const url = `${SOFASCORE_BASE}/event/${encodeURIComponent(sofaEventId)}/lineups`;
        const resp = await fetch(url, {
          headers: sofaHeaders(),
          signal: AbortSignal.timeout(SOFASCORE_TIMEOUT_MS),
        });
        if (!resp.ok) return null;
        const data = await resp.json().catch(() => ({}));
        const result = [];

        for (const side of ["home", "away"]) {
          const lineup = data?.[side];
          if (!lineup) continue;
          const teamName = lineup?.team?.name || lineup?.team?.shortName || "";
          const formation = lineup?.formation || "";
          const teamLogo = lineup?.team?.id
            ? `https://api.sofascore.app/api/v1/team/${encodeURIComponent(lineup.team.id)}/image`
            : null;

          const allPlayers = (lineup?.players || []).map((row) => {
            const p = row?.player || row || {};
            const isStarter = !row?.substitute;
            const playerPhoto = p?.id
              ? `https://api.sofascore.app/api/v1/player/${encodeURIComponent(p.id)}/image`
              : teamLogo;
            const rawPos = String(row?.position || "").trim();
            const positionNameMap = {
              G: "Goalkeeper",
              D: "Defender",
              M: "Midfielder",
              F: "Forward",
            };
            const positionName =
              row?.positionName || positionNameMap[rawPos] || rawPos;
            return {
              id: String(p?.id || ""),
              name: p?.name || p?.shortName || "",
              jersey:
                String(row?.shirtNumber || p?.shirtNumber || "") || undefined,
              position: rawPos,
              positionName,
              starter: isStarter,
              captain: Boolean(row?.captain),
              photo: playerPhoto,
            };
          });

          if (!allPlayers.length) continue;
          result.push({
            team: teamName,
            teamLogo,
            formation,
            lineupType: lineup?.confirmed ? "official" : "expected",
            players: allPlayers.filter((p) => p.starter),
            bench: allPlayers.filter((p) => !p.starter),
          });
        }

        return result.length > 0 ? result : null;
      },
    );
    return value || null;
  } catch (e) {
    log.warn("fetchSofaLineups failed", { sofaEventId, message: e.message });
    return null;
  }
}

/**
 * Like findSofaEventId but also returns venue and referee from the matched event.
 */
async function findSofaEventWithMeta(homeTeam, awayTeam, dateYmd) {
  const day = String(dateYmd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const base = new Date(`${day}T00:00:00Z`);
  const prev = new Date(base);
  prev.setUTCDate(base.getUTCDate() - 1);
  const next = new Date(base);
  next.setUTCDate(base.getUTCDate() + 1);

  const batches = await Promise.allSettled(
    [prev.toISOString().slice(0, 10), day, next.toISOString().slice(0, 10)].map(
      (d) => fetchSofaEventsByDate(d),
    ),
  );
  const events = [];
  for (const batch of batches) {
    if (batch.status !== "fulfilled" || !Array.isArray(batch.value)) continue;
    events.push(...batch.value);
  }

  const hk = normalizeTeamKey(homeTeam);
  const ak = normalizeTeamKey(awayTeam);
  if (!hk || !ak) return null;

  let best = null;
  let bestScore = 0;
  for (const raw of events) {
    const sofa = buildSofaDataFromEvent(raw);
    if (!sofa?.id) continue;
    const homeName = String(sofa.homeTeam?.name || "");
    const awayName = String(sofa.awayTeam?.name || "");
    if (!normalizeTeamKey(homeName) || !normalizeTeamKey(awayName)) continue;
    const homeMatch = teamNamesLikelySame(homeTeam, homeName);
    const awayMatch = teamNamesLikelySame(awayTeam, awayName);
    const homeMatchR = teamNamesLikelySame(awayTeam, homeName);
    const awayMatchR = teamNamesLikelySame(homeTeam, awayName);
    if ((homeMatch && awayMatch) || (homeMatchR && awayMatchR)) return sofa;
    const candScore = Math.max(
      similarityScore(
        normalizeTeamLooseKey(homeTeam),
        normalizeTeamLooseKey(homeName),
      ) +
        similarityScore(
          normalizeTeamLooseKey(awayTeam),
          normalizeTeamLooseKey(awayName),
        ),
      similarityScore(
        normalizeTeamLooseKey(awayTeam),
        normalizeTeamLooseKey(homeName),
      ) +
        similarityScore(
          normalizeTeamLooseKey(homeTeam),
          normalizeTeamLooseKey(awayName),
        ),
    );
    if (candScore > bestScore) {
      bestScore = candScore;
      best = sofa;
    }
  }
  return bestScore >= 1.55 ? best : null;
}

/**
 * All-in-one: given homeTeam, awayTeam, dateYmd, find the Sofascore event and
 * fetch lineups/incidents/statistics in parallel.
 * Returns { sofaId, lineups, incidents, stats, venueName, venueCity, referee } — all fields may be null/[].
 */
export async function fetchSofaMatchData(homeTeam, awayTeam, dateYmd) {
  const sofaEvent = await findSofaEventWithMeta(homeTeam, awayTeam, dateYmd);
  const sofaId = sofaEvent?.id || null;
  if (!sofaId) {
    return {
      sofaId: null,
      lineups: null,
      incidents: [],
      stats: null,
      venueName: "",
      venueCity: "",
      referee: "",
    };
  }

  const [lineups, incidents, stats, eventDetail] = await Promise.allSettled([
    fetchSofaLineups(sofaId),
    fetchSofaIncidents(sofaId),
    fetchSofaStatistics(sofaId),
    fetchSofaEventDetail(sofaId),
  ]);

  const detail = eventDetail.status === "fulfilled" ? eventDetail.value : null;

  return {
    sofaId,
    lineups: lineups.status === "fulfilled" ? lineups.value : null,
    incidents: incidents.status === "fulfilled" ? incidents.value || [] : [],
    stats: stats.status === "fulfilled" ? stats.value : null,
    venueName: String(detail?.venue?.name || sofaEvent?.venue?.name || ""),
    venueCity: String(
      detail?.venue?.city?.name || sofaEvent?.venue?.city || "",
    ),
    referee: String(
      detail?.referee?.name ||
        detail?.referee?.shortName ||
        sofaEvent?.referee ||
        "",
    ),
  };
}

// ─── Sofascore Squad Photos ──────────────────────────────────────────────────

/**
 * Find a Sofascore team ID by name via their search API.
 * Cached 12h for found, 2h for not-found.
 * @param {string} teamName - Display name (e.g. "Arsenal", "Bayern Munich")
 * @returns {Promise<string|null>} Sofascore team ID or null
 */
export async function findSofaTeamId(teamName) {
  if (!teamName) return null;
  const searchKey = normalizeTeamKey(teamName);
  if (!searchKey) return null;

  const cacheKey = `sofa_team_id_search_${searchKey}`;
  const cached = await cache.get(cacheKey);
  if (cached !== undefined && cached !== null) return cached;

  try {
    const query = encodeURIComponent(
      searchKey.split(" ").slice(0, 3).join(" "),
    );
    const url = `${SOFASCORE_BASE}/search/teams/${query}/page/1`;
    const resp = await fetch(url, {
      headers: sofaHeaders(),
      signal: AbortSignal.timeout(SOFASCORE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      cache.set(cacheKey, null, 2 * 3600_000);
      return null;
    }
    const data = await resp.json().catch(() => ({}));
    const teams = Array.isArray(data?.teams) ? data.teams : [];

    let bestId = null;
    let bestScore = 0;
    for (const t of teams) {
      const tKey = normalizeTeamKey(t?.name || "");
      const tShort = normalizeTeamKey(t?.shortName || "");
      const s1 = teamNameSimilarity(searchKey, tKey);
      const s2 = teamNameSimilarity(searchKey, tShort);
      const score = Math.max(s1, s2);
      if (score > bestScore && score >= 0.55) {
        bestScore = score;
        bestId = String(t.id);
      }
    }

    cache.set(cacheKey, bestId, bestId ? 12 * 3600_000 : 2 * 3600_000);
    if (bestId) {
      log.info(
        `team search: "${teamName}" → sofa id ${bestId} (score=${bestScore.toFixed(2)})`,
      );
    }
    return bestId;
  } catch (e) {
    log.warn(`team search error for "${teamName}": ${e.message}`);
    cache.set(cacheKey, null, 2 * 3600_000);
    return null;
  }
}

/**
 * Fetch Sofascore squad photos for a team.
 * Returns array of { id, name, shortName, photo } or null.
 * @returns {Promise<Array<{id: string, name: string, shortName: string, photo: string}>|null>}
 */
export async function fetchSofaSquadPhotos(sofaTeamId) {
  if (!sofaTeamId) return null;
  const cacheKey = `sofa_squad_photos_shared_${sofaTeamId}`;
  const cached = await cache.get(cacheKey);
  if (cached !== undefined && cached !== null) return cached;

  try {
    const url = `${SOFASCORE_BASE}/team/${encodeURIComponent(sofaTeamId)}/players`;
    const resp = await fetch(url, {
      headers: sofaHeaders(),
      signal: AbortSignal.timeout(SOFASCORE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      cache.set(cacheKey, null, 2 * 60_000);
      return null;
    }
    const data = await resp.json().catch(() => ({}));
    const rows = Array.isArray(data?.players) ? data.players : [];
    const result = rows
      .map(({ player: p }) => {
        if (!p?.id) return null;
        return {
          id: String(p.id),
          name: String(p.name || ""),
          shortName: String(p.shortName || p.name || ""),
          photo: `https://api.sofascore.app/api/v1/player/${encodeURIComponent(p.id)}/image`,
        };
      })
      .filter(Boolean);
    const value = result.length ? result : null;
    cache.set(cacheKey, value, 30 * 60_000);
    return value;
  } catch {
    cache.set(cacheKey, null, 2 * 60_000);
    return null;
  }
}

/**
 * Combined: find Sofascore team ID + fetch squad photos.
 * Convenience wrapper for lineup photo enrichment.
 * @param {string} teamName
 * @returns {Promise<Array<{id: string, name: string, shortName: string, photo: string}>|null>}
 */
export async function fetchSofaTeamSquadPhotos(teamName) {
  const teamId = await findSofaTeamId(teamName);
  return teamId ? fetchSofaSquadPhotos(teamId) : null;
}

function teamNameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const tokA = a.split(" ").filter(Boolean);
  const tokB = b.split(" ").filter(Boolean);
  const setA = new Set(tokA);
  const setB = new Set(tokB);
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap++;
  return overlap / Math.max(setA.size, setB.size, 1);
}
