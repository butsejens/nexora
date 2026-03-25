#!/bin/bash
# Quick setup for Cloudflare Worker deployment
# Run: bash setup-cloudflare.sh

set -e

cd "$(dirname "$0")/cloudflare/sports-worker" || exit 1

echo "🔐 Cloudflare Worker Setup"
echo "=================================================="
echo ""

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "⚠️  CLOUDFLARE_API_TOKEN not set."
  echo "    Get one: https://dash.cloudflare.com/profile/api-tokens"
  echo ""
  echo "    Usage:"
  echo "    export CLOUDFLARE_API_TOKEN='your_token_here'"
  echo "    bash setup-cloudflare.sh"
  exit 1
fi

echo "✓ API token found"
echo ""

echo "1️⃣  Creating D1 database..."
npx wrangler d1 create nexora-sports --preview 2>&1 | grep -E "(database_id|created)" || true
echo ""

echo "2️⃣  Creating KV namespaces..."
npx wrangler kv:namespace create SPORTS_CACHE_KV --preview 2>&1 | grep -E "(id|created)" || true
npx wrangler kv:namespace create SPORTS_CACHE_KV 2>&1 | grep -E "(id|created)" || true
echo ""

echo "3️⃣  Creating R2 buckets (optional)..."
npx wrangler r2 bucket create nexora-assets --preview 2>&1 || echo "   (May already exist)"
npx wrangler r2 bucket create nexora-assets 2>&1 || echo "   (May already exist)"
echo ""

echo "⚠️  Next steps:"
echo "    1. Save the IDs from above"
echo "    2. Update wrangler.toml with your IDs"
echo "    3. Run: npx wrangler d1 migrations apply SPORTS_DB --remote"
echo "    4. Run: npx wrangler deploy"
echo ""
echo "✓ Setup ready!"
