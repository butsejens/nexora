# Cloudflare Bindings Deployment Guide

This guide walks you through setting up all Cloudflare bindings for the Nexora sports worker.

## Prerequisites

- Cloudflare account with Workers enabled
- `wrangler` CLI installed globally: `npm install -g wrangler@latest`
- Authenticated: `wrangler login`
- This repository cloned/pulled

## Step-by-step Setup

### Phase 1: Create D1 SQLite Database

```bash
cd cloudflare/sports-worker
wrangler d1 create nexora-sports --preview
```

You'll see output like:
```
✓ Successfully created D1 database nexora-sports
database_id = a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

Save the `database_id`. Update `wrangler.toml`:
```toml
[[d1_databases]]
binding = "SPORTS_DB"
database_name = "nexora-sports"
database_id = "YOUR_ID_HERE"
```

### Phase 2: Create KV Namespace

KV is a fast key-value store for hot cache hits.

```bash
wrangler kv:namespace create SPORTS_CACHE_KV --preview
wrangler kv:namespace create SPORTS_CACHE_KV
```

You'll see:
```
Add the following to your wrangler.toml:

[[kv_namespaces]]
binding = "SPORTS_CACHE_KV"
id = "YOUR_PRODUCTION_ID"
preview_id = "YOUR_PREVIEW_ID"
```

Update `wrangler.toml` with both IDs.

### Phase 3: Create R2 Bucket (Optional)

R2 stores team logos, player photos, highlights for CDN serving.

```bash
wrangler r2 bucket create nexora-assets
wrangler r2 bucket create nexora-assets-preview --preview
```

Confirm in `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "ASSETS_R2"
bucket_name = "nexora-assets"
preview_bucket_name = "nexora-assets-preview"
```

### Phase 4: Apply D1 Migrations

Create the `sports_cache` table:

**Development (local SQLite):**
```bash
wrangler d1 migrations apply SPORTS_DB --local
```

**Production (remote D1):**
```bash
wrangler d1 migrations apply SPORTS_DB --remote
```

Verify table exists:
```bash
wrangler d1 execute SPORTS_DB --remote --sql "SELECT name FROM sqlite_master WHERE type='table';"
```

### Phase 5: Set Environment Variables

Update `wrangler.toml` `[vars]` section:

```toml
[vars]
RENDER_SPORTS_ORIGIN = "https://your-nexora-api.onrender.com"
CACHE_MODE = "hybrid"
CACHE_STALE_UNTIL_REVALIDATE = "true"
LOG_ANALYTICS = "true"
MAX_CACHE_SIZE_MB = "100"
```

### Phase 6: Deploy Worker

```bash
wrangler deploy
```

You'll receive a URL like `https://nexora.ACCOUNT_ID.workers.dev`.

If you have a custom domain, configure it in Cloudflare dashboard.

### Phase 7: Verify Deployment

```bash
# Test from command line
curl https://nexora.ACCOUNT_ID.workers.dev/api/sports/live

# Check response headers
curl -i https://nexora.ACCOUNT_ID.workers.dev/api/sports/live
```

Expected headers:
```
x-nexora-cache: miss (first hit)
x-nexora-cache-key: sports:GET:/api/sports/live
cache-control: public, max-age=15, stale-while-revalidate=30
```

### Phase 8: Update App Configuration

Edit `app/.env`:
```bash
EXPO_PUBLIC_API_BASE=https://nexora-api-8xxb.onrender.com
EXPO_PUBLIC_SPORTS_API_BASE=https://nexora.ACCOUNT_ID.workers.dev
```

Or specify with fallback:
```bash
EXPO_PUBLIC_SPORTS_API_BASES=https://nexora.ACCOUNT_ID.workers.dev,https://nexora-api-8xxb.onrender.com
```

## Monitoring & Operations

### View live logs
```bash
wrangler tail
```

### Check D1 cache table
```bash
wrangler d1 execute SPORTS_DB --remote --sql "SELECT COUNT(*) as total FROM sports_cache;"
```

### Clear KV cache
```bash
wrangler kv:key delete --namespace-id=YOUR_KV_ID --all
```

### Clear D1 cache table
```bash
wrangler d1 execute SPORTS_DB --remote --sql "DELETE FROM sports_cache;"
```

### View analytics
- Dashboard → Workers → nexora → Analytics
- Filter by cache state (`kv-hit`, `d1-hit`, `miss`, etc.)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "D1 database not found" | Confirm `database_id` in `wrangler.toml` matches your account |
| "KV namespace not bound" | Run `wrangler kv:namespace create` and update binding IDs |
| "Cache not working" | Check `x-nexora-cache` header; verify R2/KV regions match |
| Worker 502 errors | Check `RENDER_SPORTS_ORIGIN` is reachable; review `wrangler tail` logs |

## Next: Advanced Configuration

- **Cost optimization**: Use D1 only (remove KV) for simpler setup
- **Edge TTL**: Adjust `resolveTtlMs()` for your traffic patterns
- **Custom domain**: Point CNAME to your worker in Cloudflare dashboard
- **Analytics dashboards**: Build custom alerts on Cloudflare Analytics
