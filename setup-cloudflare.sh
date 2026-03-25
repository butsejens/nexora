#!/usr/bin/env bash
# Fully automated Cloudflare Worker setup and deploy.
# Usage:
#   export CLOUDFLARE_API_TOKEN='...'
#   bash setup-cloudflare.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$ROOT_DIR/cloudflare/sports-worker"
WRANGLER_TOML="$WORKER_DIR/wrangler.toml"

if [[ ! -f "$WRANGLER_TOML" ]]; then
  echo "ERROR: Could not find $WRANGLER_TOML"
  exit 1
fi

cd "$WORKER_DIR"

echo "Cloudflare Worker setup"
echo "=================================================="

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set."
  echo "Create token (minimum): Workers Scripts:Edit, D1:Edit, KV:Edit, R2:Edit, Account:Read"
  echo "Then run:"
  echo "  export CLOUDFLARE_API_TOKEN='your_token_here'"
  echo "  bash setup-cloudflare.sh"
  exit 1
fi

echo "OK: API token found"

if ! npx wrangler whoami >/tmp/nexora-wrangler-whoami.txt 2>&1; then
  cat /tmp/nexora-wrangler-whoami.txt
  echo "ERROR: Wrangler auth failed. Verify CLOUDFLARE_API_TOKEN permissions."
  exit 1
fi

ensure_account_id() {
  local current_id
  current_id=$(awk -F '"' '/^account_id\s*=\s*"/ {print $2; exit}' "$WRANGLER_TOML" || true)
  if [[ -n "$current_id" && ${#current_id} -eq 32 ]]; then
    echo "OK: account_id already looks valid"
    return 0
  fi

  echo "INFO: account_id missing or invalid, trying to detect from wrangler"
  local detected
  detected=$(npx wrangler whoami 2>/dev/null | sed -n 's/.*Account ID:[[:space:]]*\([a-f0-9]\{32\}\).*/\1/p' | head -n1)
  if [[ -z "$detected" ]]; then
    echo "WARNING: Could not auto-detect account_id. Keep current value in wrangler.toml."
    return 0
  fi

  if grep -q '^account_id\s*=\s*"' "$WRANGLER_TOML"; then
    perl -0777 -i -pe 's/^account_id\s*=\s*"[^"]*"/account_id = "'"$detected"'"/m' "$WRANGLER_TOML"
  else
    perl -0777 -i -pe 's/workers_dev\s*=\s*true/workers_dev = true\naccount_id = "'"$detected"'"/m' "$WRANGLER_TOML"
  fi
  echo "OK: Updated account_id in wrangler.toml"
}

extract_first_id() {
  sed -n 's/.*"\([a-f0-9]\{32\}\)".*/\1/p' | head -n1
}

echo "1) Ensuring account_id"
ensure_account_id

echo "2) Creating/finding D1 database"
d1_output=$(npx wrangler d1 create nexora-sports --preview 2>&1 || true)
echo "$d1_output" | tail -n 30
d1_id=$(printf '%s\n' "$d1_output" | sed -n 's/.*database_id[[:space:]]*=\s*\([a-f0-9-]\+\).*/\1/p' | head -n1)
if [[ -z "$d1_id" ]]; then
  d1_id=$(npx wrangler d1 list 2>/dev/null | sed -n 's/.*nexora-sports.*\([a-f0-9]\{8\}-[a-f0-9-]\{27\}\).*/\1/p' | head -n1)
fi
if [[ -z "$d1_id" ]]; then
  echo "ERROR: Could not resolve D1 database_id for nexora-sports"
  exit 1
fi
echo "OK: D1 id = $d1_id"

echo "3) Creating/finding KV namespaces"
kv_preview_output=$(npx wrangler kv:namespace create SPORTS_CACHE_KV --preview 2>&1 || true)
kv_prod_output=$(npx wrangler kv:namespace create SPORTS_CACHE_KV 2>&1 || true)
echo "$kv_preview_output" | tail -n 20
echo "$kv_prod_output" | tail -n 20

kv_preview_id=$(printf '%s\n' "$kv_preview_output" | extract_first_id)
kv_prod_id=$(printf '%s\n' "$kv_prod_output" | extract_first_id)

if [[ -z "$kv_preview_id" || -z "$kv_prod_id" ]]; then
  kv_list=$(npx wrangler kv:namespace list 2>/dev/null || true)
  if [[ -z "$kv_preview_id" ]]; then
    kv_preview_id=$(printf '%s\n' "$kv_list" | sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"SPORTS_CACHE_KV_preview".*"id"[[:space:]]*:[[:space:]]*"\([a-f0-9]\{32\}\)".*/\1/p' | head -n1)
  fi
  if [[ -z "$kv_prod_id" ]]; then
    kv_prod_id=$(printf '%s\n' "$kv_list" | sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"SPORTS_CACHE_KV".*"id"[[:space:]]*:[[:space:]]*"\([a-f0-9]\{32\}\)".*/\1/p' | head -n1)
  fi
fi

if [[ -z "$kv_preview_id" || -z "$kv_prod_id" ]]; then
  echo "ERROR: Could not resolve KV namespace IDs"
  exit 1
fi
echo "OK: KV preview id = $kv_preview_id"
echo "OK: KV prod id    = $kv_prod_id"

echo "4) Creating R2 buckets"
npx wrangler r2 bucket create nexora-assets --preview >/tmp/nexora-r2-preview.log 2>&1 || true
npx wrangler r2 bucket create nexora-assets >/tmp/nexora-r2-prod.log 2>&1 || true
tail -n 6 /tmp/nexora-r2-preview.log || true
tail -n 6 /tmp/nexora-r2-prod.log || true

echo "5) Writing IDs into wrangler.toml"
if grep -q '^\[\[d1_databases\]\]' "$WRANGLER_TOML"; then
  perl -0777 -i -pe 's/database_id\s*=\s*"[^"]*"/database_id = "'"$d1_id"'"/g' "$WRANGLER_TOML"
else
  cat >> "$WRANGLER_TOML" <<EOF

[[d1_databases]]
binding = "SPORTS_DB"
database_name = "nexora-sports"
database_id = "$d1_id"
EOF
fi

if grep -q '^\[\[kv_namespaces\]\]' "$WRANGLER_TOML"; then
  perl -0777 -i -pe 's/id\s*=\s*"[^"]*"\npreview_id\s*=\s*"[^"]*"/id = "'"$kv_prod_id"'"\npreview_id = "'"$kv_preview_id"'"/g' "$WRANGLER_TOML"
else
  cat >> "$WRANGLER_TOML" <<EOF

[[kv_namespaces]]
binding = "SPORTS_CACHE_KV"
id = "$kv_prod_id"
preview_id = "$kv_preview_id"
EOF
fi

if ! grep -q '^\[\[r2_buckets\]\]' "$WRANGLER_TOML"; then
  cat >> "$WRANGLER_TOML" <<'EOF'

[[r2_buckets]]
binding = "ASSETS_R2"
bucket_name = "nexora-assets"
preview_bucket_name = "nexora-assets-preview"
EOF
fi

echo "6) Applying remote migrations"
npx wrangler d1 migrations apply SPORTS_DB --remote

echo "7) Deploying worker"
npx wrangler deploy

echo ""
echo "SUCCESS: Cloudflare setup + deploy completed."
