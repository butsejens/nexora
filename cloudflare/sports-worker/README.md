# Nexora Sports Worker (Cloudflare + D1 + KV + R2)

Complete Cloudflare edge cache layer for `/api/sports/*`. Includes:
- **D1**: SQLite database for durable cache storage
- **KV**: Fast in-memory cache with TTL for hot data
- **R2**: Object storage for asset CDN (logos, images)
- **Analytics Engine**: Cache hit/miss/error tracking
- **Stale-while-revalidate**: Fallback to stale cache if origin fails

## Quick Setup (5 minutes)

### 1) Create Cloudflare resources from CLI

```bash
cd cloudflare/sports-worker
npm install -g wrangler
wrangler login
```

Create D1 database:
```bash
npm run d1:create
```
Copy the `database_id` output and update `wrangler.toml`.

Create KV namespace:
```bash
npm run kv:create
npm run kv:create:preview
```
Copy both IDs to `wrangler.toml`.

Create R2 bucket (optional, for assets):
```bash
wrangler r2 bucket create nexora-assets
wrangler r2 bucket create nexora-assets-preview --preview
```

### 2) Apply schema migration

```bash
npm run d1:migrate:local   # for development
npm run d1:migrate:remote  # for production
```

### 3) Deploy Worker

```bash
npm run deploy
```

After deploy, your Worker URL will look like: `https://nexora.dhgpfz2h8r.workers.dev`

### 4) Configure app

Update `app/.env`:
```bash
EXPO_PUBLIC_SPORTS_API_BASE=https://nexora.dhgpfz2h8r.workers.dev
```

## Architecture & Cache Strategy

- **KV Cache** (fast, 100MB limit per request)
  - Live sports: 15s TTL
  - Today/upcoming: 60s TTL
  - Competitions: 5m TTL
  
- **D1 Cache** (durable, unlimited storage)
  - Persists across KV evictions
  - Fallback when origin is down
  - Stale data served for up to 2x TTL when origin fails

- **Analytics**
  - Tracks cache hit rates by endpoint
  - Monitors upstream failures
  - Helps identify high-traffic routes

## Bindings Reference

| Binding | Type | Purpose |
|---------|------|---------|
| `SPORTS_DB` | D1 | Durable sports cache + fallback |
| `SPORTS_CACHE_KV` | KV | Fast hot-data cache (15s–5m) |
| `ASSETS_R2` | R2 | Team logos, player photos, highlights |
| `SPORTS_ANALYTICS` | Analytics | Cache metrics & monitoring |
| `RENDER_SPORTS_ORIGIN` | Env Var | Render backend URL |
| `CACHE_MODE` | Env Var | `hybrid` (KV+D1) or `d1-only` |

## Local Development

```bash
npm run dev
```

Tests cache behavior locally on `http://localhost:8787/api/sports/live`

## Monitoring

### Cache hit rates
Check Cloudflare Analytics → Sports Worker dashboard

### Response headers
- `x-nexora-cache`: hit source (`kv-hit`, `d1-hit`, `d1-stale`, `miss`)
- `x-nexora-cache-key`: the cache key used
- `x-nexora-upstream`: origin server

### Logs
```bash
wrangler tail
```

## Troubleshooting

**404 / upstream unavailable**
- Check `RENDER_SPORTS_ORIGIN` in `wrangler.toml`
- Verify Render backend is accessible
- Check KV/D1 connection (run migrations again)

**KV not caching**
- Confirm `SPORTS_CACHE_KV` binding is in `wrangler.toml`
- Check quota (100MB limit per req)
- Check KV preview namespace exists

**D1 schema errors**
- Run `wrangler d1 migrations apply SPORTS_DB --remote` again
- Check D1 dashboard for migration history

