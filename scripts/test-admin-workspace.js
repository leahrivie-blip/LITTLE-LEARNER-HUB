#!/usr/bin/env node
/**
 * Admin Workspace redesign — focused acceptance tests.
 * Run: npm run test:admin-workspace
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("http");
const os = require("node:os");
const crypto = require("crypto");
const { spawn } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  chromium = null;
}

const ROOT = path.join(__dirname, "..");
const PORT = 27200 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-workspace-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "admin-workspace@test.local", password: "admin-workspace-pass", code: "admin-workspace-code" };

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

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
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
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
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: { featureFlags: { testingLab: true } },
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
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
      LLH_STORE_PATH: STORE_PATH,
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.stderr?.read?.()?.toString?.() || ""}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function main() {
  if (!chromium) {
    console.error("FAIL: playwright required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert.equal(login.status, 200);
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const homeApi = await requestJson("GET", "/api/admin/workspace/home", null, auth);
    assert.equal(homeApi.status, 200);
    assert.equal(homeApi.json.ok, true);
    pass("workspace home API returns plain-language summary");

    const healthApi = await requestJson("GET", "/api/admin/workspace/health", null, auth);
    assert.equal(healthApi.status, 200);
    assert.ok(Array.isArray(healthApi.json.cards));
    pass("workspace health API returns cards");

    const noAuth = await requestJson("GET", "/api/admin/workspace/home");
    assert.equal(noAuth.status, 403);
    pass("workspace API rejects missing admin token");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${PORT}`;

    await page.goto(`${baseUrl}/#/admin`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.fill('input[name="adminEmail"]', ADMIN.email);
    await page.fill('input[name="adminPassword"]', ADMIN.password);
    await page.fill('input[name="adminCode"]', ADMIN.code);
    await page.click("#adminUnlockForm button[type='submit']");
    await page.waitForSelector("#view-admin-home.active-view", { timeout: 30000 });
    pass("/admin unlock opens Admin Home");

    const adminNav = await page.locator("#adminWorkspaceNav");
    await adminNav.waitFor({ state: "visible", timeout: 10000 });
    pass("Admin workspace nav visible after unlock");

    const platformNavHidden = await page.evaluate(() => document.querySelector("#platformNav")?.hidden === true);
    assert.equal(platformNavHidden, true, "provider platformNav must be hidden in admin workspace");
    pass("Admin navigation excludes provider sidebar");

    await page.click('[data-view="admin-testers"]');
    await page.waitForSelector("#view-admin-testers.active-view", { timeout: 15000 });
    await page.waitForSelector("[data-tl-pilot-create], [data-tl-pilot-wizard]", { timeout: 15000 });
    pass("Testers page shows Home Daycare wizard");

    await page.click('[data-admin-workspace-nav][data-view="admin-home"]');
    await page.waitForSelector("#view-admin-home.active-view", { timeout: 10000 });
    pass("Return to Admin Home from nav");

    await page.click('[data-view="admin-content"]');
    await page.waitForSelector("#view-admin-content.active-view", { timeout: 10000 });
    const contentText = await page.locator("#view-admin-content").textContent();
    assert.match(contentText, /Lesson Plans/i);
    pass("Content page loads with lesson plan section");

    await page.click('[data-view="admin-health"]');
    await page.waitForSelector("#view-admin-health.active-view", { timeout: 10000 });
    await page.waitForFunction(() => {
      const t = document.querySelector("#view-admin-health")?.textContent || "";
      return /Website|Database|Working|Needs Attention|Checking/i.test(t);
    }, null, { timeout: 15000 });
    pass("Health page finishes loading or shows actionable state");

    await context.close();
    await browser.close();

    console.log(`\nAdmin workspace tests passed (${passed}).`);
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
