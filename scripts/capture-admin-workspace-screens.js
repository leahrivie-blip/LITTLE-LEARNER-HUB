#!/usr/bin/env node
/** Capture Admin Workspace screenshots (desktop, tablet, phone). */
const fs = require("node:fs");
const path = require("node:path");
const http = require("http");
const os = require("node:os");
const crypto = require("crypto");
const { spawn } = require("node:child_process");

const { chromium } = require("playwright");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/screenshots/admin-workspace");
const PORT = 27350 + Math.floor(Math.random() * 50);
const STORE = path.join(os.tmpdir(), `llh-aw-screens-${crypto.randomBytes(3).toString("hex")}.json`);
const ADMIN = { email: "aw-screen@test.local", password: "aw-screen-pass", code: "aw-screen-code" };

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {} }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function boot(child, port) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await request(port, "GET", "/api/health");
      if (r.status === 200) return;
    } catch { /* */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify({ siteContent: { featureFlags: { testingLab: true } } }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      NODE_ENV: "test",
    },
    stdio: "ignore",
  });
  await boot(child, PORT);
  const browser = await chromium.launch({ headless: true });
  const sizes = [
    { name: "desktop", width: 1280, height: 900 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "phone", width: 390, height: 844 },
  ];
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.goto(`http://127.0.0.1:${PORT}/#/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 20000 });
    await page.fill('input[name="adminEmail"]', ADMIN.email);
    await page.fill('input[name="adminPassword"]', ADMIN.password);
    await page.fill('input[name="adminCode"]', ADMIN.code);
    await page.click("#adminUnlockForm button[type='submit']");
    await page.waitForSelector("#view-admin-home.active-view", { timeout: 20000 });
    await page.screenshot({ path: path.join(OUT, `${size.name}-01-admin-home.png`), fullPage: true });
    await page.evaluate(() => setView("admin-testers"));
    await page.waitForSelector("#view-admin-testers.active-view", { timeout: 20000 });
    await page.screenshot({ path: path.join(OUT, `${size.name}-02-testers.png`), fullPage: true });
    await page.close();
  }
  await browser.close();
  child.kill("SIGTERM");
  fs.unlinkSync(STORE);
  console.log(`Screenshots saved to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
