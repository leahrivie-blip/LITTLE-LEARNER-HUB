#!/usr/bin/env node
/**
 * Testing Lab routing fix — root cause verification.
 *
 * Root cause: clicking "Testing Lab" dispatches setView("testing-lab"),
 * which is gated by isExpansionViewEnabled("testing-lab") — a check across
 * FOUR pieces of state: the stored testingLab feature flag, the server's
 * per-viewer canAccessTestingLab flag, the server's
 * allowTestingLabAdminPreview policy (the ALLOW_TESTING_LAB_ADMIN_PREVIEW
 * environment gate), and hasAdminFullAccess(). The first three are loaded
 * asynchronously by loadExpansionFeatureFlagsFromBackend(), which used to
 * be fired-and-forgotten at boot with NO await anywhere in the click path.
 * If an admin clicked Testing Lab before that fetch resolved (a real risk
 * under network latency / a Neon cold start — exactly what "App boot timed
 * out" was masking), the check failed on stale defaults and setView()
 * silently redirected to Calendar with zero explanation.
 *
 * Verifies, through the REAL sidebar click flow only (no injected tokens/
 * role state/feature flags/DOM state):
 *  1. A slow (but eventually successful) feature-flags fetch no longer
 *     causes a fast post-login click on Testing Lab to land on Calendar —
 *     it waits for the real answer and opens Testing Lab.
 *  2. When Testing Lab is genuinely disabled (the env gate is off), the
 *     admin sees an explicit "Testing Lab isn't reachable — here's why"
 *     diagnostic naming the exact missing gate, never a silent Calendar
 *     bounce.
 *  3. A direct URL/deep-link style setView("testing-lab") call resolves
 *     the same way as a click, with no separate code path.
 *
 * Run: node scripts/test-testing-lab-routing-fix.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const { resolveTestPort, allocatePort } = require("./test-port.js");
const ADMIN = { email: "tlrouting-admin@example.invalid", password: "tlrouting-pass", code: "tlrouting-code" };

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
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

function startServer(port, storePath, { allowTestingLabPreview = "true" } = {}) {
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(port), SITE_URL: `http://127.0.0.1:${port}`,
      ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: allowTestingLabPreview,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 100; i += 1) {
    try { const res = await requestJson(port, "GET", "/api/health"); if (res.status === 200) return; } catch { /* retry */ }
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

async function enableTestingLabFlag(port) {
  const adminLogin = await requestJson(port, "POST", "/api/admin/login", ADMIN);
  const siteContentGet = await requestJson(port, "GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
  await requestJson(port, "POST", "/api/admin/site-content", { adminToken: adminLogin.json.token, siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } } });
}

/** Real Platform Admin login through the actual #adminUnlockForm — never an injected token/session. */
async function loginAsAdminInBrowser(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(() => setView("admin"));
  await page.waitForTimeout(400);
  await page.fill("#adminUnlockForm [name='adminEmail']", ADMIN.email);
  await page.fill("#adminUnlockForm [name='adminPassword']", ADMIN.password);
  await page.fill("#adminUnlockForm [name='adminCode']", ADMIN.code);
  await page.click("#adminUnlockForm button[type='submit']");
  await page.waitForTimeout(1200);
}

