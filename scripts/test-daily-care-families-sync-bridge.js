#!/usr/bin/env node
/**
 * Daily Care <-> Families connected-data bridge.
 *
 * A Home Daycare Pilot / connected testing account's children live in TWO
 * different storage layers: the server-side Families/Pilot data
 * (store.childRecords, via /api/pilot/children) and the browser's own
 * local Daily Care store (localStorage childStore("Profiles")). Without a
 * bridge, Families would show the wizard-created children while Daily
 * Care showed an empty classroom — exactly the "disconnected data"
 * problem this task explicitly warns against. syncPilotChildrenIntoLocalStore()
 * (app.js) mirrors server children into the local store, additively and
 * idempotently, so both screens show the SAME roster.
 *
 * Run: node scripts/test-daily-care-families-sync-bridge.js
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
const PORT = 26900 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-sync-bridge-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "sync-bridge-admin@example.invalid", password: "sync-bridge-pass", code: "sync-bridge-code" };

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

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
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

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /function syncPilotChildrenIntoLocalStore/);
  pass("static markers: the Daily Care <-> Families sync bridge exists");

  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven checks (static-only run).");
    console.log(`\nDaily Care / Families sync bridge checks passed (${passed}; browser checks skipped).`);
    return;
  }

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });
    const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Sync Bridge Owner", email: "sync.bridge.owner@example.invalid", childCount: 3 }, auth);
    const wizardChildNames = wizard.json.children.map((c) => c.displayName);

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => openAuthModal("login"));
    await page.waitForTimeout(300);
    await page.fill("#emailInput", "sync.bridge.owner@example.invalid");
    await page.fill("#passwordInput", wizard.json.temporaryPassword);
    await page.click("#authSubmitButton");
    await page.waitForTimeout(1500);

    // Daily Care (local childStore) must show the SAME children the server-side wizard created.
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(1000);
    const gridText = await page.locator(".fdlc-classroom-grid").textContent();
    for (const name of wizardChildNames) {
      assert.ok(gridText.includes(name), `Daily Care's classroom grid must show the server-side child "${name}" — Families and Daily Care must show the SAME connected roster`);
    }
    pass("1. Daily Care (local childStore) automatically mirrors the server-side connected children created via the wizard/Families panel — no disconnected/empty classroom view");

    // Adding a child via Families (server) then revisiting Daily Care shows it too, with no duplicates on repeat visits.
    await page.evaluate(() => setView("pilot-families"));
    await page.waitForTimeout(600);
    await page.fill('[data-pilot-add-child] input[name="displayName"]', "Bridge Test New Child");
    await page.click('[data-pilot-add-child] button[type="submit"]');
    await page.waitForTimeout(600);
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(1000);
    const gridTextAfter = await page.locator(".fdlc-classroom-grid").textContent();
    assert.match(gridTextAfter, /Bridge Test New Child/, "a child added via Families must appear in Daily Care too, without needing a manual local Add Child step");

    // Revisit twice more — must never duplicate the same child.
    await page.evaluate(() => setView("today"));
    await page.waitForTimeout(300);
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(800);
    await page.evaluate(() => setView("today"));
    await page.waitForTimeout(300);
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(800);
    const cardCount = await page.locator(".fdlc-child-card").count();
    const uniqueNames = new Set([...wizardChildNames, "Bridge Test New Child"]);
    assert.equal(cardCount, uniqueNames.size, `expected exactly ${uniqueNames.size} unique child cards after repeated visits, got ${cardCount} — the sync must never duplicate a child`);
    pass("2. The sync is additive and idempotent — repeated visits to Daily Care never duplicate a child, and a child added via Families appears in Daily Care without a manual step");

    assert.deepEqual(pageErrors, [], `sync bridge flow should have zero console errors: ${JSON.stringify(pageErrors)}`);
    await context.close();
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nDaily Care / Families sync bridge checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
