# Nexora (app + server)

## 1) Install
Open this folder in VS Code (the folder that contains **package.json**).

In Terminal:
```bash
npm install
npm run setup   # creates app/.env and server/.env from the examples
npm run doctor  # verifies Node/.env and checks Java for Android tooling
```

> 📁 **Environment setup**
> If you prefer manual control, copy the example files yourself and configure the
> API base URL and any required keys:
> ```bash
> cp app/.env.example app/.env
> cp server/.env.example server/.env
> # edit EXPO_PUBLIC_API_BASE in app/.env if you plan to run on a device
> # fill in optional keys in server/.env (TMDB, AI providers, Apify)
> # and optionally TMDB, OpenAI, etc.
> ```

## 2) Start server + app together
```bash
npm run dev
```

- Server runs on http://localhost:8080 (change in server/index.js if needed)
- Expo runs on port 8082 in non-interactive mode for reliable startup in scripts/CI.
- Dev script frees ports 8080 and 8082 automatically before startup.

## Run app without local server (cloud backend)
If you don't want to start `server` on your Mac every time, deploy the backend once and point the app to that URL.

### Free cloud option (Render)
1. Push this repo to GitHub.
2. In Render: **New +** → **Blueprint** → select the repo.
3. Render will detect [render.yaml](render.yaml) and create `nexora-api`.
4. In Render service environment variables, set keys from `server/.env.example` you need (for example `TMDB_API_KEY`, `OPENROUTER_API_KEY`).
5. After deploy, copy your API URL (example: `https://your-nexora-api.onrender.com`).

### Point the app to cloud API
Edit `app/.env`:
```bash
EXPO_PUBLIC_API_BASE=https://your-nexora-api.onrender.com
# optional fallback order (cloud first, local second)
EXPO_PUBLIC_API_BASES=https://your-nexora-api.onrender.com,http://localhost:8080

# optional: route sports endpoints to Cloudflare Workers
# all /api/sports/* calls use this base first
EXPO_PUBLIC_SPORTS_API_BASE=https://nexora.<your-account-or-domain>.workers.dev

# optional sports fallback list
EXPO_PUBLIC_SPORTS_API_BASES=https://nexora.<your-account-or-domain>.workers.dev,https://your-nexora-api.onrender.com
```

Then run only the app:
```bash
npm run app
```

Result: app works without running `npm run server` locally.

## Network architecture (production)
- Sports routes (`/api/sports/*`): App -> Cloudflare Worker (`EXPO_PUBLIC_SPORTS_API_BASE`) -> Render (`RENDER_SPORTS_ORIGIN`) -> upstream providers.
- Non-sports routes (`/api/*`): App -> Render (`EXPO_PUBLIC_API_BASE`).
- Fallback path for sports: if Cloudflare is unavailable/transiently failing, app automatically retries Render.

Recommended env setup:
```bash
EXPO_PUBLIC_API_BASE=https://nexora-api-8xxb.onrender.com
EXPO_PUBLIC_SPORTS_API_BASE=https://nexora.dhgpfz2h8r.workers.dev
EXPO_PUBLIC_SPORTS_API_BASES=https://nexora.dhgpfz2h8r.workers.dev,https://nexora-api-8xxb.onrender.com
```

## Cloudflare Worker deploy (monorepo-safe)
If Cloudflare Build Logs show:
"The Wrangler application detection logic has been run in the root of a workspace..."

Use this deploy command in Cloudflare Worker settings:
```bash
npm run cloudflare:deploy
```

This command always points Wrangler to the worker config in `cloudflare/sports-worker/wrangler.toml`, even when the repository root is used as working directory.

Optional local check:
```bash
npm run cloudflare:deploy:dry-run
```

## Java (Android)
- For Android builds/emulator support, install JDK 17+.
- Verify with:
```bash
java -version
```

## 3) Start only server
```bash
npm run server
```

## 4) Start only app
```bash
npm run app
```

## Updates zonder nieuwe APK (OTA)
Je hoeft niet telkens een nieuwe APK te bouwen voor JS/UI wijzigingen.

Eenmalig:
- Installeer 1 release APK op je toestel, bijvoorbeeld [releases/nexora-release-2026-03-05.apk](releases/nexora-release-2026-03-05.apk).

Daarna voor updates:
```bash
cd app
npx eas login
npm run ota:production
```

De app checkt updates automatisch bij opstarten en je kunt ook handmatig via Profile → About → Check app updates.

Wanneer is toch een nieuwe APK nodig?
- Alleen bij native wijzigingen (nieuwe native package, Android/iOS config, permissions, SDK/native dependency updates).
- Voor gewone scherm-, stijl-, API- en business logic updates volstaat OTA.

## Common error: ENOENT package.json
If you see `Could not read package.json`, you opened the wrong folder.
Open the **root** folder (this one), not the subfolders.

## Quick sports standings smoke test
To quickly verify ESPN standings coverage for the main leagues:

```bash
npm run sports:standings:smoke
```

Optional custom league set:

```bash
node scripts/sports-standings-smoke.mjs --leagues=eng.1,bel.1,uefa.champions
```
