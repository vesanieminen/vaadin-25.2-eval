# Agentic DX — Fast Edit→Observe Loop for Vaadin (Plan & Decisions)

> Goal: empirically find the **fastest *stable*** edit→observe loop for an AI agent
> iterating on Java/CSS in a Vaadin 25.2 app, and capture it as reusable tooling.
> Status: design locked via interview; execution in progress.

_Last updated: 2026-06-02_

---

## 1. Problem framing

The loop we optimize:

```
agent edits .java / .css  →  app reflects the change  →  agent observes it  →  iterate
```

Friction unique to an **agent** (vs. a human in an IDE):
- No IDE auto-compiling on save — the agent must explicitly trigger a compile.
- No human watching the browser — the agent needs an unambiguous *"the change is live now"*
  signal before it asserts/screenshots, or it races the reload.
- Long-running processes (the dev server) must be managed explicitly (start/stop/status/clean).
- Log noise: the agent pays tokens to read `spring-boot:run` output.

## 2. Repo context (sandbox)

- Fresh `start.vaadin.com` starter: **Vaadin 25.2.0-alpha8**, **Spring Boot 4.1.0-RC1**, **Java 25**, Spring Boot jar.
- Default Maven goal: `spring-boot:run`. `vaadin-dev` on classpath. `vaadin.launch-browser=true`.
- Custom CSS: `src/main/resources/META-INF/resources/styles.css`, loaded via `@StyleSheet("styles.css")`.
- **No `target/`** (never built), **no `node_modules`**, **no `src/main/frontend`/theme** → Vaadin runs off
  its prebuilt dev bundle (no local Vite/npm) → cheaper cold start than a customized frontend.
- MCP servers wired in `.mcp.json`: Vaadin docs + Playwright.
- A **separate** harness runs at `~/code/agentic-dx-improvement/results/basic_form/vaadin/...` on **:8080**
  (out of scope for edits — sandbox is this repo only).
- Toolchain: Java 25.0.3 (Homebrew), Maven 3.9.12, `npx`/node present, Playwright CLI 1.60.0.

## 3. Decisions (from interview)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| Deliverable | Scope | **Optimize this repo as a sandbox** | Findings get ported to the harness by hand; don't modify the harness. |
| Observe | Channel | **Scripted headless Playwright** (not MCP) | Deterministic & timeable for a benchmark. |
| Metric | Success | **Wall-clock + agent-cost** | Wall-clock = save→verified-in-browser; agent-cost = tool-calls + log-reading tokens. |
| Java reload | Mechanism | **spring-boot-devtools restart** | Most stable fast path on JDK 25. HotswapAgent ruled out (lags JDK releases). |
| Lifecycle | Process model | **Benchmark both** persistent vs restart-per-change | "Whatever is fastest" — measure it. |
| Compile | Tooling | **`mvnw -o compile` baseline vs `mvnd`** (warm JVM) | Maven per-invocation JVM startup is a real cost; measure the delta. |
| CSS | Path | **Benchmark both** static `@StyleSheet` vs Vaadin **theme** (Vite HMR) | Theme path pulls in node_modules/Vite once; capture that cold cost too. |
| Readiness | Detection | **Benchmark it** — poll-until-match (ground truth) vs log-marker vs tuned-sleep | Compare latency + false-positive rate. |
| Rigor | Trials | **Median of 3 warm** (drop warm-up) | Cheap, stable enough to rank approaches. |
| Port | Sandbox | **8081** | 8080 is the harness; 8081/8082/8090 free. |
| Browser launch | Dev mode | **`vaadin.launch-browser=false`** | Headless agent loop — no auto-launched browser. |

### Why poll-until-match is the *stopwatch*, not just a candidate
To honestly measure "save → verified-in-browser," the measurement instrument must directly
observe the **rendered result**. So poll-until-rendered-value-matches-expected is the ground-truth
timer; **log-marker** and **tuned-sleep** are *agent shortcuts* benchmarked against it (do they
decide faster, and do they ever fire a false positive — asserting before the change truly rendered?).

