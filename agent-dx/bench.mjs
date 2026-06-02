// Benchmark harness for the Vaadin agentic edit->observe loop.
// Reuses one browser. Toggles REAL source edits so every measured cycle is a real change.
// Per cell: 1 warm-up (discarded) + 3 measured -> median wall-clock with breakdown.
//
// Usage: node bench.mjs <group>   group = css-static | css-theme | java-body | java-struct | readiness
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { launchBrowser, observe } from './observe.mjs';

const REPO = '/Users/vesanieminen/code/v25.2';
const MAINVIEW = `${REPO}/src/main/java/com/example/MainView.java`;
const STYLES = `${REPO}/src/main/resources/META-INF/resources/styles.css`;
const THEME_STYLES = `${REPO}/src/main/frontend/themes/agent/styles.css`;
const LOG = `${REPO}/agent-dx/run.log`;
const MVND = `${REPO}/tools/maven-mvnd-1.0.6-darwin-aarch64/bin/mvnd`;
const URL = 'http://localhost:8081/';
const RESULTS = `${REPO}/agent-dx/results`;
mkdirSync(RESULTS, { recursive: true });

const GREEN = { hex: '#2a6f2a', rgb: 'rgb(42, 111, 42)' };
const RED = { hex: '#c0392b', rgb: 'rgb(192, 57, 43)' };

const rd = (p) => readFileSync(p, 'utf8');
const wr = (p, s) => writeFileSync(p, s);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const toolCmd = (tool) => (tool === 'mvnd' ? MVND : './mvnw');
function sh(cmd) {
  const t = performance.now();
  try { execSync(cmd, { cwd: REPO, stdio: 'ignore' }); }
  catch { /* devtools restart noise / nonzero is fine */ }
  return +(performance.now() - t).toFixed(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function logLines() { try { return rd(LOG).split('\n').length; } catch { return 0; } }

// ---------- source edit toggles ----------
function flipJavaBody() {
  let s = rd(MAINVIEW), to;
  if (s.includes('new Button("Submit")')) { s = s.replace('new Button("Submit")', 'new Button("Send")'); to = 'Send'; }
  else { s = s.replace('new Button("Send")', 'new Button("Submit")'); to = 'Submit'; }
  wr(MAINVIEW, s);
  return { selector: '#submit', check: `document.querySelector('#submit').textContent.trim()`, expect: to };
}
const STRUCT_A = `        add(title, name, submit);`;
const STRUCT_B = `        TextField email = new TextField("Email");\n        email.setId("email");\n\n        add(title, name, submit, email);`;
function flipJavaStruct() {
  let s = rd(MAINVIEW), expect;
  if (s.includes('email.setId("email")')) { s = s.replace(STRUCT_B, STRUCT_A); expect = 'false'; }
  else { s = s.replace(STRUCT_A, STRUCT_B); expect = 'true'; }
  wr(MAINVIEW, s);
  return { selector: '#submit', check: `!!document.querySelector('#email')`, expect };
}
function flipCss(file) {
  return () => {
    let s = rd(file), exp;
    if (s.includes(GREEN.hex)) { s = s.replace(GREEN.hex, RED.hex); exp = RED.rgb; }
    else { s = s.replace(RED.hex, GREEN.hex); exp = GREEN.rgb; }
    wr(file, s);
    return { selector: '#app-title', check: `getComputedStyle(document.querySelector('#app-title')).color`, expect: exp };
  };
}

// ---------- one edit->observe cycle ----------
async function cycle(browser, { flip, reloadMode, tool, lifecycle }) {
  const ed = flip();
  const t0 = performance.now();
  let compile_ms = 0, restart_ms = 0;
  if (reloadMode === 'java') compile_ms = sh(`${toolCmd(tool)} -o -q compile`);
  else if (reloadMode === 'css-static') compile_ms = sh(`${toolCmd(tool)} -o -q process-resources -Dmaven.resources.overwrite=true`);
  // css-theme: no build step (Vite HMR)
  if (lifecycle === 'restart') {
    const s = performance.now();
    sh(`bash agent-dx/dev-stop.sh`);
    sh(`bash agent-dx/dev-start.sh`);
    restart_ms = +(performance.now() - s).toFixed(1);
  }
  const obs = await observe(browser, { url: URL, selector: ed.selector, check: ed.check, expect: ed.expect, timeoutMs: 60000, intervalMs: 120 });
  const wall = +(performance.now() - t0).toFixed(1);
  return { wall, compile_ms, restart_ms, observe_ms: obs.ms, polls: obs.polls, ok: obs.ok };
}

async function runCell(browser, name, cfg, { warmup = 1, n = 3 } = {}) {
  for (let i = 0; i < warmup; i++) await cycle(browser, cfg);
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(await cycle(browser, cfg));
  const bad = runs.filter((r) => !r.ok).length;
  const res = {
    name,
    wall_ms: median(runs.map((r) => r.wall)),
    compile_ms: median(runs.map((r) => r.compile_ms)),
    restart_ms: median(runs.map((r) => r.restart_ms)),
    observe_ms: median(runs.map((r) => r.observe_ms)),
    polls: median(runs.map((r) => r.polls)),
    failures: bad,
    runs: runs.map((r) => r.wall),
  };
  console.log(JSON.stringify(res));
  return res;
}

// one-shot rendered-value read in a fresh context (no stale cache/SW carryover)
async function checkOnce(browser, selector, check) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let val = null;
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 4000 });
    await page.waitForSelector(selector, { timeout: 3000 });
    val = await page.evaluate(check);
  } catch { /* not ready */ }
  await ctx.close();
  return val;
}

