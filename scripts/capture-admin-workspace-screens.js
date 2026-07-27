#!/usr/bin/env node
/** Capture all seven Admin Workspace screens (desktop, tablet, phone). */
const fs = require("node:fs");
const path = require("node:path");
const http = require("http");
const os = require("node:os");
const crypto = require("crypto");
const { spawn } = require("node:child_process");

const { chromium } = require("playwright");
const { resolveTestPort } = require("./test-port.js");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/screenshots/admin-workspace");
const PORT = resolveTestPort(27350, 50);
const STORE = path.join(os.tmpdir(), `llh-aw-screens-${crypto.randomBytes(3).toString("hex")}.json`);
const ADMIN = { email: "aw-screen@test.local", password: "aw-screen-pass", code: "aw-screen-code" };

const SCREENS = [
  { view: "admin-home", file: "01-admin-home.png", label: "Admin Home" },
  { view: "admin-testers", file: "02-testers.png", label: "Testers" },
  { view: "admin-content", file: "03-content.png", label: "Content" },
  { view: "admin-feedback", file: "04-feedback.png", label: "Feedback" },
  { view: "admin-health", file: "05-system-health.png", label: "System Health" },
  { view: "admin-advanced", file: "06-advanced-tools.png", label: "Advanced Tools" },
  { view: "admin-role-preview", file: "07-preview-as-user.png", label: "Preview as User" },
];

const SIZES = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "phone", width: 390, height: 844 },
];

function request(port, method, pathName, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathName,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
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

async function unlockAdmin(page, baseUrl) {
  await page.goto(`${baseUrl}/#/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 20000 });
  await page.fill('input[name="adminEmail"]', ADMIN.email);
  await page.fill('input[name="adminPassword"]', ADMIN.password);
  await page.fill('input[name="adminCode"]', ADMIN.code);
  await page.click("#adminUnlockForm button[type='submit']");
  await page.waitForSelector("#view-admin-home.active-view", { timeout: 30000 });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify({ siteContent: { featureFlags: { testingLab: false } } }, null, 2));
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
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const login = await request(PORT, "POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  await request(PORT, "POST", "/api/testing-lab/onboard-everything", {}, { Authorization: `Bearer ${login.json.token}` });

  const browser = await chromium.launch({ headless: true });
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await unlockAdmin(page, baseUrl);
    for (const screen of SCREENS) {
      if (screen.view === "admin-role-preview") {
        await page.evaluate(() => setView("admin-role-preview"));
      } else {
        await page.evaluate((v) => setView(v), screen.view);
      }
      await page.waitForSelector(`#view-${screen.view}.active-view`, { timeout: 20000 });
      if (screen.view === "admin-health") {
        await page.waitForFunction(() => {
          const t = document.querySelector("#view-admin-health")?.textContent || "";
          return /Website|Database|Retry|timed out/i.test(t);
        }, null, { timeout: 15000 });
      }
      if (screen.view === "admin-testers") {
        await page.waitForTimeout(600);
      }
      await page.screenshot({ path: path.join(OUT, `${size.name}-${screen.file}`), fullPage: true });
      console.log(`Captured ${size.name} ${screen.label}`);
    }
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
