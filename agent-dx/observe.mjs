// The agent's "eyes": poll-until-rendered-value-matches-expected.
// Ground-truth readiness detector for the benchmark and the reusable observe step.
//
// IMPORTANT: each observe() uses a FRESH browser context. A long-lived tab against a
// Vaadin app serves STALE static assets (HTTP no-cache revalidation + a PWA service
// worker that caches styles.css), so a reused page reports old CSS for seconds. A fresh
// context has an empty cache + SW registry, so it always sees the current rendered state.
// Context creation is ~milliseconds (the browser process is reused), so this is cheap.
//
// CLI:  node observe.mjs --selector '#submit' --check "document.querySelector('#submit').textContent.trim()" --expect Send
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = process.env.OBSERVE_URL || `http://localhost:${process.env.PORT || 8081}/`;

export async function launchBrowser() {
  return await chromium.launch({ headless: true });
}

/**
 * Reload-and-check loop in a fresh context. Returns { ok, ms, polls, value }.
 * `check` is a JS expression string evaluated in the page; compared (as string) to `expect`.
 */
export async function observe(browser, { url = DEFAULT_URL, selector, check, expect, timeoutMs = 60000, intervalMs = 120 } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const start = performance.now();
  let polls = 0;
  let value = null;
  try {
    while (performance.now() - start < timeoutMs) {
      polls++;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 4000 });
        if (selector) await page.waitForSelector(selector, { timeout: 3000 });
        value = await page.evaluate(check);
        if (String(value) === String(expect)) {
          return { ok: true, ms: +(performance.now() - start).toFixed(1), polls, value };
        }
      } catch {
        // server mid-restart / client not rendered yet -> keep polling
      }
      await sleep(intervalMs);
    }
    return { ok: false, ms: +(performance.now() - start).toFixed(1), polls, value };
  } finally {
    await context.close();
  }
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, arr) => {
      if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
      return acc;
    }, [])
  );
  const browser = await launchBrowser();
  const res = await observe(browser, {
    url: args.url || DEFAULT_URL,
    selector: args.selector,
    check: args.check,
    expect: args.expect,
    timeoutMs: args.timeout ? +args.timeout : 60000,
  });
  await browser.close();
  console.log(JSON.stringify(res));
  process.exit(res.ok ? 0 : 1);
}
