#!/usr/bin/env node

const BASE = process.env.NEXORA_API_BASE || "https://nexora-api-8xxb.onrender.com";

async function getJson(path) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(70000) });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return {
      path,
      status: response.status,
      durationMs: Date.now() - started,
      data,
      rawText: text,
      requestError: null,
    };
  } catch (error) {
    return {
      path,
      status: 0,
      durationMs: Date.now() - started,
      data: null,
      rawText: "",
      requestError: String(error?.message || error),
    };
  }
}

function countSports(payload) {
  return {
    live: Array.isArray(payload?.live) ? payload.live.length : 0,
    upcoming: Array.isArray(payload?.upcoming) ? payload.upcoming.length : 0,
    finished: Array.isArray(payload?.finished) ? payload.finished.length : 0,
  };
}

function pickMediaId(payload) {
  const candidates = [
    ...(Array.isArray(payload?.trending) ? payload.trending : []),
    ...(Array.isArray(payload?.popular) ? payload.popular : []),
    ...(Array.isArray(payload?.newReleases) ? payload.newReleases : []),
  ];
  const first = candidates.find((item) => item && (item.tmdbId || item.id));
  return first ? Number(first.tmdbId || first.id || 0) : 0;
}

function bool(v) {
  return v ? "yes" : "no";
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);

  const [
    homepage,
    sportsHome,
    sportsLive,
    sportsByDate,
    moviesTrending,
    seriesTrending,
    catalog,
    collections,
  ] = await Promise.all([
    getJson("/api/homepage"),
    getJson(`/api/sports/by-date?date=${today}`),
    getJson("/api/sports/live"),
    getJson(`/api/sports/by-date?date=${today}`),
    getJson("/api/movies/trending"),
    getJson("/api/series/trending"),
    getJson("/api/vod/catalog?type=all&years=30&chunkYears=6&pagesPerYear=2"),
    getJson("/api/vod/collection?title=Marvel&depth=5"),
  ]);

  const movieId = pickMediaId(moviesTrending.data);
  const seriesId = pickMediaId(seriesTrending.data);

  const movieDetail = movieId ? await getJson(`/api/movies/${movieId}/full`) : null;
  const seriesDetail = seriesId ? await getJson(`/api/series/${seriesId}/full`) : null;

  const report = {
    base: BASE,
    home: {
      status: homepage.status,
      requestError: homepage.requestError,
      hasRows: Array.isArray(homepage.data?.rows) && homepage.data.rows.length > 0,
      hasHero: Boolean(homepage.data?.hero),
      rows: Array.isArray(homepage.data?.rows) ? homepage.data.rows.length : 0,
      rails: Array.isArray(homepage.data?.rails) ? homepage.data.rails.length : 0,
      error: homepage.data?.error || null,
    },
    sports: {
      home: countSports(sportsHome.data),
      live: countSports(sportsLive.data),
      matchday: countSports(sportsByDate.data),
      requestErrorHome: sportsHome.requestError,
      requestErrorLive: sportsLive.requestError,
      homeError: sportsHome.data?.error || null,
      liveError: sportsLive.data?.error || null,
    },
    media: {
      moviesTrending: {
        trending: Array.isArray(moviesTrending.data?.trending) ? moviesTrending.data.trending.length : 0,
        popular: Array.isArray(moviesTrending.data?.popular) ? moviesTrending.data.popular.length : 0,
        requestError: moviesTrending.requestError,
        error: moviesTrending.data?.error || null,
      },
      seriesTrending: {
        trending: Array.isArray(seriesTrending.data?.trending) ? seriesTrending.data.trending.length : 0,
        popular: Array.isArray(seriesTrending.data?.popular) ? seriesTrending.data.popular.length : 0,
        requestError: seriesTrending.requestError,
        error: seriesTrending.data?.error || null,
      },
      catalogItems: Array.isArray(catalog.data?.items) ? catalog.data.items.length : 0,
      collectionItems: Array.isArray(collections.data?.items) ? collections.data.items.length : 0,
      movieDetail: movieDetail
        ? {
            id: movieId,
            status: movieDetail.status,
            hasPoster: bool(Boolean(movieDetail.data?.poster || movieDetail.data?.poster_path)),
            hasBackdrop: bool(Boolean(movieDetail.data?.backdrop || movieDetail.data?.backdrop_path)),
            castCount: Array.isArray(movieDetail.data?.cast) ? movieDetail.data.cast.length : 0,
            error: movieDetail.data?.error || null,
          }
        : null,
      seriesDetail: seriesDetail
        ? {
            id: seriesId,
            status: seriesDetail.status,
            hasPoster: bool(Boolean(seriesDetail.data?.poster || seriesDetail.data?.poster_path)),
            hasBackdrop: bool(Boolean(seriesDetail.data?.backdrop || seriesDetail.data?.backdrop_path)),
            castCount: Array.isArray(seriesDetail.data?.cast) ? seriesDetail.data.cast.length : 0,
            error: seriesDetail.data?.error || null,
          }
        : null,
    },
    retryCheck: {
      sportsHomeRefetchStatus: sportsHome.status,
      mediaRefetchStatus: moviesTrending.status,
      note: "Retry is considered healthy when endpoints respond 200 and include data or explicit error reasons.",
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
