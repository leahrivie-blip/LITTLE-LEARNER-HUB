#!/usr/bin/env node
/**
 * Stabilization real-browser verification screenshots (computer + phone).
 * Fake fixtures only — local JSON store, disposable Admin + External Tester.
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
const PORT = 26100 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-stab-verify-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = path.join(ROOT, "docs/screenshots/stabilization");
const ADMIN = { email: "stab.verify.admin@example.invalid", password: "stab-verify-pass", code: "stab-verify-code" };

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
      EMAIL_AUTOMATIONS_ENABLED: "false",
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* */ }
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

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log(`SHOT  ${name}`);
}

async function runViewport(browser, label, viewport) {
  const prefix = label === "phone" ? "phone" : "computer";
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedCritical = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e?.message || e)));
  page.on("requestfailed", (req) => {
    const url = req.url();
    // Ignore aborted/cancelled non-critical fetches during navigation/reload.
    if (/\/api\/site-content|\/api\/analytics\//i.test(url)) return;
    if (/\/api\//.test(url) && !/favicon|fonts\.google/.test(url)) failedCritical.push(url);
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });

  // Signed-out /admin — Admin login only
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
  await page.goto(`http://127.0.0.1:${PORT}/?view=admin`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
  await page.evaluate(() => setView("admin"));
  await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
  assert.equal(await page.evaluate(() => document.body.classList.contains("signed-out-admin-view")), true);
  assert.equal(await page.locator("#platformNav:visible, #pilotProviderNav:visible").count().catch(() => 0), 0);
  await shot(page, `${prefix}-01-signed-out-admin.png`);

  // Platform Admin → Owner Testing Home
  await page.fill("#adminUnlockForm [name='adminEmail']", ADMIN.email);
  await page.fill("#adminUnlockForm [name='adminPassword']", ADMIN.password);
  await page.fill("#adminUnlockForm [name='adminCode']", ADMIN.code);
  await page.click("#adminUnlockForm button[type='submit']");
  await page.waitForSelector("#view-owner-testing-home.active-view", { timeout: 30000 });
  await shot(page, `${prefix}-02-owner-testing-home.png`);

  // Testing Lab (not Calendar)
  await page.evaluate(() => setView("testing-lab"));
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.querySelector(".active-view")?.id), "view-testing-lab");
  await shot(page, `${prefix}-03-testing-lab.png`);

  // Add External Tester
  await page.evaluate(() => setView("owner-testing-home"));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const btn = document.querySelector('[data-oth-panel="accounts"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);
  await page.waitForSelector("[data-tl-pilot-create]", { timeout: 15000 });
  await shot(page, `${prefix}-04-add-external-tester.png`);

  const stamp = Date.now().toString(36);
  const email = `stab.verify.${prefix}.${stamp}@example.invalid`;
  await page.fill("[data-tl-pilot-create] input[name='testerName']", `Stab Verify ${prefix}`);
  await page.fill("[data-tl-pilot-create] input[name='email']", email);
  await page.click("[data-tl-pilot-create] button[type='submit']");
  await page.waitForTimeout(1200);
  const password = (await page.locator("[data-tl-pilot-password]").textContent()).trim();

  await page.evaluate(() => { if (typeof signOut === "function") signOut(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => openAuthModal("login"));
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", password);
  await page.click("#authSubmitButton");
  await page.waitForSelector("#pilotProviderNav", { timeout: 20000 });
  await shot(page, `${prefix}-05-provider-nav.png`);

  await page.locator('#pilotProviderNav [data-view="child-tools-daily-logs"]').click({ force: true });
  await page.waitForSelector(".fdlc-classroom-grid", { timeout: 15000 });
  await shot(page, `${prefix}-06-fast-daily-logs.png`);

  // Parent switch
  const memberLogin = await requestJson("POST", "/api/auth/password-login", { email, password });
  const memberAuth = { Authorization: `Bearer ${memberLogin.json.memberSessionToken}` };
  const guardians = await requestJson("GET", "/api/external-tester/guardian-options", null, memberAuth);
  const contactId = guardians.json.options[0].contactId;
  await page.evaluate(async (cid) => {
    const data = await externalTesterSandboxApi("POST", "/api/external-tester/switch-role", { roleKey: "parent_guardian", previewContactId: cid });
    if (currentUser && data?.identity) {
      updateAccount(currentUser, { role: data.identity.role, accountType: data.identity.accountType, familyHubGuardian: data.identity.familyHubGuardian });
    }
  }, contactId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
  await page.evaluate(() => setView("pilot-parent-home"));
  await page.waitForTimeout(1200);
  await shot(page, `${prefix}-07-parent-home.png`);

  // Testing Feedback
  await page.click("[data-tf-toggle]").catch(async () => {
    await page.evaluate(() => document.querySelector("[data-tf-toggle]")?.click());
  });
  await page.waitForTimeout(800);
  await shot(page, `${prefix}-08-testing-feedback.png`);

  const bootTimeouts = consoleErrors.filter((m) => /App boot timed out/i.test(m));
  assert.equal(bootTimeouts.length, 0, `boot timeout on ${label}: ${bootTimeouts.join(" | ")}`);
  const actionable = consoleErrors.filter((m) => !/favicon|ResizeObserver|net::ERR_/i.test(m));
  assert.deepEqual(actionable, [], `console errors on ${label}: ${JSON.stringify(actionable)}`);
  assert.deepEqual(failedCritical, [], `failed API on ${label}: ${JSON.stringify(failedCritical)}`);
  console.log(`OK    ${label} verification clean`);
  await context.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });

    await runViewport(browser, "computer", { width: 1280, height: 900 });
    await runViewport(browser, "phone", { width: 390, height: 844, isMobile: true, hasTouch: true });
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* */ }
  }
  console.log("\nStabilization verification screenshots written to docs/screenshots/stabilization/");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
