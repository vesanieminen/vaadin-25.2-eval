#!/usr/bin/env bash
# Apply the minimal build step so a saved source change reaches the running app.
#   MODE=java         -> compile classes; spring-boot-devtools then restarts in place
#   MODE=css-static   -> copy resources; devtools triggers a browser live-reload
#   MODE=css-theme    -> no-op; Vite HMR picks up theme CSS on save
# COMPILE_TOOL=mvnw|mvnd
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
MODE="${MODE:-java}"
TOOL="${COMPILE_TOOL:-auto}"
# Resolve mvnd: explicit $MVND env > vendored tools/ copy > mvnd on PATH > (fall back to ./mvnw)
if [ -z "${MVND:-}" ]; then
  if [ -x "$REPO"/tools/maven-mvnd-*/bin/mvnd ]; then MVND="$(echo "$REPO"/tools/maven-mvnd-*/bin/mvnd)";
  elif command -v mvnd >/dev/null 2>&1; then MVND="$(command -v mvnd)";
  else MVND=""; fi
fi
# TOOL=auto -> use mvnd if available, else mvnw
[ "$TOOL" = "auto" ] && { [ -n "$MVND" ] && TOOL="mvnd" || TOOL="mvnw"; }
run() { if [ "$TOOL" = "mvnd" ] && [ -n "$MVND" ]; then "$MVND" "$@"; else ./mvnw "$@"; fi; }

case "$MODE" in
  java)       run -o -q compile ;;
  css-static) run -o -q process-resources -Dmaven.resources.overwrite=true ;;
  css-theme)  : ;;  # Vite HMR, nothing to do
  *) echo "unknown MODE=$MODE"; exit 2 ;;
esac
