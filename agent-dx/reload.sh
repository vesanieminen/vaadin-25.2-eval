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
TOOL="${COMPILE_TOOL:-mvnw}"
MVND="$REPO/tools/maven-mvnd-1.0.6-darwin-aarch64/bin/mvnd"
run() { if [ "$TOOL" = "mvnd" ]; then "$MVND" "$@"; else ./mvnw "$@"; fi; }

case "$MODE" in
  java)       run -o -q compile ;;
  css-static) run -o -q process-resources -Dmaven.resources.overwrite=true ;;
  css-theme)  : ;;  # Vite HMR, nothing to do
  *) echo "unknown MODE=$MODE"; exit 2 ;;
esac