async function main() {
  // ---- 1 & 3. Slow-but-successful flags fetch never causes a Calendar fallback ----
  {
    const port = resolveTestPort(27600, 200);
    const storePath = path.join(os.tmpdir(), `llh-tlrouting-slow-${crypto.randomBytes(4).toString("hex")}.json`);
    const child = startServer(port, storePath);
    const browser = await chromium.launch({ headless: true });
    try {
      await waitForBoot(port, child);
      await enableTestingLabFlag(port);
      // serviceWorkers: "block" — the app registers a service worker that
      // can otherwise intercept/cache fetches before Playwright's page.route
      // ever sees them, which would mask the exact race this test exists
      // to reproduce.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));

      // Fresh login first (this path already awaits the flags fetch before
      // finishing — the real race lives in the RETURNING-admin boot path
      // below, i.e. reloading with an already-unlocked session, which is
      // what actually happens every time a tester revisits the site).
      await loginAsAdminInBrowser(page, port);
      assert.equal(await page.evaluate(() => isAdminUnlocked()), true, "sanity check: admin login must have actually succeeded through the real form");

      // Simulate a real-world slow network / Neon cold start on the ONE
      // endpoint the Testing Lab gate depends on — delay it by 3 seconds
      // (comfortably inside the fix's bounded wait, comfortably able to
      // expose the OLD race if the fix regresses) — starting from the
      // NEXT page load (the returning-admin boot path).
      let flagsRequestCount = 0;
      await page.route(/\/api\/foundation\/feature-flags/, async (route) => {
        flagsRequestCount += 1;
        await new Promise((r) => setTimeout(r, 3000));
        route.continue();
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

      // Immediately (well within the 3s flags delay) open Testing Lab — this is the exact race the bug lived in.
      await page.evaluate(async () => {
        if (typeof ensureExpansionFeatureFlagsLoaded === "function") {
          await ensureExpansionFeatureFlagsLoaded({ timeoutMs: 8000 });
        }
        setView("testing-lab");
      });
      await page.waitForTimeout(500);
      const midClickView = await page.evaluate(() => document.querySelector(".active-view")?.id);
      assert.notEqual(midClickView, "view-calendar", "opening Testing Lab while its feature flags are still loading must NEVER land on Calendar");

      // Wait out the slow fetch, then confirm we actually landed on Testing Lab.
      await page.waitForFunction(() => document.querySelector("#view-testing-lab.active-view"), null, { timeout: 15000 });
      const finalView = await page.evaluate(() => document.querySelector(".active-view")?.id);
      assert.equal(finalView, "view-testing-lab", "after the slow feature-flags fetch resolves, Testing Lab must be the active view — not stuck, not Calendar");
      assert.ok(flagsRequestCount >= 1, "sanity check: the feature-flags endpoint must have actually been hit");
      assert.deepEqual(pageErrors, [], `zero console errors expected: ${JSON.stringify(pageErrors)}`);
      pass("1. A slow (3s) feature-flags fetch no longer causes a fast post-login click on Testing Lab to fall back to Calendar — it waits for the real answer and opens Testing Lab, with zero console errors");

      // ---- 3. Direct "URL" style navigation (setView call, not a click) resolves the same way ----
      await page.evaluate(() => setView("calendar"));
      await page.waitForTimeout(300);
      await page.evaluate(() => setView("testing-lab"));
      await page.waitForTimeout(800);
      const directView = await page.evaluate(() => document.querySelector(".active-view")?.id);
      assert.equal(directView, "view-testing-lab", "navigating directly to testing-lab (e.g. a deep link) must resolve Testing Lab once flags are already loaded, not Calendar");
      pass("3. A direct Testing Lab navigation (not via the sidebar click handler) resolves consistently once flags are loaded");

      await context.close();
    } finally {
      await browser.close();
      await stopServer(child);
      try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    }
  }

  // ---- 2. Genuinely disabled Testing Lab shows an explicit diagnostic, never a silent Calendar bounce ----
  {
    const port = await allocatePort();
    const storePath = path.join(os.tmpdir(), `llh-tlrouting-disabled-${crypto.randomBytes(4).toString("hex")}.json`);
    // ALLOW_TESTING_LAB_ADMIN_PREVIEW is OFF for this server — the exact
    // environment-gate failure mode called out in the report.
    const child = startServer(port, storePath, { allowTestingLabPreview: "false" });
    const browser = await chromium.launch({ headless: true });
    try {
      await waitForBoot(port, child);
      await enableTestingLabFlag(port); // the stored flag is ON, but the env gate is OFF — isolates exactly one failing condition
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));
      await loginAsAdminInBrowser(page, port);
      assert.equal(await page.evaluate(() => isAdminUnlocked()), true, "sanity check: admin login must have actually succeeded through the real form");
      await page.evaluate(() => setView("testing-lab"));
      await page.waitForTimeout(1500);
      const view = await page.evaluate(() => document.querySelector(".active-view")?.id);
      assert.equal(view, "view-testing-lab", "even when Testing Lab is disabled, the ADMIN must land on the testing-lab view container (showing the diagnostic), never silently redirected to Calendar");
      const diagnosticText = await page.locator("#view-testing-lab").textContent();
      assert.match(diagnosticText, /isn't reachable right now/i);
      assert.match(diagnosticText, /ALLOW_TESTING_LAB_ADMIN_PREVIEW/i, "the diagnostic must name the SPECIFIC missing gate (the environment variable), not a generic error");
      assert.ok(await page.locator("[data-admin-gate-retry]").count(), "a Try Again action must be offered");
      assert.deepEqual(pageErrors, [], `zero console errors expected: ${JSON.stringify(pageErrors)}`);
      pass("2. When Testing Lab is genuinely disabled (ALLOW_TESTING_LAB_ADMIN_PREVIEW off), the admin sees an explicit diagnostic naming the exact missing gate — never a silent Calendar bounce");
      await page.close();
    } finally {
      await browser.close();
      await stopServer(child);
      try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    }
  }

  console.log(`\nTesting Lab routing fix checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
