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

const { resolveTestPort } = require("./test-port.js");
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

async function clickAdminNav(page, view) {
  await page.click(`[data-admin-workspace-nav][data-view="${view}"]`);
  await page.waitForSelector(`#view-${view}.active-view`, { timeout: 20000 });
  const onCalendar = await page.evaluate(() => document.querySelector("#view-calendar")?.classList.contains("active-view"));
  assert.equal(onCalendar, false, `click nav ${view} must not open Calendar`);
}

async function runOwnerColdWalkthrough(port) {
  const storePath = path.join(os.tmpdir(), `llh-aw-walk-${crypto.randomBytes(4).toString("hex")}.json`);
  const child = startServer(port, storePath);
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child, port);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await unlockAdmin(page, baseUrl);
    pass("walkthrough: unlock Admin lands on Admin Home (cold DB)");

    await page.waitForFunction(() => {
      return Boolean(document.querySelector("[data-aw-onboard], [data-tl-onboard-everything]"));
    }, null, { timeout: 45000 });
    await page.click("[data-aw-onboard], [data-tl-onboard-everything]");
    await page.waitForTimeout(2000);
    const homeAfterSetup = await page.locator("#view-admin-home").textContent();
    assert.match(homeAfterSetup, /Working|Ready|lesson plans/i);
    pass("walkthrough: Set Up Testing Site completes from Admin Home");

    await clickAdminNav(page, "admin-testers");
    await page.waitForSelector("[data-tl-pilot-create], [data-tl-onboard-everything]", { timeout: 20000 });
    pass("walkthrough: Testers opens with wizard");

    const testerEmail = `aw.walk.${crypto.randomBytes(3).toString("hex")}@example.invalid`;
    await page.fill("[data-tl-pilot-create] input[name='testerName']", "Walkthrough Tester");
    await page.fill("[data-tl-pilot-create] input[name='email']", testerEmail);
    await page.click("[data-tl-pilot-create] button[type='submit']");
    await page.waitForSelector("[data-tl-pilot-password]", { timeout: 15000 });
    const testerPassword = (await page.locator("[data-tl-pilot-password]").textContent()).trim();
    assert.ok(testerPassword.length > 4);
    pass("walkthrough: created Home Daycare tester and copied one-time password");

    const verifyLogin = await requestJson(port, "POST", "/api/auth/password-login", { email: testerEmail, password: testerPassword });
    assert.equal(verifyLogin.status, 200);
    pass("walkthrough: one-time login verified via auth API");

    await page.evaluate(() => signOut());
    await page.waitForTimeout(400);
    await page.evaluate(() => openAuthModal("login"));
    await page.waitForTimeout(300);
    await page.fill("#emailInput", testerEmail);
    await page.fill("#passwordInput", testerPassword);
    await page.click("#authSubmitButton");
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => currentUser), testerEmail);
    pass("walkthrough: signed in as tester");

    await page.waitForSelector("#pilotProviderNav:not([hidden])", { timeout: 15000 });
    pass("walkthrough: Solo Home Daycare Provider view");

    await page.click("[data-sandbox-switch-role]");
    await page.waitForTimeout(300);
    await page.click('[data-sandbox-role-option="parent_guardian"]');
    await page.waitForTimeout(300);
    if (await page.locator("[data-sandbox-guardian-option]").count()) {
      await page.locator("[data-sandbox-guardian-option]").first().click();
    }
    await page.waitForFunction(() => {
      const el = document.querySelector("#pilotParentNav");
      return el && !el.hidden;
    }, null, { timeout: 15000 });
    pass("walkthrough: switched to Parent view");

    const feedbackText = `Admin workspace walkthrough ${Date.now()}`;
    await page.click("[data-tf-toggle]");
    await page.waitForTimeout(400);
    await page.click('[data-tf-tab="new"]').catch(() => {});
    await page.fill("[data-tf-new-body-input]", feedbackText);
    await page.click('[data-tf-new-form] button[type="submit"]');
    await page.waitForTimeout(800);
    pass("walkthrough: tester submitted Testing Feedback");

    await page.evaluate(() => signOut());
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => isAdminUnlocked()), true);
    await clickAdminNav(page, "admin-feedback");
    await page.waitForTimeout(1200);
    const inbox = await page.locator("#view-admin-feedback").textContent();
    assert.match(inbox, new RegExp(feedbackText.slice(0, 24)));
    pass("walkthrough: Admin sees feedback in inbox");

    await page.close();
    await browser.close();
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(storePath, { force: true });
  }
}

