# agent-dx — fast edit→observe loop for Vaadin (drop-in)

A small, self-contained toolkit that gives an AI agent the **fastest stable loop** for iterating on
a Vaadin (Spring Boot) app: edit Java/CSS → reload → **verify the rendered result** in a headless
browser. Designed to be copied into any generated Vaadin app.

Methodology + measured numbers behind every choice: **`RESULTS.md`** (in this folder).

## Install (per app)

```bash
cp -r agent-dx <your-app>/          # drop the folder at <app>/agent-dx
cd <your-app>
bash agent-dx/install.sh            # playwright deps, spring-boot-devtools, headless dev mode
```

`install.sh` is idempotent and only:
- runs `npm install` for the observer (reuses globally-cached browsers),
- adds `spring-boot-devtools` to `pom.xml` (before the last `</dependencies>`),
- sets `vaadin.launch-browser=false`,
- reports whether `mvnd` is available (optional speed-up).

## The loop

```bash
PORT=8081 bash agent-dx/dev-start.sh    # start once; keep it running across edits
bash agent-dx/dev-status.sh             # READY | STARTING | DOWN
```

**CSS edit** (put CSS in a Vaadin theme for Vite HMR → ~0.4s, no build step):
```bash
node agent-dx/observe.mjs --selector '#app-title' \
  --check "getComputedStyle(document.querySelector('#app-title')).color" --expect "rgb(42, 111, 42)"
```

**Java edit** (~4.9s: compile → devtools in-place restart → verify):
```bash
MODE=java bash agent-dx/reload.sh       # auto-uses mvnd if present, else ./mvnw
node agent-dx/observe.mjs --selector '#submit' \
  --check "document.querySelector('#submit').textContent.trim()" --expect "Send"
```

`observe.mjs` polls in a **fresh browser context** (a reused tab serves stale CSS via Vaadin's PWA
service worker) and reloads until the rendered value equals `--expect`, so it naturally waits out the
restart. Exit code 0 = matched, 1 = timed out.

Stop when done: `bash agent-dx/dev-stop.sh` (port-scoped — never touches other servers).

## Files
| File | Role |
|------|------|
| `dev-start.sh` / `dev-stop.sh` / `dev-status.sh` / `dev-clean.sh` | server lifecycle |
| `reload.sh` | `MODE=java\|css-static\|css-theme`, auto compile tool |
| `observe.mjs` | the "eyes": poll-until-rendered-value-matches (fresh context) |
| `install.sh` | wire-up into a target app |
| `RESULTS.md` | benchmark methodology + numbers |

## Configuration (env vars)
- `PORT` — dev server port (default **8081**). Used by all scripts + the observer's default URL.
- `OBSERVE_URL` — full URL to observe (overrides `PORT`).
- `COMPILE_TOOL` — `auto` (default) | `mvnw` | `mvnd`. `MVND` — explicit path to an mvnd binary.
- `RUN_CMD` — override the dev-server command (default `./mvnw spring-boot:run --server.port=$PORT`).

## Do / Don't (from the benchmarks)
- ✅ **One persistent dev server** with devtools (in-place reload ~2.5s) — don't restart per change (~+2s).
- ✅ **CSS in a Vaadin theme** (Vite HMR ~0.4s) — not static `@StyleSheet` (~5s and flaky; needs
  `-Dmaven.resources.overwrite=true` or the copy can silently skip for >15s).
- ✅ **Verify in a fresh browser context** — never reuse a long-lived tab (stale CSS).
- ✅ **Readiness:** poll-until-match, or the `Started Application in` log marker. **Never a fixed sleep**
  (unreliable: 0–2/3 correct in tests).
- ❌ Don't `mvnw clean` in the loop. ❌ Don't `kill` java by name — use `dev-stop.sh`.
