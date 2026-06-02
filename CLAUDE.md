# Working on this Vaadin app — the fast edit→observe loop

This project is tuned for a fast agent loop. Benchmarks and rationale: `agent-dx/RESULTS.md`.
Helper scripts: `agent-dx/`. **Server runs on http://localhost:8081/** (8080 is reserved).

## Golden rules
- **Keep ONE dev server running** (it has `spring-boot-devtools`). Don't restart it per change —
  restarting is ~1.5–2.4s slower per Java edit and pays a full boot.
- **Put custom CSS in the Vaadin theme** (`src/main/frontend/themes/agent/styles.css`) — Vite HMR
  applies it in **~0.4s with no build step**. The static `@StyleSheet` path is ~5s *and* flaky.
- **Verify in a FRESH browser context**, never a reused tab — a reused tab serves stale CSS (HTTP cache
  + Vaadin's PWA service worker). The `agent-dx/observe.mjs` helper already does this.
- **Never trust a fixed `sleep`** to decide a change is live. Use poll-until-match or the log marker.

## Start / status / stop
```bash
bash agent-dx/dev-start.sh     # background; blocks until truly ready (handles bundle builds)
bash agent-dx/dev-status.sh    # READY | STARTING | DOWN
bash agent-dx/dev-stop.sh      # stops ONLY :8081 (safe; never touches other servers)
```
First start: ~11s (no theme) / ~18–20s (first time with the theme — one-time `npm install` + bundle build).

## After a CSS edit  (≈0.4s)
Edit `src/main/frontend/themes/agent/styles.css`, then just observe — no build step:
```bash
node agent-dx/observe.mjs --selector '#app-title' \
  --check "getComputedStyle(document.querySelector('#app-title')).color" --expect "rgb(42, 111, 42)"
```

## After a Java edit  (≈4.9s)
Compile; spring-boot-devtools restarts in place; then confirm:
```bash
MODE=java COMPILE_TOOL=mvnd bash agent-dx/reload.sh      # ~0.4s compile (mvnd warm JVM)
# wait for the restart, then verify the rendered result in a fresh context:
node agent-dx/observe.mjs --selector '#submit' \
  --check "document.querySelector('#submit').textContent.trim()" --expect "Send"
```
`observe.mjs` polls (reload-until-match) so it naturally waits out the ~2.5s devtools restart.
Cheaper alternative when iterating fast: tail `agent-dx/run.log` for a new `Started Application in`
line, then do a single `observe.mjs` check.

## Don't
- Don't run `mvnw clean` in the loop (full cold rebuild). Only when frontend deps/bundle are genuinely stale.
- Don't add custom CSS via `@StyleSheet` from `META-INF/resources` for things you iterate on — it needs a
  `process-resources` copy (use `-Dmaven.resources.overwrite=true` or it can silently skip) and lags ~5s.
- Don't `kill` java by name — use `dev-stop.sh` (port-scoped).

## Toolchain notes
- `mvnd` (Maven Daemon) lives at `tools/maven-mvnd-1.0.6-darwin-aarch64/bin/mvnd` — warm JVM, ~0.4s compiles.
- Playwright + Chromium are set up under `agent-dx/` (`node_modules`).

## Maintaining the tooling
`agent-dx/` is the source of truth; `dist/agent-dx/` is the portable drop-in **generated** from it.
After editing a shared script (`dev-*.sh`, `reload.sh`, `observe.mjs`, `package*.json`, `RESULTS.md`),
run `bash agent-dx/package.sh` to resync `dist/`. `bash agent-dx/package.sh --check` fails if it's stale.
`bench.mjs` + runtime state stay local; `install.sh`/`README.md` are authored in `dist/`.
