# Vaadin 25.2 — fast agentic edit→observe loop

A Vaadin Flow + Spring Boot app tuned for a **tight AI-agent dev loop**: edit Java/CSS → reload →
**verify the rendered result** in a headless browser, with no fixed sleeps and no stale-cache surprises.

Stack: Vaadin 25.2, Spring Boot 4.1, Java 25. The dev server runs on **http://localhost:8081/**.

The tooling lives in [`agent-dx/`](agent-dx/); the loop guide for agents is [`CLAUDE.md`](CLAUDE.md);
the methodology and measured numbers behind every choice are in [`agent-dx/RESULTS.md`](agent-dx/RESULTS.md).
A portable, copy-into-any-app version of the harness is under [`dist/agent-dx/`](dist/agent-dx/).

## The fast loop

Keep **one** dev server running (it has `spring-boot-devtools`) — restarting per change is ~1.5–2.4s slower:

```bash
bash agent-dx/dev-start.sh     # background; blocks until truly ready (handles bundle builds)
bash agent-dx/dev-status.sh    # READY | STARTING | DOWN
bash agent-dx/dev-stop.sh      # stops ONLY :8081 (port-scoped; never touches other servers)
```

**CSS edit (≈0.4s)** — put custom CSS in the Vaadin theme so Vite HMR applies it with no build step:

```bash
# edit src/main/frontend/themes/agent/styles.css, then just observe:
node agent-dx/observe.mjs --selector '#app-title' \
  --check "getComputedStyle(document.querySelector('#app-title')).color" --expect "rgb(42, 111, 42)"
```

**Java edit (≈4.9s)** — compile, let devtools restart in place, then confirm:

```bash
MODE=java COMPILE_TOOL=mvnd bash agent-dx/reload.sh   # ~0.4s compile (mvnd warm JVM)
node agent-dx/observe.mjs --selector '#submit' \
  --check "document.querySelector('#submit').textContent.trim()" --expect "Send"
```

`observe.mjs` polls a **fresh** browser context, reloading until the rendered value matches — the
ground-truth "it's live" signal (a reused tab serves stale CSS via the HTTP cache + PWA service worker).

### Why these defaults

| Change | Fast path | Slow path |
|--------|-----------|-----------|
| **CSS** | Theme + Vite HMR — **~0.4s**, no build, consistent | Static `@StyleSheet` — ~5s and flaky |
| **Java** | Persistent devtools + `mvnd` — **~4.9s** | Restart-per-change — ~6.5–7.3s |

HTTP 200 ≠ ready during a frontend bundle build — wait for the log marker, never a fixed sleep.

## Standard build & run

Run from your IDE via the `Application` class, or from the command line:

```bash
./mvnw                       # development mode
./mvnw package               # production build
```

Build a Docker image:

```bash
docker build -t my-application:latest .
# with commercial components, pass the license key as a build secret:
docker build --secret id=proKey,src=$HOME/.vaadin/proKey .
```

## Getting started with Vaadin

The [Quick Start](https://vaadin.com/docs/v25/getting-started/quick-start) tutorial walks you through
building a simple application and introduces the core concepts in about 10 minutes.
