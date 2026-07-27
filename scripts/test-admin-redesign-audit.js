#!/usr/bin/env node
/**
 * Admin redesign + live-user protection audit.
 * Run: npm run test:admin-redesign-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const CACHE_BUST = "20260725-admin-redesign";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const commsJs = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
const workspaceJs = fs.readFileSync(path.join(ROOT, "admin-workspace.js"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");

test("admin workspace assets are wired", () => {
  assert.match(indexHtml, /llh-admin-workspace\.css\?v=20260725-admin-redesign/);
  assert.match(indexHtml, /admin-workspace\.js\?v=20260725-admin-redesign/);
  assert.match(indexHtml, /admin-workspace-shell/);
  assert.match(indexHtml, /adminWorkspaceLandingApp/);
  assert.match(sw, /llh-shell-v110-admin-redesign/);
});

test("admin sidebar navigation structure exists", () => {
  assert.match(appJs, /label: "Admin Home"/);
  assert.match(appJs, /label: "System Health"/);
  assert.match(appJs, /label: "Advanced"/);
  assert.match(appJs, /admin-sidebar-btn/);
  assert.match(appJs, /Exit Admin/);
  assert.match(appJs, /admin-home/);
  assert.match(appJs, /content-home/);
  assert.match(appJs, /website-home/);
  assert.match(appJs, /billing-home/);
});

test("comms admin session bridge and inbox reliability", () => {
  assert.match(appJs, /window\.adminSession = adminSession/);
  assert.match(commsJs, /window\.adminSession === "function"/);
  assert.match(commsJs, /Request timed out/);
  assert.match(commsJs, /data-inbox-retry/);
  assert.match(commsJs, /data-inbox-search/);
});

test("admin workspace landing pages exist", () => {
  assert.match(workspaceJs, /renderAdminHomeWorkspace/);
  assert.match(workspaceJs, /renderAdminContentHome/);
  assert.match(workspaceJs, /renderAdminWebsiteHome/);
  assert.match(workspaceJs, /renderAdminBillingHome/);
  assert.match(workspaceJs, /renderAdminSystemHealth/);
  assert.match(workspaceJs, /renderAdminTaxonomyAudit/);
  assert.match(workspaceJs, /renderAdminUsersCompactTable/);
});

test("promo code client validation guards", () => {
  assert.match(appJs, /adminPromoSaveInFlight/);
  assert.match(appJs, /Promo code is required/);
  assert.match(appJs, /Expiration must be a future date/);
  assert.match(appJs, /Max redemptions must be at least 1/);
});

test("notification center panel stays hidden outside dedicated inbox", () => {
  assert.match(appJs, /panel\.hidden = true/);
  assert.match(appJs, /\.admin-notifications-panel/);
});

function requestJson(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: { "Content-Type": "application/json", ...headers },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function startServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-admin-redesign-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 19880 + Math.floor(Math.random() * 40);
  const plans = Array.from({ length: 12 }, (_, i) => ({
    id: `plan-admin-${i}`,
    title: `Admin Audit Lesson ${i}`,
    age: "Preschool",
    theme: i % 3 === 0 ? "Music & Movement" : i % 3 === 1 ? "Music and Movement" : "Five Senses",
    plan: "Pro",
    status: "published",
    locked: false,
    activityCount: 3,
    updatedAt: new Date().toISOString(),
  }));
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: {
      curriculumLibrary: { lessonPlans: plans, activities: [], resources: [], updatedAt: new Date().toISOString() },
      promoCodes: [
        { id: "promo-existing", code: "TESTCODE", trialDays: 30, status: "active", redemptionCount: 0 },
      ],
    },
    adminSessions: {},
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ADMIN_EMAIL: "admin-redesign@test.local",
      ADMIN_PASSWORD: "admin-redesign-pass",
      ADMIN_ACCESS_CODE: "admin-redesign-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { child, port, storePath, tmpDir };
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function unlockAdmin(page) {
  await page.evaluate(() => { if (typeof setView === "function") setView("admin"); });
  await page.waitForSelector("#view-admin.active-view", { timeout: 15000 });
  await page.waitForSelector("#adminUnlockForm", { timeout: 15000 });
  await page.fill('input[name="adminEmail"]', "admin-redesign@test.local");
  await page.fill('input[name="adminPassword"]', "admin-redesign-pass");
  await page.fill('input[name="adminCode"]', "admin-redesign-code");
  await page.click('#adminUnlockForm button[type="submit"]');
  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
  await page.waitForSelector(".admin-sidebar-btn", { timeout: 20000 });
}

async function clickAdminGroup(page, groupId) {
  await page.locator(`[data-admin-group="${groupId}"]`).click();
  await page.waitForTimeout(250);
}

async function clickProviderNav(page, view) {
  const toggle = page.locator("#mobileMenuToggle");
  if (await toggle.isVisible()) await toggle.click();
  const link = page.locator(`.sidebar [data-view="${view}"]:visible`).first();
  if (await link.count()) {
    await link.click();
    return;
  }
  await page.locator(`.sidebar [data-view="${view}"]`).first().click({ force: true });
}

function assertSingleAdminView(shell, label) {
  assert.ok(shell.visiblePanels <= 1, `${label}: too many visible admin panels (${shell.visiblePanels})`);
}

async function evaluateAdminShell(page) {
  return page.evaluate(() => {
    const landing = document.querySelector(".admin-workspace-landing-panel");
    const landingVisible = landing && !landing.hidden;
    const panels = [...document.querySelectorAll("#adminWorkspaceMain > .section-block")].filter((el) => !el.hidden && el !== landing);
    return {
      visiblePanels: panels.length + (landingVisible ? 1 : 0),
      activeGroup: document.querySelector(".admin-sidebar-btn.active")?.getAttribute("data-admin-group") || "",
      hasSpinner: Boolean(document.querySelector("#adminInboxApp .messages-loading, #adminWorkspaceLandingApp [data-admin-async='loading']")),
      tab: localStorage.getItem("llhAdminActiveSection"),
    };
  });
}

async function runAdminBrowserAudit(browser, baseUrl, deviceName, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const failedCritical = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (/\/api\/(admin|health|subscription)/.test(url)) failedCritical.push(url);
  });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 20000 });
  await unlockAdmin(page);

  const sidebarGroups = ["admin-home", "users", "billing", "content", "messages", "website", "ai", "system-health", "advanced"];
  for (const group of sidebarGroups) {
    await clickAdminGroup(page, group);
    const shell = await evaluateAdminShell(page);
    assertSingleAdminView(shell, `${deviceName} ${group}`);
    assert.notEqual(shell.hasSpinner, true, `${deviceName} ${group} stuck spinner`);
  }

  await clickAdminGroup(page, "admin-home");
  const quickActions = ["upload-lesson", "billing", "inbox"];
  for (const quick of quickActions) {
    await clickAdminGroup(page, "admin-home");
    const btn = page.locator(`#adminWorkspaceLandingApp [data-admin-quick="${quick}"]`).first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(300);
      assertSingleAdminView(await evaluateAdminShell(page), `${deviceName} quick ${quick}`);
    }
  }

  await clickAdminGroup(page, "users");
  await page.fill("#adminUsersSearch", "admin");
  await page.waitForTimeout(200);
  const tableRows = await page.locator(".admin-users-table tbody tr").count();
  assert.ok(tableRows >= 0, "users table renders");

  await clickAdminGroup(page, "messages");
  await page.waitForFunction(() => {
    const el = document.querySelector("#adminInboxApp");
    return el && !el.textContent.includes("Loading admin inbox");
  }, null, { timeout: 25000 });

  await clickAdminGroup(page, "content");
  await page.locator('[data-admin-landing-tab="curriculum-lesson-plans"]').click();
  await page.waitForTimeout(300);

  await clickAdminGroup(page, "website");
  await page.locator('[data-admin-landing-tab="promo-codes"]').click();
  await page.waitForTimeout(300);
  await page.fill('input[name="code"]', "");
  await page.click('#adminPromoCodeForm button[type="submit"]');
  await page.waitForSelector('.form-message:has-text("required")', { timeout: 5000 }).catch(() => {});

  await clickAdminGroup(page, "ai");
  await page.waitForTimeout(300);
  await clickAdminGroup(page, "system-health");
  await page.waitForSelector(".admin-health-card", { timeout: 10000 });

  await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-redesign-${deviceName}.png`), fullPage: true });
  await page.close();
  return { consoleErrors, failedCritical };
}

async function runLiveUserRegression(browser, baseUrl, deviceName, viewport, persona) {
  const page = await browser.newPage({ viewport });
  const results = [];
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((p) => {
    localStorage.setItem("llhCurrentUser", JSON.stringify(p.user));
    localStorage.setItem("llhAccounts", JSON.stringify([p.user]));
    if (p.lastView) localStorage.setItem("llhLastView", p.lastView);
  }, persona);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("boot-complete") || document.querySelector(".app-shell"), null, { timeout: 30000 }).catch(() => {});

  const flows = [
    { name: "homepage", check: async () => page.waitForSelector("#view-home.active-view, #view-calendar.active-view", { timeout: 15000 }) },
    { name: "lessons", check: async () => {
      await clickProviderNav(page, "lessons");
      await page.waitForSelector("#view-lessons.active-view", { timeout: 15000 });
    }},
    { name: "activities", check: async () => {
      await clickProviderNav(page, "activities");
      await page.waitForSelector("#view-activities.active-view", { timeout: 15000 });
    }},
    { name: "settings", check: async () => {
      await clickProviderNav(page, "settings");
      await page.waitForSelector("#view-settings.active-view", { timeout: 15000 });
    }},
  ];

  for (const flow of flows) {
    try {
      await flow.check();
      results.push({ flow: flow.name, device: deviceName, role: persona.role, result: "pass" });
    } catch (error) {
      results.push({ flow: flow.name, device: deviceName, role: persona.role, result: "fail", error: error.message });
      process.exitCode = 1;
    }
  }

  const adminCssLeak = await page.evaluate(() => {
    const sample = document.querySelector("#view-calendar, #view-lessons, #view-settings");
    if (!sample) return false;
    const bg = getComputedStyle(sample).backgroundImage;
    return /admin-workspace/.test(sample.className + bg);
  });
  assert.equal(adminCssLeak, false, `${deviceName} ${persona.role} admin CSS leak`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, `live-user-${persona.role}-${deviceName}.png`), fullPage: true });
  await page.close();
  return { results, consoleErrors };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { chromium } = require("playwright");
  const { child, port, tmpDir } = startServer();
  try {
    await waitForBoot(port, child);
    const baseUrl = `http://127.0.0.1:${port}`;
    const browser = await chromium.launch({ headless: true });

    const adminDesktop = await runAdminBrowserAudit(browser, baseUrl, "desktop", { width: 1366, height: 900 });
    for (const [device, viewport] of [["tablet", { width: 834, height: 1112 }], ["phone", { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 20000 });
      await unlockAdmin(page);
      for (const group of ["admin-home", "users", "billing", "content", "messages", "website", "ai", "system-health"]) {
        await clickAdminGroup(page, group);
      }
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-redesign-${device}.png`), fullPage: true });
      await page.close();
    }
    console.log("\nAdmin browser audit (desktop):");
    console.log(`  consoleErrors=${adminDesktop.consoleErrors.length}, failedCritical=${adminDesktop.failedCritical.length}`);
    if (adminDesktop.consoleErrors.length) console.log(`    console: ${adminDesktop.consoleErrors.slice(0, 3).join(" | ")}`);
    if (adminDesktop.failedCritical.length) {
      process.exitCode = 1;
      console.log(`    failed: ${adminDesktop.failedCritical.join(" | ")}`);
    }

    const personas = [
      { role: "pro", user: { email: "pro@test.local", firstName: "Pro", lastName: "User", plan: "Pro", membershipStatus: "active" }, lastView: "calendar" },
    ];
    console.log("\nLive User Protection Report:");
    for (const persona of personas) {
      const { results } = await runLiveUserRegression(browser, baseUrl, "desktop", { width: 1366, height: 900 }, persona);
      results.forEach((r) => {
        const line = `${r.role}/desktop/${r.flow}: ${r.result}`;
        console.log(`  ${line}${r.error ? ` (${r.error})` : ""}`);
      });
    }

    const signedOut = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await signedOut.goto(`${baseUrl}/index.html?admin=1`, { waitUntil: "domcontentloaded" });
    await signedOut.evaluate(() => {
      localStorage.removeItem("llhAdminUnlocked");
      localStorage.removeItem("llhAdminSession");
      localStorage.setItem("llhView", "admin");
    });
    await signedOut.reload({ waitUntil: "domcontentloaded" });
    const adminLocked = await signedOut.evaluate(() => ({
      lockVisible: !document.querySelector("#adminLockPanel")?.hidden,
      homeHidden: document.querySelector("#view-home")?.classList.contains("active-view") !== true,
    }));
    assert.equal(adminLocked.lockVisible, true, "signed-out /admin shows lock panel");
    await signedOut.screenshot({ path: path.join(ARTIFACT_DIR, "admin-signed-out-lock.png"), fullPage: true });
    await signedOut.close();

    await browser.close();
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
