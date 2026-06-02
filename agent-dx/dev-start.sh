#!/usr/bin/env bash
# Start the Vaadin dev server in the background on $PORT and block until it serves HTTP 200.
# Env: PORT (8081), RUN_CMD (./mvnw spring-boot:run), TIMEOUT (300s)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8081}"
LOG="$REPO/agent-dx/run.log"
PIDFILE="$REPO/agent-dx/dev.pid"
RUN_CMD="${RUN_CMD:-./mvnw spring-boot:run}"
TIMEOUT="${TIMEOUT:-300}"

is_up() { [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" 2>/dev/null)" = "200" ]; }
# HTTP 200 is premature while a frontend dev-bundle build is in progress (themes/new
# frontend deps). If a build was triggered, require its completion marker too.
is_ready() {
  is_up || return 1
  if grep -q "Creating a new development mode bundle\|development mode bundle build is needed" "$LOG" 2>/dev/null; then
    grep -q "Development frontend bundle built\|Application running at" "$LOG" 2>/dev/null || return 1
  fi
  return 0
}

if is_ready; then echo "already-ready"; exit 0; fi

cd "$REPO" || exit 1
: > "$LOG"
nohup bash -c "exec $RUN_CMD" > "$LOG" 2>&1 &
echo $! > "$PIDFILE"

SECONDS=0
while ! is_ready; do
  if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null && ! is_up; then
    echo "PROCESS-DIED after ${SECONDS}s"; tail -40 "$LOG"; exit 1
  fi
  if [ "$SECONDS" -gt "$TIMEOUT" ]; then echo "TIMEOUT ${SECONDS}s"; tail -40 "$LOG"; exit 1; fi
  sleep 0.25
done
echo "ready ${SECONDS}s pid=$(cat "$PIDFILE")"