// ---------- readiness detector comparison (java-body, persistent, mvnd) ----------
async function readinessExperiment(browser) {
  const out = [];
  const compileCmd = `${MVND} -o -q compile`;
  // POLL (ground truth)
  for (let i = 0; i < 3; i++) {
    const ed = flipJavaBody();
    const t0 = performance.now();
    sh(compileCmd);
    const obs = await observe(browser, { url: URL, selector: ed.selector, check: ed.check, expect: ed.expect, timeoutMs: 60000, intervalMs: 120 });
    out.push({ detector: 'poll', ms: +(performance.now() - t0).toFixed(1), correct: obs.ok });
  }
  // LOG-MARKER: wait for a NEW "Started Application in" line after compile, then check correctness
  for (let i = 0; i < 3; i++) {
    const ed = flipJavaBody();
    const before = logLines();
    const t0 = performance.now();
    sh(compileCmd);
    let marker = false;
    while (performance.now() - t0 < 60000) {
      const tail = rd(LOG).split('\n').slice(before);
      if (tail.some((l) => l.includes('Started Application in'))) { marker = true; break; }
      await sleep(60);
    }
    const ms = +(performance.now() - t0).toFixed(1);
    const val = await checkOnce(browser, ed.selector, ed.check);
    out.push({ detector: 'log-marker', ms, correct: String(val) === String(ed.expect), markerSeen: marker });
  }
  // FIXED SLEEP variants
  for (const S of [2000, 2500, 3000]) {
    for (let i = 0; i < 3; i++) {
      const ed = flipJavaBody();
      const t0 = performance.now();
      sh(compileCmd);
      await sleep(S);
      const val = await checkOnce(browser, ed.selector, ed.check);
      out.push({ detector: `sleep-${S}`, ms: +(performance.now() - t0).toFixed(1), correct: String(val) === String(ed.expect) });
    }
  }
  // aggregate
  const agg = {};
  for (const r of out) {
    (agg[r.detector] ||= { ms: [], correct: 0, total: 0 });
    agg[r.detector].ms.push(r.ms); agg[r.detector].total++; if (r.correct) agg[r.detector].correct++;
  }
  const summary = Object.entries(agg).map(([d, v]) => ({ detector: d, median_ms: median(v.ms), correct: `${v.correct}/${v.total}` }));
  console.log('READINESS', JSON.stringify(summary));
  return summary;
}

// ---------- groups ----------
const group = process.argv[2] || 'java-body';
const browser = await launchBrowser();
const results = [];
try {
  if (group === 'css-static') {
    // normalize served state
    if (!rd(STYLES).includes(GREEN.hex)) wr(STYLES, rd(STYLES).replace(RED.hex, GREEN.hex));
    sh('./mvnw -o -q process-resources');
    const flip = flipCss(STYLES);
    results.push(await runCell(browser,'css-static | persistent | mvnw', { flip, reloadMode: 'css-static', tool: 'mvnw', lifecycle: 'persistent' }));
    results.push(await runCell(browser,'css-static | persistent | mvnd', { flip, reloadMode: 'css-static', tool: 'mvnd', lifecycle: 'persistent' }));
  } else if (group === 'css-theme') {
    const flip = flipCss(THEME_STYLES);
    results.push(await runCell(browser,'css-theme | persistent | vite-hmr', { flip, reloadMode: 'css-theme', tool: 'mvnw', lifecycle: 'persistent' }));
  } else if (group === 'java-body') {
    if (rd(MAINVIEW).includes('new Button("Send")')) flipJavaBody();
    results.push(await runCell(browser,'java-body | persistent | mvnw', { flip: flipJavaBody, reloadMode: 'java', tool: 'mvnw', lifecycle: 'persistent' }));
    results.push(await runCell(browser,'java-body | persistent | mvnd', { flip: flipJavaBody, reloadMode: 'java', tool: 'mvnd', lifecycle: 'persistent' }));
    results.push(await runCell(browser,'java-body | restart    | mvnw', { flip: flipJavaBody, reloadMode: 'java', tool: 'mvnw', lifecycle: 'restart' }));
    results.push(await runCell(browser,'java-body | restart    | mvnd', { flip: flipJavaBody, reloadMode: 'java', tool: 'mvnd', lifecycle: 'restart' }));
  } else if (group === 'java-struct') {
    if (rd(MAINVIEW).includes('email.setId("email")')) flipJavaStruct();
    results.push(await runCell(browser,'java-struct | persistent | mvnw', { flip: flipJavaStruct, reloadMode: 'java', tool: 'mvnw', lifecycle: 'persistent' }));
    results.push(await runCell(browser,'java-struct | persistent | mvnd', { flip: flipJavaStruct, reloadMode: 'java', tool: 'mvnd', lifecycle: 'persistent' }));
    results.push(await runCell(browser,'java-struct | restart    | mvnd', { flip: flipJavaStruct, reloadMode: 'java', tool: 'mvnd', lifecycle: 'restart' }));
  } else if (group === 'readiness') {
    if (rd(MAINVIEW).includes('new Button("Send")')) flipJavaBody();
    results.push({ readiness: await readinessExperiment(browser) });
  }
} finally {
  await browser.close();
}
const stamp = process.env.STAMP || 'run';
wr(`${RESULTS}/${group}.json`, JSON.stringify(results, null, 2));
console.log(`\nwrote ${RESULTS}/${group}.json`);
