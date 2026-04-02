/**
 * Nexora – Sports API Routes (v2)
 *
 * Clean Express Router for all sports endpoints.
 * Uses canonical response envelopes from shared/response.js.
 * Calls ESPN (keyless) as primary source; structured fallback behavior.
 *
 * Mounts at: /api/sports (registered in index.js)
 *
 * These routes REPLACE the inline logic in index.js for the listed paths.
 * Old handler fallback: index.js catches anything this router doesn't handle.
 */

import { Router } from 'express';
import { safeFetchJson, UpstreamError } from '../shared/fetcher.js';
import { cache, TTL } from '../shared/cache.js';
import { ok, err, empty, send } from '../shared/response.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('sports');
const router = Router();

// ─── ESPN Configuration ───────────────────────────────────────────────────────
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_TIMEOUT_MS = Number(process.env.ESPN_TIMEOUT_MS || 5_000);
const ESPN_API_KEY = String(process.env.ESPN_API_KEY || '').trim();

function withKey(url) {
  if (!ESPN_API_KEY) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}apikey=${ESPN_API_KEY}`;
}

function espnHeaders() {
  return {
    Accept: 'application/json',
    'Accept-Language': 'en-US',
    'x-forwarded-for': '1.1.1.1',
  };
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────
function getTodayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function getDateParam(req) {
  const raw = String(req.query.date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : getTodayYmd();
}

function ymdToEspnDate(ymd) {
  return ymd.replace(/-/g, '');
}

function seasonForDate(d) {
  const yr = d.getFullYear();
  return d.getMonth() >= 6 ? yr : yr - 1;
}

// ─── Supported Leagues ────────────────────────────────────────────────────────
const SOCCER_LEAGUES = {
  'bel.1':              'Jupiler Pro League',
  'eng.1':              'Premier League',
  'esp.1':              'La Liga',
  'ger.1':              'Bundesliga',
  'fra.1':              'Ligue 1',
  'ita.1':              'Serie A',
  'ned.1':              'Eredivisie',
  'por.1':              'Primeira Liga',
  'usa.1':              'MLS',
  'uefa.champions':     'UEFA Champions League',
  'uefa.europa':        'UEFA Europa League',
  'uefa.europa.conf':   'UEFA Europa Conference League',
  'fifa.world':         'FIFA World Cup',
  'uefa.euro':          'UEFA European Championship',
  'eng.2':              'Championship',
  'ger.2':              '2. Bundesliga',
  'fra.2':              'Ligue 2',
  'ita.2':              'Serie B',
  'ned.2':              'Eerste Divisie',
  'bel.2':              'Challenger Pro League',
  'esp.2':              'La Liga 2',
  'sco.1':              'Scottish Premiership',
  'tur.1':              'Süper Lig',
};

// ─── Payload Normalizers ──────────────────────────────────────────────────────

function normalizeStatus(comp) {
  const state = comp?.status?.type?.state;
  if (state === 'in') return 'live';
  if (state === 'post') return 'finished';
  return 'upcoming';
}

function normalizeTeamFromCompetitor(c) {
  if (!c) return null;
  return {
    id:        c.team?.id ?? c.id ?? null,
    name:      c.team?.displayName ?? c.team?.name ?? String(c),
    shortName: c.team?.abbreviation ?? null,
    logo:      c.team?.logo ?? null,
    score:     c.score != null ? Number(c.score) : null,
    isHome:    c.homeAway === 'home',
  };
}

function normalizeEventToMatch(ev, leagueSlug) {
  const comps = ev.competitions?.[0];
  const competitors = comps?.competitors ?? [];
  const home = normalizeTeamFromCompetitor(competitors.find(c => c.homeAway === 'home'));
  const away = normalizeTeamFromCompetitor(competitors.find(c => c.homeAway === 'away'));

  const status = normalizeStatus(comps);
  const statusDetail = comps?.status?.type?.detail ?? null;
  const clock = comps?.status?.displayClock ?? null;
  const period = comps?.status?.period ?? null;

  return {
    id:           ev.id,
    uid:          ev.uid ?? ev.id,
    leagueSlug:   leagueSlug ?? ev._espnLeagueHint ?? null,
    leagueName:   ev._leagueHint ?? SOCCER_LEAGUES[leagueSlug] ?? null,
    startTime:    ev.date ?? null,
    status,
    statusDetail,
    clock,
    period,
    homeTeam:     home,
    awayTeam:     away,
    venue:        comps?.venue?.fullName ?? null,
    source:       'espn',
  };
}

// ─── ESPN Fetchers ────────────────────────────────────────────────────────────

async function fetchLeagueScoreboard(leagueSlug, dates) {
  const dateParam = dates ? `?dates=${dates}&limit=20` : '?limit=20';
  const url = withKey(`${ESPN_BASE}/soccer/${leagueSlug}/scoreboard${dateParam}`);
  try {
    const data = await safeFetchJson(url, { timeoutMs: ESPN_TIMEOUT_MS, source: `espn:${leagueSlug}`, headers: espnHeaders() });
    const events = (data?.events ?? []).map(ev => ({
      ...ev,
      _espnLeagueHint: leagueSlug,
      _leagueHint: SOCCER_LEAGUES[leagueSlug],
    }));
    return events;
  } catch (e) {
    log.warn('league scoreboard fetch failed', { leagueSlug, message: e.message });
    return [];
  }
}

// Prioritize top leagues to get faster first results
const TOP_LEAGUES = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'ned.1', 'bel.1', 'uefa.champions', 'uefa.europa'];

async function fetchAllScoreboards(dateYmd) {
  const dates = ymdToEspnDate(dateYmd);
  const slugs = Object.keys(SOCCER_LEAGUES);

  // Fetch all leagues in parallel; individual failures don't block
  const results = await Promise.allSettled(
    slugs.map(slug => fetchLeagueScoreboard(slug, dates))
  );

  let allEvents = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allEvents.push(...r.value);
  }

  // If date-specific fetch returned nothing, try current scoreboard (no date)
  // ESPN without date filter returns the nearest matchday's events
  if (allEvents.length === 0) {
    log.info('no events for date, trying current scoreboard', { dateYmd });
    const fallbackResults = await Promise.allSettled(
      TOP_LEAGUES.map(slug => fetchLeagueScoreboard(slug, null))
    );
    for (const r of fallbackResults) {
      if (r.status === 'fulfilled') allEvents.push(...r.value);
    }
  }

  log.info('scoreboard fetched', { dateYmd, leagueCount: slugs.length, eventCount: allEvents.length });
  return allEvents;
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

function groupByStatus(matches) {
  const live     = matches.filter(m => m.status === 'live');
  const upcoming = matches.filter(m => m.status === 'upcoming');
  const finished = matches.filter(m => m.status === 'finished');
  return { live, upcoming, finished };
}

function isValidSportsPayload(payload) {
  if (!payload) return false;
  const { live = [], upcoming = [], finished = [] } = payload;
  return live.length + upcoming.length + finished.length > 0;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/sports/live
 * Live matches right now.
 */
router.get('/live', async (req, res) => {
  const date = getDateParam(req);
  const key  = `sports_v2_live_${date}`;

  try {
    const { value: payload, isCached, isStale, isFallback } =
      await cache.getOrFetchWithStale(key, TTL.LIVE, async () => {
        const events  = await fetchAllScoreboards(date);
        const matches = events.map(ev => normalizeEventToMatch(ev, ev._espnLeagueHint));
        const { live } = groupByStatus(matches);
        return { date, live };
      });

    await cache.rememberLastGood(key, payload);

    if (!isValidSportsPayload({ live: payload?.live ?? [] })) {
      const lastGood = await cache.getLastGood(key);
      if (lastGood) {
        return send(res, ok(lastGood, { source: 'espn', isCached: true, isStale: true, isFallback: true }));
      }
    }

    return send(res, ok(payload, { source: 'espn', isCached, isStale, isFallback }));
  } catch (e) {
    log.error('live endpoint error', { message: e.message });
    const lastGood = await cache.getLastGood(key);
    if (lastGood) {
      return send(res, ok(lastGood, { source: 'espn', isCached: true, isStale: true, isFallback: true }));
    }
    return send(res, err('SPORTS_LIVE_UNAVAILABLE', 'Live sports data is currently unavailable', { source: 'espn' }), 503);
  }
});

/**
 * GET /api/sports/by-date?date=YYYY-MM-DD
 * All matches for a given date (live + upcoming + finished).
 * Primary endpoint; /api/sports/today is a backward-compat alias.
 */
router.get('/by-date', async (req, res) => {
  const date   = getDateParam(req);
  const today  = getTodayYmd();
  const isToday = date === today;
  const ttlMs  = isToday ? TTL.MATCHDAY : TTL.FINISHED;
  const key    = `sports_v2_by_date_${date}_s${seasonForDate(new Date(date + 'T12:00:00Z'))}`;

  try {
    const { value: payload, isCached, isStale, isFallback } =
      await cache.getOrFetchWithStale(key, ttlMs, async () => {
        const events  = await fetchAllScoreboards(date);
        const matches = events.map(ev => normalizeEventToMatch(ev, ev._espnLeagueHint));
        return {
          date,
          ...groupByStatus(matches),
        };
      });

    await cache.rememberLastGood(key, payload);

    if (!isValidSportsPayload(payload)) {
      const lastGood = await cache.getLastGood(key);
      if (lastGood) {
        return send(res, ok(lastGood, { source: 'espn', isCached: true, isStale: true, isFallback: true }));
      }
      return send(res, empty({ date, live: [], upcoming: [], finished: [] }, { source: 'espn' }));
    }

    return send(res, ok(payload, { source: 'espn', isCached, isStale, isFallback }));
  } catch (e) {
    log.error('by-date endpoint error', { date, message: e.message });
    const lastGood = await cache.getLastGood(key);
    if (lastGood) {
      return send(res, ok(lastGood, { source: 'espn', isCached: true, isStale: true, isFallback: true }));
    }
    return send(res, err('SPORTS_MATCHDAY_UNAVAILABLE', 'Sports schedule is currently unavailable', { source: 'espn' }), 503);
  }
});

/**
 * GET /api/sports/today
 * Backward-compat alias for /api/sports/by-date (today's date).
 */
router.get('/today', (req, res) => {
  const today = getTodayYmd();
  res.redirect(307, `/api/sports/by-date?date=${today}`);
});

/**
 * GET /api/sports/live/by-date
 * Backward-compat alias for /api/sports/by-date.
 */
router.get('/live/by-date', (req, res) => {
  const date = String(req.query?.date || '').trim();
  const suffix = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : '';
  res.redirect(307, `/api/sports/by-date${suffix}`);
});

/**
 * GET /api/sports/standings/:league
 * Competition standings from ESPN.
 */
router.get('/standings/:league', async (req, res) => {
  const leagueRaw = String(req.params.league || '').trim().toLowerCase();
  // Map friendly names to ESPN slugs
  const espnSlug = SOCCER_LEAGUES[leagueRaw] ? leagueRaw : Object.keys(SOCCER_LEAGUES).find(k =>
    SOCCER_LEAGUES[k].toLowerCase().replace(/\s+/g, '-') === leagueRaw
  ) ?? leagueRaw;

  const key = `sports_v2_standings_${espnSlug}`;

  try {
    const { value, isCached } = await cache.getOrFetch(key, TTL.STANDINGS, async () => {
      const url = withKey(`${ESPN_BASE}/soccer/${espnSlug}/standings`);
      const data = await safeFetchJson(url, { timeoutMs: ESPN_TIMEOUT_MS, source: 'espn:standings', headers: espnHeaders() });

      const standings = (data?.standings ?? []).flatMap(group =>
        (group.entries ?? []).map((entry, i) => ({
          rank:          i + 1,
          teamId:        entry.team?.id ?? null,
          teamName:      entry.team?.displayName ?? entry.team?.name ?? 'Unknown',
          teamLogo:      entry.team?.logo ?? null,
          played:        statValue(entry.stats, 'gamesPlayed'),
          won:           statValue(entry.stats, 'wins'),
          drawn:         statValue(entry.stats, 'ties'),
          lost:          statValue(entry.stats, 'losses'),
          goalsFor:      statValue(entry.stats, 'pointsFor'),
          goalsAgainst:  statValue(entry.stats, 'pointsAgainst'),
          goalDifference:statValue(entry.stats, 'pointDifferential'),
          points:        statValue(entry.stats, 'points'),
        }))
      );

      return { league: espnSlug, leagueName: SOCCER_LEAGUES[espnSlug] ?? espnSlug, standings };
    });

    return send(res, ok(value, { source: 'espn', isCached }));
  } catch (e) {
    log.error('standings error', { league: espnSlug, message: e.message });
    if (e instanceof UpstreamError && e.status === 404) {
      return send(res, err('LEAGUE_NOT_FOUND', `League '${espnSlug}' not found`, { source: 'espn' }), 404);
    }
    return send(res, err('STANDINGS_UNAVAILABLE', 'Standings are temporarily unavailable', { source: 'espn' }), 503);
  }
});

/**
 * GET /api/sports/health
 * Fast health check for keepalive; bypasses cache.
 */
router.get('/health', (_req, res) => {
  return res.json({ ok: true, service: 'nexora-sports', ts: new Date().toISOString() });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statValue(stats = [], key) {
  const entry = stats.find(s => s.name === key || s.abbreviation === key);
  return entry != null ? Number(entry.value ?? 0) : 0;
}

export default router;
