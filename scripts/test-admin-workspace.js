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
const ADMIN = { email: "admin-workspace@test.local", password: "admin-workspace-pass", code: "admin-workspace-code" };

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
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

function startServer(port, storePath, extraEnv = {}) {
  fs.writeFileSync(storePath, JSON.stringify({
    users: {},
    siteContent: { featureFlags: { testingLab: false } },
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      SITE_URL: `http://127.0.0.1:${port}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      NODE_ENV: "test",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child, port) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.stderr?.read?.()?.toString?.() || ""}`);
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function adminLogin(port) {
  const login = await requestJson(port, "POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert.equal(login.status, 200);
  return login.json.token;
}

async function unlockAdmin(page, baseUrl) {
  await page.goto(`${baseUrl}/#/admin`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.fill('input[name="adminEmail"]', ADMIN.email);
  await page.fill('input[name="adminPassword"]', ADMIN.password);
  await page.fill('input[name="adminCode"]', ADMIN.code);
  await page.click("#adminUnlockForm button[type='submit']");
  await page.waitForSelector("#view-admin-home.active-view", { timeout: 30000 });
}

async function main() {
  if (!chromium) {
    console.error("FAIL: playwright required");
    process.exitCode = 1;
    return;
  }

  const port = 27200 + Math.floor(Math.random() * 200);
  const storePath = path.join(os.tmpdir(), `llh-admin-workspace-${crypto.randomBytes(4).toString("hex")}.json`);
  const child = startServer(port, storePath);
  try {
    await waitForBoot(child, port);
    const token = await adminLogin(port);
    const auth = { Authorization: `Bearer ${token}` };
    const baseUrl = `http://127.0.0.1:${port}`;

    const homeApi = await requestJson(port, "GET", "/api/admin/workspace/home", null, auth);
    assert.equal(homeApi.status, 200);
    assert.equal(homeApi.json.ok, true);
    assert.equal(homeApi.json.testingLabGate?.checks?.find((c) => c.key === "stored_flag")?.ok, false);
    pass("workspace home API works when testingLab=false");

    const healthApi = await requestJson(port, "GET", "/api/admin/workspace/health", null, auth);
    assert.equal(healthApi.status, 200);
    assert.ok(Array.isArray(healthApi.json.cards));
    pass("workspace health API returns cards");

    const noAuth = await requestJson(port, "GET", "/api/admin/workspace/home");
    assert.equal(noAuth.status, 403);
    pass("workspace API rejects missing admin token");

    const onboardCold = await requestJson(port, "POST", "/api/testing-lab/onboard-everything", {}, auth);
    assert.equal(onboardCold.status, 200);
    assert.ok(onboardCold.json.featureFlagsEnabled?.includes("testingLab"));
    pass("onboard-everything enables testingLab from cold start (flag was off)");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await unlockAdmin(page, baseUrl);
    pass("/admin unlock opens Admin Home with testingLab=false store");

    const adminNav = page.locator("#adminWorkspaceNav");
    await adminNav.waitFor({ state: "visible", timeout: 10000 });
    pass("Admin workspace nav visible after unlock");

    const platformNavHidden = await page.evaluate(() => document.querySelector("#platformNav")?.hidden === true);
    assert.equal(platformNavHidden, true, "provider platformNav must be hidden in admin workspace");
    pass("Admin navigation excludes provider sidebar");

    const adminViews = [
      ["admin-testers", "Testers", /Home Daycare|Set Up Testing Site|Get Testing Site Ready|External Tester/i],
      ["admin-content", "Content", /Lesson Plans|Curriculum organization|Forms/i],
      ["admin-feedback", "Feedback", /Feedback|Testing Feedback/i],
      ["admin-health", "System Health", /Website|Database|Working|Needs Attention|Checking/i],
      ["admin-advanced", "Advanced Tools", /Advanced tools/i],
      ["admin-role-preview", "Preview", /Preview as a User|ADMIN PREVIEW/i],
    ];
    for (const [view, label, pattern] of adminViews) {
      await page.evaluate((v) => setView(v), view);
      await page.waitForSelector(`#view-${view}.active-view`, { timeout: 15000 });
      if (view === "admin-health") {
        await page.waitForFunction(() => {
          const t = document.querySelector("#view-admin-health")?.textContent || "";
          return /Website|Database|Working|Needs Attention|Checking|Retry|timed out/i.test(t);
        }, null, { timeout: 20000 });
      }
      const onCalendar = await page.evaluate(() => document.querySelector("#view-calendar")?.classList.contains("active-view"));
      assert.equal(onCalendar, false, `${view} must not redirect to Calendar`);
      const text = await page.locator(`#view-${view}`).textContent();
      assert.match(text, pattern, `${label} screen must show real content`);
      pass(`${label} opens real screen (no Calendar redirect)`);
    }

    await page.evaluate(() => setView("admin-home"));
    await page.waitForSelector("#view-admin-home.active-view", { timeout: 10000 });
    pass("Return to Admin Home from programmatic nav");

    await page.click('[data-aw-exit-admin]');
    await page.waitForFunction(() => !document.querySelector("#view-admin-home.active-view"), null, { timeout: 15000 });
    const exited = await page.evaluate(() => document.querySelector("#view-home.active-view") !== null || document.querySelector("#view-admin.active-view") !== null);
    assert.ok(exited, "Exit Admin must leave admin workspace");
    pass("Exit Admin leaves workspace");

    await context.close();
    await browser.close();

    // Missing ALLOW_TESTING_LAB_ADMIN_PREVIEW — separate server instance
    const port2 = 27400 + Math.floor(Math.random() * 100);
    const store2 = path.join(os.tmpdir(), `llh-admin-workspace-gate-${crypto.randomBytes(3).toString("hex")}.json`);
    const child2 = startServer(port2, store2, { ALLOW_TESTING_LAB_ADMIN_PREVIEW: "" });
    try {
      await waitForBoot(child2, port2);
      const token2 = await adminLogin(port2);
      const auth2 = { Authorization: `Bearer ${token2}` };
      const gatedHome = await requestJson(port2, "GET", "/api/admin/workspace/home", null, auth2);
      assert.equal(gatedHome.status, 200);
      const envCheck = gatedHome.json.testingLabGate?.checks?.find((c) => c.key === "env_preview");
      assert.equal(envCheck?.ok, false);
      assert.match(envCheck?.detail || "", /Testing Lab is disabled in the Render testing environment/i);
      pass("missing ALLOW_TESTING_LAB_ADMIN_PREVIEW returns exact gate message in API");

      const browser2 = await chromium.launch({ headless: true });
      const page2 = await browser2.newPage({ viewport: { width: 390, height: 844 } });
      await unlockAdmin(page2, `http://127.0.0.1:${port2}`);
      await page2.evaluate(() => setView("admin-testers"));
      await page2.waitForSelector("#view-admin-testers.active-view", { timeout: 15000 });
      await page2.waitForFunction(() => {
        const t = document.querySelector("#view-admin-testers")?.textContent || "";
        return /Testing Lab is disabled in the Render testing environment/i.test(t);
      }, null, { timeout: 30000 });
      const onCalendar2 = await page2.evaluate(() => document.querySelector("#view-calendar")?.classList.contains("active-view"));
      assert.equal(onCalendar2, false);
      pass("Testers shows Render gate message (not Calendar, not stuck loading)");
      await browser2.close();
    } finally {
      child2.kill("SIGTERM");
      fs.rmSync(store2, { force: true });
    }

    console.log(`\nAdmin workspace tests passed (${passed}).`);
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(storePath, { force: true });
  }
}

main();
