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
const FOOTBALL_DATA_TIMEOUT_MS = Number(process.env.FOOTBALL_DATA_TIMEOUT_MS || 8_000);
const SALIMT_TEAM_COMP_SEASONS_CSV = 'https://raw.githubusercontent.com/salimt/football-datasets/main/datalake/transfermarkt/team_competitions_seasons/team_competitions_seasons.csv';
const SALIMT_TEAM_DETAILS_CSV = 'https://raw.githubusercontent.com/salimt/football-datasets/main/datalake/transfermarkt/team_details/team_details.csv';
const SALIMT_TIMEOUT_MS = Number(process.env.SALIMT_DATA_TIMEOUT_MS || 10_000);

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

// Historical open-data mapping (datasets/football-datasets via football-data.co.uk)
const FOOTBALL_DATA_LEAGUES = [
  { slug: 'eng.1', name: 'Premier League', division: 'E0' },
  { slug: 'esp.1', name: 'La Liga', division: 'SP1' },
  { slug: 'ita.1', name: 'Serie A', division: 'I1' },
  { slug: 'ger.1', name: 'Bundesliga', division: 'D1' },
  { slug: 'fra.1', name: 'Ligue 1', division: 'F1' },
];

const SALIMT_LEAGUE_FILTERS = {
  'eng.1': { include: ['premier league'], exclude: ['premier league 2'] },
  'esp.1': { include: ['la liga'] },
  'ita.1': { include: ['serie a'] },
  'ger.1': { include: ['bundesliga'] },
  'fra.1': { include: ['ligue 1'] },
  'ned.1': { include: ['eredivisie'] },
};

// ─── Payload Normalizers ──────────────────────────────────────────────────────

// Parse ESPN displayClock (e.g. "45:00", "90+2'", "HT") to an integer minute.
function clockToMinute(clock) {
  if (!clock || typeof clock !== 'string') return null;
  const m = clock.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

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

  const minute = status === 'live' ? clockToMinute(clock) : null;

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
      minute,
    homeTeam:     home,
    awayTeam:     away,
    venue:        comps?.venue?.fullName ?? null,
    source:       'espn',
  };
}

function seasonCodeForFootballData(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const seasonStart = month >= 7 ? year : year - 1;
  const s = String(seasonStart % 100).padStart(2, '0');
  const e = String((seasonStart + 1) % 100).padStart(2, '0');
  return `${s}${e}`;
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function normalizeLeagueText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .trim();
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isLeagueRowMatch(rowLeagueRaw, leagueSlug, leagueNeedle) {
  const rowLeague = normalizeLeagueText(rowLeagueRaw);
  if (!rowLeague) return false;

  const filter = SALIMT_LEAGUE_FILTERS[leagueSlug];
  if (filter) {
    const includes = (filter.include || []).map(normalizeLeagueText);
    const excludes = (filter.exclude || []).map(normalizeLeagueText);
    if (includes.length > 0 && !includes.includes(rowLeague)) return false;
    if (excludes.some((bad) => bad && rowLeague.includes(bad))) return false;
    return true;
  }

  return rowLeague === leagueNeedle;
}

function isLikelyYouthOrReserveTeam(teamName) {
  const text = String(teamName || '').trim();
  if (!text) return false;
  return /\b(u\s?-?\s?\d{2}|u21|u23|reserves?| ii)\b/i.test(text);
}

async function fetchCsvTextWithCache(url, key, ttlMs, timeoutMs) {
  const result = await cache.getOrFetch(key, ttlMs, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new UpstreamError(`csv ${response.status}`, 'salimt', response.status);
    }
    return response.text();
  });
  return String(result.value || '');
}