async function main() {
  if (!chromium) {
    console.error("FAIL: playwright required");
    process.exitCode = 1;
    return;
  }

  const port = resolveTestPort(27200, 200);
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

    const navClicks = [
      ["admin-testers", /Home Daycare|External Tester|Testing Site/i],
      ["admin-content", /Content landing|Lesson Plans|Forms & templates/i],
      ["admin-feedback", /Feedback|Testing Feedback/i],
      ["admin-health", /Website|Database|Working|Needs Attention|Checking/i],
      ["admin-advanced", /Advanced tools/i],
    ];
    for (const [view, pattern] of navClicks) {
      await clickAdminNav(page, view);
      if (view === "admin-health") {
        await page.waitForFunction(() => {
          const t = document.querySelector("#view-admin-health")?.textContent || "";
          return /Website|Database|Working|Needs Attention|Checking|Retry|timed out/i.test(t);
        }, null, { timeout: 20000 });
      }
      const text = await page.locator(`#view-${view}`).textContent();
      assert.match(text, pattern, `${view} must show real content`);
      pass(`real click: ${view} opens real screen`);
    }

    await clickAdminNav(page, "admin-home");
    await page.click("[data-aw-preview-role='parent_guardian']");
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      if (typeof window.LLHAdminWorkspace?.exitRolePreviewAndReturnAdmin === "function") {
        return window.LLHAdminWorkspace.exitRolePreviewAndReturnAdmin();
      }
      return setView("admin-home");
    });
    await page.waitForSelector("#view-admin-home.active-view", { timeout: 15000 });
    pass("Preview as User flow returns to Admin Home");

    await clickAdminNav(page, "admin-content");
    await page.click('[data-aw-legacy-admin][data-aw-admin-focus="lessons"]');
    await page.waitForSelector("#view-admin.active-view", { timeout: 15000 });
    await page.waitForSelector("#awLegacyReturnBar", { timeout: 10000 });
    const legacyText = await page.locator("#awLegacyReturnBar").textContent();
    assert.match(legacyText, /Return to Admin Workspace/i);
    pass("Content card opens legacy manager with return banner");
    await page.click("[data-aw-return-workspace-content]");
    await page.waitForSelector("#view-admin-content.active-view", { timeout: 10000 });
    pass("Return to Content landing from legacy manager");

    await clickAdminNav(page, "admin-home");
    pass("Return to Admin Home from nav click");

    const viewports = [
      { name: "phone", width: 390, height: 844 },
      { name: "tablet", width: 820, height: 1180 },
    ];
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const view of ["admin-home", "admin-testers", "admin-content", "admin-health"]) {
        await page.evaluate((v) => setView(v), view);
        await page.waitForSelector(`#view-${view}.active-view`, { timeout: 15000 });
        const onCalendar = await page.evaluate(() => document.querySelector("#view-calendar")?.classList.contains("active-view"));
        assert.equal(onCalendar, false, `${vp.name} ${view} must not open Calendar`);
      }
      pass(`${vp.name}: workspace views render without Calendar redirect`);
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await clickAdminNav(page, "admin-home");
    await page.click('[data-aw-exit-admin]');
    await page.waitForFunction(() => !document.querySelector("#view-admin-home.active-view"), null, { timeout: 15000 });
    pass("Exit Admin leaves workspace");

    await context.close();
    await browser.close();

    await runOwnerColdWalkthrough(resolveTestPort(28000, 100));

    // Missing ALLOW_TESTING_LAB_ADMIN_PREVIEW — separate server instance
    const port2 = resolveTestPort(27400, 100);
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
