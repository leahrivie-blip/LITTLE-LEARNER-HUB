#!/usr/bin/env node
/**
 * Screenshots for the Testing Lab boot/routing repair handoff.
 * Mirrors the Owner Testing Home acceptance flow (real Admin form login,
 * fake data only — no Stripe/email/SMS/OpenAI).
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/screenshots/testing-lab-boot-repair");
const ADMIN = { email: "boot-repair-shots@example.invalid", password: "boot-repair-pass", code: "boot-repair-code" };
const PORT = 19650 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-boot-repair-shots-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
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

async function enableFlags() {
  const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
  const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
  await requestJson("POST", "/api/admin/site-content", {
    adminToken: adminLogin.json.token,
    siteContent: {
      updatedAt: siteContentGet.json?.siteContent?.updatedAt || "",
      featureFlags: { testingLab: true, testingFeedback: true },
    },
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    await enableFlags();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();

    // 1) Signed-out Admin
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => setView("admin"));
    await page.waitForSelector("#adminUnlockForm", { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "1-signed-out-admin.png"), fullPage: true });

    // 2) Owner Testing Home
    await page.fill("#adminUnlockForm [name='adminEmail']", ADMIN.email);
    await page.fill("#adminUnlockForm [name='adminPassword']", ADMIN.password);
    await page.fill("#adminUnlockForm [name='adminCode']", ADMIN.code);
    await page.click("#adminUnlockForm button[type='submit']");
    await page.waitForTimeout(1500);
    await page.waitForSelector("#view-owner-testing-home.active-view", { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "2-owner-testing-home.png"), fullPage: true });

    // 3) Wizard
    await page.click('[data-oth-panel="accounts"]');
    await page.waitForTimeout(1200);
    await page.waitForSelector("#view-testing-lab.active-view", { timeout: 15000 });
    await page.waitForSelector("[data-tl-pilot-create]", { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "3-add-external-tester-wizard.png"), fullPage: true });

    const testerEmail = `boot.repair.${crypto.randomBytes(3).toString("hex")}@example.invalid`;
    await page.fill("[data-tl-pilot-create] input[name='testerName']", "Boot Repair Tester");
    await page.fill("[data-tl-pilot-create] input[name='email']", testerEmail);
    await page.click("[data-tl-pilot-create] button[type='submit']");
    await page.waitForTimeout(1000);
    const testerPassword = (await page.locator("[data-tl-pilot-password]").textContent()).trim();

    // 4) Provider
    await page.evaluate(() => signOut());
    await page.waitForTimeout(500);
    await page.evaluate(() => openAuthModal("login"));
    await page.waitForTimeout(300);
    await page.fill("#emailInput", testerEmail);
    await page.fill("#passwordInput", testerPassword);
    await page.click("#authSubmitButton");
    await page.waitForTimeout(1500);
    await page.waitForSelector("#pilotProviderNav", { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "4-provider-home-daycare.png"), fullPage: true });

    // 5) Parent
    await page.click("[data-sandbox-switch-role]");
    await page.waitForTimeout(400);
    await page.click('[data-sandbox-role-option="parent_guardian"]');
    await page.waitForTimeout(400);
    if (await page.locator("[data-sandbox-guardian-option]").count()) {
      await page.locator("[data-sandbox-guardian-option]").first().click();
    }
    await page.waitForTimeout(1200);
    await page.waitForSelector("#pilotParentNav", { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "5-parent-home-daycare.png"), fullPage: true });

    await context.close();
    console.log(`Screenshots written to ${OUT}`);
    fs.readdirSync(OUT).forEach((f) => console.log(`  - ${f} (${fs.statSync(path.join(OUT, f)).size} bytes)`));
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
