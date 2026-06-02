#!/usr/bin/env bash
# Regenerate the portable drop-in (dist/agent-dx/) from the live harness (agent-dx/).
#
# agent-dx/ is the source of truth: it's where the loop actually runs (node_modules,
# bench.mjs, run.log live here). dist/agent-dx/ is the self-contained copy you drop into
# another Vaadin app. The shared scripts are edited HERE; this script copies them into
# dist/ so there is exactly one place to edit. bench.mjs and all runtime state are
# intentionally NOT shipped; install.sh and README.md are authored in dist/ and left alone.
#
#   bash agent-dx/package.sh           # sync dist/agent-dx/  <-  agent-dx/
#   bash agent-dx/package.sh --check   # exit 1 if dist/ is stale (writes nothing; for CI)
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$(cd "$SRC/.." && pwd)/dist/agent-dx"
mkdir -p "$DEST"

# Allowlist of files shared between the live harness and the drop-in. Anything not listed
# (bench.mjs, node_modules/, run.log, dev.pid, results/, this script) is never shipped.
FILES=(
  dev-start.sh dev-stop.sh dev-status.sh dev-clean.sh reload.sh
  observe.mjs package.json package-lock.json RESULTS.md
)

case "${1:-}" in
  --check) check=1 ;;
  "")      check=0 ;;
  *)       echo "usage: package.sh [--check]" >&2; exit 2 ;;
esac

drift=0
for f in "${FILES[@]}"; do
  if [ "$check" = 1 ]; then
    if ! cmp -s "$SRC/$f" "$DEST/$f"; then
      echo "OUT OF SYNC: dist/agent-dx/$f"
      drift=1
    fi
  else
    cp "$SRC/$f" "$DEST/$f"
  fi
done

if [ "$check" = 1 ]; then
  if [ "$drift" = 1 ]; then
    echo "dist/agent-dx/ is stale — run: bash agent-dx/package.sh" >&2
    exit 1
  fi
  echo "dist/agent-dx/ is in sync with agent-dx/."
else
  chmod +x "$DEST"/*.sh
  echo "Synced ${#FILES[@]} files into dist/agent-dx/ (install.sh, README.md untouched)."
fi
