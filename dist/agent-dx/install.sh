#!/usr/bin/env bash
# agent-dx drop-in installer for a Vaadin (Spring Boot) app.
# Place this folder at <app>/agent-dx/ and run:   bash agent-dx/install.sh
# Idempotent: safe to re-run.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
echo "agent-dx installer — app root: $APP"

# 1) Observer deps (Playwright). Browsers are reused from the global cache if present.
echo "==> npm install (playwright) in $HERE"
( cd "$HERE" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-fund --no-audit ) || { echo "npm install failed"; exit 1; }
echo "==> ensuring a Chromium build is available"
( cd "$HERE" && npx playwright install chromium ) >/dev/null 2>&1 || echo "   (chromium likely already cached)"

# 2) spring-boot-devtools for in-place Java reload (~2.5s vs a full reboot)
POM="$APP/pom.xml"
if [ -f "$POM" ]; then
  if grep -q "spring-boot-devtools" "$POM"; then
    echo "==> spring-boot-devtools already in pom.xml"
  else
    echo "==> adding spring-boot-devtools before the LAST </dependencies> in pom.xml"
    perl -0pi -e 's{(.*)\n(\s*)</dependencies>}{$1\n$2    <dependency>\n$2        <groupId>org.springframework.boot</groupId>\n$2        <artifactId>spring-boot-devtools</artifactId>\n$2        <optional>true</optional>\n$2    </dependency>\n$2</dependencies>}s' "$POM" \
      && grep -q "spring-boot-devtools" "$POM" && echo "   added." \
      || echo "   AUTO-EDIT FAILED — add spring-boot-devtools to your <dependencies> manually."
  fi
else
  echo "==> no pom.xml at app root; add spring-boot-devtools yourself."
fi

# 3) Headless dev mode (don't auto-launch a browser)
PROPS="$APP/src/main/resources/application.properties"
if [ -f "$PROPS" ]; then
  if grep -q "vaadin.launch-browser" "$PROPS"; then
    perl -0pi -e 's/vaadin\.launch-browser\s*=.*/vaadin.launch-browser=false/' "$PROPS"
  else
    printf '\n# headless agent loop\nvaadin.launch-browser=false\n' >> "$PROPS"
  fi
  echo "==> set vaadin.launch-browser=false"
fi

# 4) mvnd (optional; ~0.4s compiles). reload.sh auto-falls back to ./mvnw.
if command -v mvnd >/dev/null 2>&1 || ls "$APP"/tools/maven-mvnd-*/bin/mvnd >/dev/null 2>&1; then
  echo "==> mvnd available (fast compiles)"
else
  echo "==> mvnd NOT found (optional). Install from https://github.com/apache/maven-mvnd/releases"
  echo "    or 'sdk install mvnd'. Without it, reload.sh transparently uses ./mvnw."
fi

# 5) (Optional) Vaadin theme for instant CSS HMR — only scaffold if absent.
THEME_DIR="$APP/src/main/frontend/themes"
if [ ! -d "$THEME_DIR" ]; then
  echo "==> TIP: for ~0.4s CSS turnaround, put custom CSS in a Vaadin theme"
  echo "    (src/main/frontend/themes/<name>/styles.css + @Theme(\"<name>\")) instead of @StyleSheet."
fi

echo ""
echo "Installed. Start the loop:"
echo "    PORT=8081 bash agent-dx/dev-start.sh"
echo "Then edit + observe — see agent-dx/README.md."