async function fetchSalimtStandings(leagueSlug) {
  const leagueName = SOCCER_LEAGUES[leagueSlug] || leagueSlug;
  const leagueNeedle = normalizeLeagueText(leagueName);

  const [seasonsCsv, detailsCsv] = await Promise.all([
    fetchCsvTextWithCache(
      SALIMT_TEAM_COMP_SEASONS_CSV,
      'sports_v2_salimt_team_comp_seasons_csv',
      TTL.STANDINGS,
      SALIMT_TIMEOUT_MS,
    ),
    fetchCsvTextWithCache(
      SALIMT_TEAM_DETAILS_CSV,
      'sports_v2_salimt_team_details_csv',
      TTL.STANDINGS,
      SALIMT_TIMEOUT_MS,
    ),
  ]);

  if (!seasonsCsv) return null;

  const seasonLines = seasonsCsv.split(/\r?\n/).filter(Boolean);
  if (seasonLines.length < 2) return null;
  const seasonHeader = splitCsvLine(seasonLines[0]);

  const seasonRows = [];
  for (let i = 1; i < seasonLines.length; i += 1) {
    const cols = splitCsvLine(seasonLines[i]);
    if (!cols.length) continue;
    const row = {};
    for (let c = 0; c < seasonHeader.length; c += 1) {
      row[seasonHeader[c]] = cols[c] ?? '';
    }
    const rowLeague = row.season_league_league_name || row.competition_name || '';
    if (!isLeagueRowMatch(rowLeague, leagueSlug, leagueNeedle)) continue;
    seasonRows.push(row);
  }

  if (!seasonRows.length) return null;

  const latestSeason = Math.max(
    ...seasonRows.map((row) => toNum(row.season_id, -1)).filter((n) => n >= 0),
  );
  const currentRows = seasonRows.filter((row) => toNum(row.season_id, -1) === latestSeason);
  if (!currentRows.length) return null;

  const logoByClubId = new Map();
  if (detailsCsv) {
    const detailLines = detailsCsv.split(/\r?\n/).filter(Boolean);
    if (detailLines.length > 1) {
      const detailHeader = splitCsvLine(detailLines[0]);
      for (let i = 1; i < detailLines.length; i += 1) {
        const cols = splitCsvLine(detailLines[i]);
        if (!cols.length) continue;
        const row = {};
        for (let c = 0; c < detailHeader.length; c += 1) {
          row[detailHeader[c]] = cols[c] ?? '';
        }
        const clubId = String(row.club_id || '').trim();
        const logo = String(row.logo_url || '').trim();
        if (clubId && logo && !logoByClubId.has(clubId)) {
          logoByClubId.set(clubId, logo);
        }
      }
    }
  }

  const standings = currentRows
    .map((row) => {
      const clubId = String(row.club_id || '').trim();
      const goalsFor = toNum(row.season_goals_for, 0);
      const goalsAgainst = toNum(row.season_goals_against, 0);
      const fallbackDiff = goalsFor - goalsAgainst;
      return {
        rank: toNum(row.season_rank, 9999),
        teamId: clubId || null,
        teamName: String(row.team_name || '').trim() || 'Unknown',
        teamLogo: logoByClubId.get(clubId) || null,
        played: toNum(row.season_total_matches, 0),
        won: toNum(row.season_wins, 0),
        drawn: toNum(row.season_draws, 0),
        lost: toNum(row.season_losses, 0),
        goalsFor,
        goalsAgainst,
        goalDifference: toNum(row.season_goal_difference, fallbackDiff),
        points: toNum(row.season_points, 0),
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .filter((row) => row.teamName && row.teamName !== 'Unknown' && !isLikelyYouthOrReserveTeam(row.teamName));

  if (!standings.length) return null;

  return {
    league: leagueSlug,
    leagueName,
    seasonId: latestSeason,
    standings,
  };
}

function footballDataDateToYmd(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = String(Number(m[1])).padStart(2, '0');
  const month = String(Number(m[2])).padStart(2, '0');
  const yy = Number(m[3]);
  const year = yy < 100 ? (yy >= 70 ? 1900 + yy : 2000 + yy) : yy;
  return `${year}-${month}-${day}`;
}

function normalizeFootballDataRow(row, league, date, index) {
  const homeTeam = String(row.HomeTeam || '').trim();
  const awayTeam = String(row.AwayTeam || '').trim();
  if (!homeTeam || !awayTeam) return null;

  const homeScore = Number(row.FTHG);
  const awayScore = Number(row.FTAG);
  const kickoff = String(row.Time || '').trim();
  const kickoffIso = /^\d{1,2}:\d{2}$/.test(kickoff)
    ? `${date}T${kickoff.padStart(5, '0')}:00Z`
    : `${date}T12:00:00Z`;

  return {
    id: `fd-${league.division}-${date}-${index}`,
    uid: `fd-${league.division}-${date}-${index}`,
    leagueSlug: league.slug,
    leagueName: league.name,
    startTime: kickoffIso,
    status: 'finished',
    statusDetail: 'Final',
    clock: null,
    period: null,
    homeTeam: {
      id: null,
      name: homeTeam,
      shortName: null,
      logo: null,
      score: Number.isFinite(homeScore) ? homeScore : null,
      isHome: true,
    },
    awayTeam: {
      id: null,
      name: awayTeam,
      shortName: null,
      logo: null,
      score: Number.isFinite(awayScore) ? awayScore : null,
      isHome: false,
    },
    venue: null,
    source: 'football-data',
  };
}

async function fetchHistoricalFootballDataByDate(dateYmd) {
  const seasonCode = seasonCodeForFootballData(dateYmd);

  const jobs = FOOTBALL_DATA_LEAGUES.map(async (league) => {
    const url = `https://www.football-data.co.uk/mmz4281/${seasonCode}/${league.division}.csv`;
    const cacheKey = `sports_v2_football_data_${league.division}_${seasonCode}`;
    const csvText = await cache.getOrFetch(cacheKey, TTL.FINISHED, async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(FOOTBALL_DATA_TIMEOUT_MS) });
      if (!response.ok) {
        throw new UpstreamError(`football-data ${response.status}`, 'football-data', response.status);
      }
      return response.text();
    }).then((result) => result.value).catch(() => '');

    if (!csvText) return [];
    const lines = String(csvText).split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];

    const header = splitCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = splitCsvLine(lines[i]);
      if (!cols.length) continue;
      const row = {};
      for (let c = 0; c < header.length; c += 1) {
        row[header[c]] = cols[c] ?? '';
      }
      const rowDate = footballDataDateToYmd(row.Date);
      if (rowDate !== dateYmd) continue;
      const normalized = normalizeFootballDataRow(row, league, dateYmd, rows.length + 1);
      if (normalized) rows.push(normalized);
    }
    return rows;
  });

  const settled = await Promise.allSettled(jobs);
  const matches = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      matches.push(...item.value);
    }
  }
  return matches;
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
        const espnMatches = events.map(ev => normalizeEventToMatch(ev, ev._espnLeagueHint));

        const historicalMatches = isToday
          ? []
          : await fetchHistoricalFootballDataByDate(date);

        const dedupe = new Set();
        const matches = [];
        for (const match of [...espnMatches, ...historicalMatches]) {
          const homeName = String(match?.homeTeam?.name || '').toLowerCase().trim();
          const awayName = String(match?.awayTeam?.name || '').toLowerCase().trim();
          const keyPart = `${match.leagueSlug || ''}:${homeName}:${awayName}:${String(match.startTime || '').slice(0, 10)}`;
          if (dedupe.has(keyPart)) continue;
          dedupe.add(keyPart);
          matches.push(match);
        }

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

      if (!standings.length) {
        throw new UpstreamError('empty standings payload', 'espn', 502);
      }
      return { league: espnSlug, leagueName: SOCCER_LEAGUES[espnSlug] ?? espnSlug, standings };
    });

    return send(res, ok(value, { source: 'espn', isCached }));
  } catch (e) {
    log.error('standings error', { league: espnSlug, message: e.message });
    if (e instanceof UpstreamError && e.status === 404) {
      return send(res, err('LEAGUE_NOT_FOUND', `League '${espnSlug}' not found`, { source: 'espn' }), 404);
    }
    try {
      const fallback = await fetchSalimtStandings(espnSlug);
      if (fallback?.standings?.length) {
        return send(res, ok(fallback, { source: 'salimt-transfermarkt', isFallback: true, isStale: false, isCached: false }));
      }
    } catch (fallbackError) {
      log.warn('salimt standings fallback failed', { league: espnSlug, message: fallbackError.message });
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
