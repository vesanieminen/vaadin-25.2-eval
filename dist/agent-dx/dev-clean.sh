#!/usr/bin/env bash
# Full clean. DEEP=1 also removes the frontend dev bundle / generated artifacts
# (forces a cold frontend rebuild on next start -- the slow path, rarely needed).
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
./mvnw -q clean
if [ "${DEEP:-0}" = "1" ]; then
  rm -rf node_modules src/main/frontend/generated vite.generated.ts \
         src/main/bundles target/dev-bundle 2>/dev/null
  echo "deep-cleaned"
else
  echo "cleaned"
fi
