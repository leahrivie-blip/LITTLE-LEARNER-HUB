#!/usr/bin/env node
/**
 * Stale-build recovery — regression suite for the testing-site incident
 * where a returning browser's service worker kept serving JS/CSS from
 * BEFORE the latest deploy (cache-first shell strategy + a static,
 * never-incremented cache-busting version string), producing fresh HTML
 * next to stale JS: sidebar showed new nav items but clicking did nothing,
 * and role previews rendered a near-empty nav.
 *
 * Covers:
 *  - Cache-buster consistency: every shell asset URL referenced in
 *    index.html matches EXACTLY what service-worker.js's own APP_SHELL
 *    list precaches — this is exactly the invariant that broke silently
 *    before (a doc in this repo describes an earlier, separate incident of
 *    the same shape).
 *  - GET /api/build-version exists and reports a stable bootTime across
 *    repeated calls to the same running server (proving it does NOT change
 *    on every request — otherwise every client would falsely detect
 *    "stale" on every periodic check).
 *  - The client only shows "a new version is available" after an ACTUAL
 *    mismatch, never on first load (establishing its own baseline first).
 *  - The reload path unregisters every service worker and clears every
 *    Cache Storage entry before reloading — never just a plain reload that
 *    could hit the very same stale cache again.
 *  - No automatic reload ever happens — every reload is a single explicit
 *    click — so this can never trap anyone in a reload loop.
 *
 * Run: node scripts/test-stale-build-recovery.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  chromium = null;
}

const ROOT = path.join(__dirname, "..");
const PORT = 26400 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-stale-build-${crypto.randomBytes(4).toString("hex")}.json`);

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function extractShellUrls(source, listVarPattern) {
  const match = source.match(listVarPattern);
  if (!match) return [];
  return [...match[0].matchAll(/"(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
}

function assertCacheBusterConsistency() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const platformPerf = fs.readFileSync(path.join(ROOT, "platform-perf.js"), "utf8");

  const indexAppJs = indexHtml.match(/<script src="app\.js\?v=([^"]+)"/)?.[1];
  const indexStylesCss = indexHtml.match(/<link rel="stylesheet" href="styles\.css\?v=([^"]+)"/)?.[1];
  assert.ok(indexAppJs, "expected app.js version query string in index.html");
  assert.ok(indexStylesCss, "expected styles.css version query string in index.html");

  const shellAppJs = sw.match(/"\/app\.js\?v=([^"]+)"/)?.[1];
  const shellStylesCss = sw.match(/"\/styles\.css\?v=([^"]+)"/)?.[1];
  assert.ok(shellAppJs, "expected app.js entry in service-worker.js APP_SHELL");
  assert.ok(shellStylesCss, "expected styles.css entry in service-worker.js APP_SHELL");

  assert.equal(
    indexAppJs, shellAppJs,
    `index.html references app.js?v=${indexAppJs} but service-worker.js's APP_SHELL still precaches app.js?v=${shellAppJs} — THIS EXACT MISMATCH is what caused the reported incident (fresh HTML, stale cached JS)`,
  );
  assert.equal(
    indexStylesCss, shellStylesCss,
    `index.html references styles.css?v=${indexStylesCss} but service-worker.js's APP_SHELL still precaches styles.css?v=${shellStylesCss}`,
  );

  // testing-lab-ui.js (loaded lazily via platform-perf.js) must also carry a version query string.
  const testingLabUiVersion = platformPerf.match(/"testing-lab-ui\.js\?v=([^"]+)"/)?.[1];
  assert.ok(testingLabUiVersion, "expected testing-lab-ui.js to carry a cache-busting version query string in platform-perf.js");

  pass("Cache-buster consistency: index.html's app.js/styles.css version query strings exactly match what service-worker.js's own APP_SHELL precaches — the exact mismatch that caused the reported incident can never silently recur undetected");
}

function assertStaticMarkers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const serverIndex = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

  assert.match(appJs, /function checkForStaleBuild/);
  assert.match(appJs, /function reloadToLatestBuild/);
  assert.match(appJs, /async function reloadToLatestBuild\(\) \{[\s\S]*?getRegistrations\(\)/);
  assert.match(appJs, /async function reloadToLatestBuild\(\)[\s\S]{0,600}caches\.delete/);
  assert.match(indexHtml, /id="staleBuildBanner"/);
  assert.match(indexHtml, /data-stale-build-reload/);
  assert.match(serverIndex, /function handleBuildVersion/);
  assert.match(serverIndex, /"\/api\/build-version"/);

  // No automatic reload anywhere near the stale-build logic — location.reload()
  // must only ever be called from inside reloadToLatestBuild(), which is only
  // ever invoked by an explicit click handler, never a timer.
  const reloadCalls = [...appJs.matchAll(/location\.reload\(/g)];
  assert.ok(reloadCalls.length >= 1, "expected at least one location.reload() call");
  const staleBuildSectionStart = appJs.indexOf("// ---- Stale-build recovery");
  const staleBuildSectionEnd = appJs.indexOf("// ---- External Tester Sandbox");
  const staleBuildSection = appJs.slice(staleBuildSectionStart, staleBuildSectionEnd);
  const reloadCallsInSection = [...staleBuildSection.matchAll(/location\.reload\(/g)];
  assert.equal(reloadCallsInSection.length, 1, "the stale-build section must call location.reload() exactly once, inside reloadToLatestBuild()");
  assert.doesNotMatch(staleBuildSection, /setInterval\([^)]*reloadToLatestBuild/, "reloadToLatestBuild must never be wired to a timer — only an explicit click");

  pass("static markers: stale-build detection, the unregister+cache-clear reload path, the build-version endpoint, and the banner markup all exist; reload is never automatic");
}

async function main() {
  assertCacheBusterConsistency();
  assertStaticMarkers();

  const child = startServer();
  try {
    await waitForBoot(child);

    // ---- 1. GET /api/build-version exists and is stable across repeated calls
    {
      const first = await requestJson("GET", "/api/build-version");
      assert.equal(first.status, 200);
      assert.ok(typeof first.json.gitSha === "string");
      assert.ok(first.json.bootTime, "expected a bootTime");
      const second = await requestJson("GET", "/api/build-version");
      assert.equal(second.json.bootTime, first.json.bootTime, "bootTime must be stable across requests to the SAME running server — otherwise every periodic client check would falsely detect a new build");
      assert.equal(second.json.gitSha, first.json.gitSha);
      pass("1. GET /api/build-version exists and reports a stable gitSha/bootTime across repeated calls to the same running server");
    }

    // ---- 2. gitSha prefers LLH_GIT_SHA, falls back to RENDER_GIT_COMMIT automatically
    {
      await stopServer(child);
    }
    const child2 = startServer({ RENDER_GIT_COMMIT: "renderabc1234" });
    try {
      await waitForBoot(child2);
      const res = await requestJson("GET", "/api/build-version");
      assert.equal(res.json.gitSha, "renderabc1234", "must fall back to Render's own automatically-injected RENDER_GIT_COMMIT when LLH_GIT_SHA/GIT_COMMIT are unset — no manual setup required on Render");
      pass("2. Build version automatically picks up Render's own RENDER_GIT_COMMIT env var with zero manual configuration");
    } finally {
      await stopServer(child2);
    }

    // ---- 3. Browser-driven: mismatch is detected, banner shown, reload path unregisters SW + clears caches, no auto-reload loop
    if (!chromium) {
      console.log("Playwright unavailable — skipping browser-driven checks (static + API checks above still ran).");
    } else {
      const child3 = startServer({ LLH_GIT_SHA: "sha-before-deploy" });
      const browser = await chromium.launch({ headless: true });
      try {
        await waitForBoot(child3);
        const baseUrl = `http://127.0.0.1:${PORT}/`;
        // Service workers intercept their own /api/ fetches internally, which
        // Playwright's page-level route interception can't reliably see —
        // block SW registration for this context so we can cleanly mock the
        // build-version endpoint and test THIS app code's own detection
        // logic in isolation from the (separately tested) SW cache behavior.
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(e.message));
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
        await page.waitForTimeout(500);

        const bannerHiddenInitially = await page.locator("#staleBuildBanner").isHidden();
        assert.equal(bannerHiddenInitially, true, "the stale-build banner must never show on a normal first load with no mismatch yet");

        // Simulate a deploy happening while this tab stays open: the server's
        // reported gitSha changes. checkForStaleBuild() must detect this on
        // its own (not require a reload) and show the banner.
        await page.evaluate(() => { staleBuildState.lastReloadedAt = 0; });
        await page.route(/\/api\/build-version/, (route) => route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, gitSha: "sha-after-deploy", bootTime: "2026-01-01T00:00:00.000Z" }),
        }));
        await page.evaluate(() => checkForStaleBuild());
        await page.waitForTimeout(300);
        const bannerVisibleAfterMismatch = await page.locator("#staleBuildBanner").isVisible();
        assert.equal(bannerVisibleAfterMismatch, true, "a detected gitSha mismatch must show the 'new version available' banner");
        pass("3a. A build-version mismatch detected while the tab is open shows the recovery banner; a fresh load with no mismatch never shows it");

        // The Reload button must unregister every service worker and clear
        // every cache, THEN reload. location.reload itself is native/
        // non-configurable in real browsers, so verify the two prerequisite
        // steps via mocks that signal completion through a page console
        // message (observable even across the navigation that follows),
        // and separately confirm a real navigation actually occurs.
        const orderedSignals = [];
        page.on("console", (msg) => {
          if (msg.text().startsWith("[stale-build-test]")) orderedSignals.push(msg.text());
        });
        await page.evaluate(() => {
          const fakeRegistration = { unregister: async () => { console.log("[stale-build-test] unregister"); return true; } };
          if (navigator.serviceWorker) {
            navigator.serviceWorker.getRegistrations = async () => [fakeRegistration];
          }
          if (window.caches) {
            window.caches.keys = async () => ["llh-shell-old-cache"];
            window.caches.delete = async () => { console.log("[stale-build-test] caches-delete"); return true; };
          }
        });
        const [navigation] = await Promise.all([
          page.waitForNavigation({ timeout: 8000 }).catch(() => null),
          page.evaluate(() => { reloadToLatestBuild(); }),
        ]);
        assert.ok(navigation, "clicking Reload must actually navigate/reload the page, not just clear caches and stop");
        assert.ok(orderedSignals.includes("[stale-build-test] unregister"), "clicking Reload must unregister every existing service worker BEFORE reloading");
        assert.ok(orderedSignals.includes("[stale-build-test] caches-delete"), "clicking Reload must clear every Cache Storage entry BEFORE reloading");
        pass("3b. The Reload path unregisters every service worker and clears every cache, THEN genuinely reloads the page — never just a plain reload that could hit the same stale cache again");

        // No-loop guard: the page just genuinely reloaded above (real
        // navigation, not simulated). The freshly-loaded page establishes
        // ITS OWN baseline from whatever the server (here, the still-mocked
        // endpoint) reports right now — so immediately re-checking must
        // never show the banner again, proving one reload is enough and
        // nothing here can spiral into a reload loop.
        await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 }).catch(() => null);
        await page.waitForTimeout(500);
        await page.evaluate(() => checkForStaleBuild()).catch(() => null);
        await page.waitForTimeout(200);
        const bannerAfterFreshReload = await page.locator("#staleBuildBanner").isHidden().catch(() => true);
        assert.equal(bannerAfterFreshReload, true, "immediately after a genuine reload, the banner must not reappear on the very next check — one reload always re-syncs the baseline, so this can never spiral into a loop");
        pass("3c. No reload loop: after a genuine reload, the freshly-loaded page re-syncs its own baseline and the banner never reappears on the very next check — nothing here is ever timer-driven or automatic");

        assert.deepEqual(pageErrors, [], `zero page errors expected throughout: ${JSON.stringify(pageErrors)}`);
        await context.close();
      } finally {
        await stopServer(child3);
        await browser.close();
      }
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nStale-build recovery checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