## 4. Change-type scenarios

A minimal `@Route` form view (stable IDs + known text) is scaffolded to exercise all three:

1. **CSS-only** — change a color in CSS. (No compile; should be fastest path.)
2. **Java method-body** — change a button caption / label text. (Compile + reload.)
3. **Java structural** — add a component/field to the view. (Compile + reload; may touch dev bundle.)

## 5. Benchmark matrix

Per change type, the relevant levers (avoiding combinatorial explosion):

| Change type | Lifecycle | Compile | CSS path | Readiness |
|-------------|-----------|---------|----------|-----------|
| CSS color | persistent | (n/a) | static **vs** theme | poll / log / sleep |
| Java method-body | persistent **vs** restart | mvnw -o **vs** mvnd | (n/a) | poll / log / sleep |
| Java structural | persistent **vs** restart | mvnw -o **vs** mvnd | (n/a) | poll / log / sleep |

Each measured cell = median of 3 warm runs. Capture wall-clock (ms) + agent-cost (tool-calls,
whether log-scraping is required).

## 6. Tooling to build (reusable, port to harness)

Scripts in the sandbox:
- `dev-start.sh` — start dev server in background on :8081, log to file, block until readiness marker.
- `dev-stop.sh` — stop the dev server cleanly.
- `dev-status.sh` — is it up / ready? (for the agent to check before acting).
- `dev-clean.sh` — full clean (only when frontend bundle/generated state is stale — *not* the inner loop).
- `reload-java.sh` — compile via configurable tool (`mvnw -o` | `mvnd`), trigger devtools restart.
- `observe.mjs` — Playwright: navigate :8081, poll-until-rendered-value == expected, screenshot, emit timing JSON.

## 7. Execution status — DONE

- [x] Interview / decisions locked
- [x] Task list created (#1–#5) and completed
- [x] Playwright + Chromium working under `agent-dx/` (browsers were already cached)
- [x] `mvnd` 1.0.6 installed from Apache's official release → `tools/maven-mvnd-1.0.6-darwin-aarch64/`
      (not in Homebrew core; the `brew install mvnd` suggestion was a red herring)
- [x] Scaffolded `MainView` + config (port 8081, devtools, headless)
- [x] Lifecycle + reload + observe scripts (`agent-dx/`)
- [x] Cold start + end-to-end validation
- [x] Benchmark matrix (median of 3) — per-group JSON in `agent-dx/results/`
- [x] Results table → **`agent-dx/RESULTS.md`**; optimal-loop guide → **`CLAUDE.md`**

### Headline numbers
| | Fastest stable | vs. naive |
|---|---|---|
| CSS | **theme + Vite HMR: ~0.4s** | static `@StyleSheet`: ~5s + flaky |
| Java | **persistent devtools + mvnd: ~4.9s** | restart-per-change: ~6.5–7.3s |
| Readiness | log-marker / poll-until-match (3/3) | fixed sleep: 0–2/3 ❌ |

## 8. Findings (hypotheses → confirmed)

- ✅ Static-CSS via `@StyleSheet` (META-INF/resources) is served from `target/classes`; needs a
  `process-resources` copy. Worse: maven's mtime-granularity skips the copy on same-second edits
  (**>15s silent staleness**) unless `-Dmaven.resources.overwrite=true`. The **theme/Vite-HMR** path
  avoids it entirely (~0.4s, no build).
- ✅ `spring-boot-devtools` added; its in-place restart reload (~2.5s, dominated by Vaadin's annotation
  scan) beats a full reboot.
- ✅ A Java *structural* change behaved like a method-body change (no bundle rebuild — the component type
  was already bundled). A brand-new frontend dependency *would* trigger a rebuild.
- ✅ New: a **reused browser tab serves stale CSS** (HTTP cache + Vaadin PWA service worker) → observe in a
  **fresh context**. And **HTTP 200 ≠ ready** during a bundle build → wait for the bundle-built marker.
- ✅ The **build step is cheap** (mvnd compile 0.4s); the **observe step dominates** — optimize detection.
