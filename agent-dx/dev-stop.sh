#!/usr/bin/env bash
# Stop the dev server. Targets ONLY $PORT's listener + the recorded launcher tree
# (never pkills by name, so it can't touch the harness on :8080).
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8081}"
PIDFILE="$REPO/agent-dx/dev.pid"

lpid="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)"
[ -n "$lpid" ] && kill $lpid 2>/dev/null

if [ -f "$PIDFILE" ]; then
  ppid="$(cat "$PIDFILE")"
  pkill -P "$ppid" 2>/dev/null
  kill "$ppid" 2>/dev/null
  rm -f "$PIDFILE"
fi

SECONDS=0
while lsof -nP -iTCP:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
  if [ "$SECONDS" -gt 30 ]; then
    lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | xargs kill -9 2>/dev/null
    break
  fi
  sleep 0.25
done
echo "stopped"
