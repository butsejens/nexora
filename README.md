# CineLog

**Discover. Track. Watch.**

CineLog is a movies-and-series discovery and tracking app. Browse trending films
and shows, build a watchlist, rate what you've seen, tick off episodes, and pick
up where you left off. It runs from one codebase on iOS, Android and the web.

CineLog does not host or stream video. Trailers play through YouTube's official
embedded player; everything else is metadata.

## What's in the repo

| Path | Purpose |
| --- | --- |
| `app/` | Expo / React Native app (iOS, Android, web) using Expo Router |
| `server/` | Node API that proxies TMDB, keeping the API key server-side |
| `scripts/` | Release tooling, env policy checks and secret handling |
| `android/` | Committed Android project used by the APK release workflow |

## 1. Install

```bash
npm install
npm run setup    # creates app/.env and server/.env from the examples
npm run doctor   # verifies Node, .env files and Android tooling
```

## 2. Configure

The app reaches its data through the CineLog media API, which holds the TMDB key.
Point the app at an API instance in `app/.env`:

```bash
EXPO_PUBLIC_API_BASE=https://your-cinelog-api.onrender.com
```

To run the API yourself, put a free [TMDB key](https://www.themoviedb.org/settings/api)
in `server/.env` as `TMDB_API_KEY`. The key never reaches the client.

Standalone builds shipped without a backend can instead set
`EXPO_PUBLIC_TMDB_API_KEY` in `app/.env` and talk to TMDB directly. That key is
inlined into the bundle, so only use it for builds you control. See
`app/.env.example` for the full list of client variables.

## 3. Run

```bash
npm run dev        # API on :8080 and the Expo dev server together
npm run app        # app only, against whatever EXPO_PUBLIC_API_BASE points to
npm run app:web    # app in the browser
npm run server     # API only
```

## Architecture

```
app/
  app/                 Expo Router routes
    (tabs)/            home, movies, series, search, watchlist
    movie/[id].tsx     movie detail
    series/[id].tsx    series detail with seasons and episodes
    person/[id].tsx    cast and crew profiles
  components/          reusable UI (poster cards, carousels, hero, skeletons)
  lib/cinelog/         data layer: types, API client, query hooks, recommendations
  store/               persisted library, settings and account state
  constants/theme.ts   design tokens — the only source of colour and spacing
```

**Data.** `lib/cinelog/api.ts` is the single place that talks to a network. It
normalises both the CineLog API's payloads and raw TMDB responses into the types
in `lib/cinelog/types.ts`, so switching transport changes nothing downstream.
React Query caches everything; curated collections arrive as two bundled requests
per media type, so the home screen loads in two round trips.

**Library.** Watchlist, favourites, ratings, watch history and per-episode
progress live in `store/library-store.ts`, persisted to the device so the app
works offline and survives restarts. Continue Watching is derived from episode
ticks and watch state.

**Recommendations.** `lib/cinelog/recommendations.ts` builds a taste profile from
watch history, ratings, favourites and the watchlist, widens it with adjacent
genres, and scores candidates against it. That drives both "Recommended For You"
and "Because You Watched …".

## Quality gates

```bash
npm run ci:lint        # eslint
npm run ci:typecheck   # tsc --noEmit
npm run ci:test        # release tooling and manifest tests
npm run ci:validate    # everything CI runs
```

## Releasing

```bash
npm run release:decide   # decides OTA vs native build from the changed files
npm run release:apk      # local Android release build
npm run ota:production   # publish an Expo OTA update
```

`scripts/release/` holds the decision engine and pipeline policy; both are
covered by tests in `npm run release:test`.

## Attribution

Movie and series data comes from [The Movie Database](https://www.themoviedb.org/).
CineLog uses the TMDB API but is not endorsed or certified by TMDB.
