#!/usr/bin/env bash
# READY (serves 200) | STARTING (port bound, not 200 yet) | DOWN
PORT="${PORT:-8081}"
code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" 2>/dev/null)"
if [ "$code" = "200" ]; then
  echo "READY"
elif lsof -nP -iTCP:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "STARTING"
else
  echo "DOWN"
fi
