# Agentic edit→observe loop — benchmark results (Vaadin 25.2)

Sandbox: this repo (`v25.2`), port **8081**. Stack: Vaadin 25.2.0-alpha8, Spring Boot 4.1.0-RC1,
Java 25.0.3, macOS arm64. Observer: scripted headless Playwright 1.60 (Chromium).

**Method.** Each cell = 1 discarded warm-up + **median of 3** measured cycles. Every cycle applies a
**real source edit** (toggled), then runs the minimal reload step, then the observer polls a **fresh
browser context** by reloading until the rendered value equals the expected value (the ground-truth
"it's live" signal). Wall-clock = from file-save to verified-rendered. `mvnd` = Maven Daemon (warm JVM).

---

## 1. Cold start (one-time)

| Setup | Time to ready | Notes |
|-------|--------------:|-------|
| No theme (prebuilt dev bundle) | **~11s** | no `node_modules`, no Vite — Vaadin uses its prebuilt bundle |
| With a custom `@Theme` (first run) | **~18–20s** | boot 3.7s + `npm install` ~10s + dev-bundle build ~5s; Vaadin auto-downloads Node 24 to `~/.vaadin` |

> ⚠️ **HTTP 200 ≠ ready** while a frontend bundle build is in progress. The bootstrap page returns 200
> seconds before the bundle is built. Wait for `Development frontend bundle built` / `Application running at …`.
> (`dev-start.sh` now does this.)

## 2. CSS change → verified

| Path | Build step | Wall-clock | Polls | Reliability |
|------|-----------|-----------:|------:|-------------|
| Static `@StyleSheet` (META-INF/resources), mvnw | `process-resources` | ~5.0s | 11 | ⚠️ inconsistent (0.5–4s); see below |
| Static `@StyleSheet`, mvnd | `process-resources` | ~5.1s | 13 | ⚠️ same |
| **Theme + Vite HMR** (`src/main/frontend/themes/…`) | **none** | **0.44s** | **1** | ✅ consistent, 0 failures |

**Static CSS is the trap.** Custom CSS loaded via `@StyleSheet` from `META-INF/resources` is served from
`target/classes`, so a src edit needs a resource copy, and then:
- **Silent staleness:** maven's incremental copy compares mtimes at **1-second granularity** and *skips the
  copy* on same-second edits → the change can fail to appear for **>15s**. Fix: `-Dmaven.resources.overwrite=true`.
- **Render propagation lag:** even after the server serves the new file (curl confirms in ~0.5s), the
  *rendered* app reflects it inconsistently (0.5–4s).

**Theme + Vite HMR** avoids all of it: Vite watches the theme file and applies the change with no build
step, no copy, no staleness — **~11× faster and consistent.**

## 3. Java change → verified

### Method-body change (e.g. button caption)
| Lifecycle | Compile | Wall-clock | Breakdown |
|-----------|---------|-----------:|-----------|
| **Persistent (devtools)** | mvnw | **4.9s** | compile 1.26s · restart+detect 3.6s |
| **Persistent (devtools)** | **mvnd** | **4.9s** | compile **0.39s** · restart+detect 4.5s |
| Restart-per-change | mvnw | 7.3s | compile 1.23s · stop+start 5.5s · detect 0.5s |
| Restart-per-change | mvnd | 6.5s | compile 0.39s · stop+start 5.5s · detect 0.5s |

### Structural change (add/remove a component) — same shape
| Lifecycle | Compile | Wall-clock |
|-----------|---------|-----------:|
| Persistent (devtools) | mvnw | 4.8s |
| Persistent (devtools) | mvnd | 4.8s |
| Restart-per-change | mvnd | 6.4s |

**Takeaways.**
- **Persistent + spring-boot-devtools wins** (~4.9s vs ~6.5–7.3s). The in-place restart-classloader reload
  beats a full JVM reboot by ~1.5–2.4s.
- The devtools restart floor (~2.5s) is dominated by **Vaadin's annotation/route scan** (~2.26s). Keeping
  `vaadin.allowed-packages` narrow (already set here) limits it.
- **mvnd** cuts compile from ~1.25s → ~0.4s (saves ~0.85s). In persistent mode the restart dominates so wall
  barely moves; in restart-per-change mode mvnd's saving shows up directly.
- Structural changes behaved like method-body changes (no dev-bundle rebuild, because the added component
  type was already bundled). Adding a *brand-new* frontend dependency would trigger a bundle rebuild (slow).

## 4. Readiness detector (Java restart; persistent, mvnd)

| Detector | Median time-to-decide | Correct | Verdict |
|----------|----------------------:|:-------:|---------|
| **poll-until-match** (browser) | 5.1s | **3/3** | ✅ safest; no logs; works for CSS too |
| **log-marker** (`Started Application in`) | 4.4s | **3/3** | ✅ faster + far cheaper (1 browser check vs many polls); needs log access |
| fixed sleep 2.0s | 2.4s | 0/3 | ❌ too short |
| fixed sleep 2.5s | 3.2s | 0/3 | ❌ too short |
| fixed sleep 3.0s | 3.8s | 2/3 | ❌ flaky |

**Never use a fixed sleep.** Best for Java: **wait for the log marker, then one fresh-context render check**
(fast + reliable + minimal browser ops). For CSS or when logs aren't handy, **poll-until-match** is the robust default.

## 5. Two observer gotchas (cost the most debugging)

1. **Observe in a FRESH browser context, not a reused tab.** A long-lived tab serves *stale* CSS because of
   (a) HTTP `no-cache` revalidation returning 304 and (b) **Vaadin's PWA service worker caching static
   assets**. `Network.setCacheDisabled` does *not* bypass the service worker; *blocking* the SW broke the
   client entirely. A fresh context (empty cache + SW registry, ~ms to create) always sees the truth.
2. **The build step is cheap; the observe step dominates.** mvnd compile = 0.4s, resource copy = 0.2s. The
   variable cost is reload + render detection — optimize *that* (log-marker + single check), not the compiler.

---

## Bottom line — the fastest stable loop

| Concern | Do this | Result |
|---------|---------|--------|
| Server | One **persistent** `spring-boot:run` with **spring-boot-devtools** | reuse JVM; ~2.5s in-place reloads |
| CSS | Put it in a **Vaadin theme** (Vite HMR), not static `@StyleSheet` | **~0.4s**, no build, reliable |
| Java | Edit → **`mvnd -o -q compile`** → devtools restarts | **~4.9s** |
| Knowing it's live | **log-marker + 1 render check** (Java); **poll-until-match** (CSS / fallback) | reliable, cheap |
| Observe | **Fresh browser context** each check | no stale CSS |
| Avoid | restart-per-change, fixed sleeps, static-CSS `process-resources` without `overwrite=true` | — |
