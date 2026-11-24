#!/usr/bin/env bash
# Back up the live KudiTrail database (citizen updates and contact messages)
# to backups/kuditrail-YYYY-MM-DD-HHMM.sql. Run now and then:  npm run backup
#
# Backups contain private data (contact details, emails), so backups/ is
# git-ignored. Never commit them; the GitHub repo is public.
# Photos live in R2 and are not included.
set -euo pipefail
cd "$(dirname "$0")/.."

# Wrangler needs Node 22.12+; prefer Homebrew's Node if it is installed.
[ -d /opt/homebrew/opt/node/bin ] && export PATH="/opt/homebrew/opt/node/bin:$PATH"

if ! npx wrangler whoami 2>/dev/null | grep -q "You are logged in"; then
  echo "Not logged in to Cloudflare. A browser window will open to log in."
  npx wrangler login
fi

mkdir -p backups
out="backups/kuditrail-$(date +%Y-%m-%d-%H%M).sql"
npx wrangler d1 export kuditrail --remote --output "$out"
chmod 600 "$out"
echo "Saved $out ($(wc -c < "$out" | tr -d ' ') bytes)"
