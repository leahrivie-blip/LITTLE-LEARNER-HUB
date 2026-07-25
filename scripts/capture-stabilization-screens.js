#!/usr/bin/env node
/** Captures Owner Testing Home Health Center + signed-out Admin for stabilization handoff. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/screenshots/stabilization");
const ADMIN = { email: "stab-shots@example.invalid", password: "stab-pass", code: "stab-code" };
const PORT = 19710 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-stab-shots-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {} }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), SITE_URL: `http://127.0.0.1:${PORT}`, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, ADMIN_ACCESS_CODE: ADMIN.code, DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: STORE, NODE_ENV: "test", ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true", LLH_GIT_SHA: "stabdeadbeef0123456789abcdef0123456789" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    for (let i = 0; i < 100; i += 1) {
      try { const res = await requestJson("GET", "/api/health"); if (res.status === 200) break; } catch { /* */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const site = await requestJson("GET", `/api/admin/site-content?adminToken=${login.json.token}`);
    await requestJson("POST", "/api/admin/site-content", { adminToken: login.json.token, siteContent: { updatedAt: site.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } } });

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function");
    await page.evaluate(() => setView("admin"));
    await page.waitForSelector("#adminUnlockForm");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "1-signed-out-admin.png"), fullPage: true });

    await page.fill("#adminUnlockForm [name='adminEmail']", ADMIN.email);
    await page.fill("#adminUnlockForm [name='adminPassword']", ADMIN.password);
    await page.fill("#adminUnlockForm [name='adminCode']", ADMIN.code);
    await page.click("#adminUnlockForm button[type='submit']");
    await page.waitForSelector("#view-owner-testing-home.active-view", { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "2-owner-testing-home-health.png"), fullPage: true });

    await page.click('[data-oth-panel="accounts"]');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "3-add-external-tester.png"), fullPage: true });

    console.log("Wrote screenshots to", OUT);
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
