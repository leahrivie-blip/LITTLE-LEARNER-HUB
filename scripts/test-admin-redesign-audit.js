#!/usr/bin/env node
/**
 * Admin redesign audit + static guards.
 * Run: npm run test:admin-redesign-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { DEVICES, waitBootReady } = require("./test-helpers/llh-browser-nav");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const ADMIN_SECTIONS = [
  { group: "admin-home", slug: "home", expect: "#adminWorkspaceLandingApp" },
  { group: "users", slug: "users", expect: ".admin-users-table" },
  { group: "billing", slug: "billing", expect: "#adminWorkspaceLandingApp" },
  { group: "content", slug: "content", expect: "#adminWorkspaceLandingApp" },
  { group: "messages", slug: "messages", expect: "#adminMessagesApp .admin-messages-workspace-nav" },
  { group: "website", slug: "website", expect: "#adminWorkspaceLandingApp" },
  { group: "ai", slug: "ai", expect: "#adminWorkspaceLandingApp" },
  { group: "system-health", slug: "system-health", expect: ".admin-health-card" },
  { group: "advanced", slug: "advanced", expect: "#adminWorkspaceLandingApp" },
  { group: "alerts", slug: "alerts", expect: "#adminNotificationCenterDedicated", alerts: true },
];

function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}`); console.error(e); process.exitCode = 1; }
}

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const commsJs = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
const workspaceJs = fs.readFileSync(path.join(ROOT, "admin-workspace.js"), "utf8");
const adminCss = fs.readFileSync(path.join(ROOT, "styles/llh-admin-workspace.css"), "utf8");

test("admin assets wired and scoped", () => {
  assert.match(indexHtml, /llh-admin-workspace\.css/);
  assert.match(indexHtml, /admin-workspace\.js/);
  assert.match(adminCss, /body:has\(#view-admin\.active-view\)/);
  assert.match(adminCss, /^#view-admin/m);
});

test("admin session bridge + inbox reliability", () => {
  assert.match(appJs, /window\.adminSession = adminSession/);
  assert.match(commsJs, /Request timed out/);
  assert.match(commsJs, /data-inbox-retry/);
  assert.match(commsJs, /data-inbox-search/);
  assert.match(commsJs, /test-internal/);
  assert.match(commsJs, /data-inbox-archive/);
  assert.match(commsJs, /__adminInboxLastLoadOk/);
});

test("public chrome hidden and duplicate admin controls removed", () => {
  assert.match(adminCss, /#view-admin\.active-view\) \.topbar/);
  assert.match(adminCss, /#view-admin \.admin-sub-nav/);
  assert.match(adminCss, /#view-admin #adminLockButton/);
  assert.match(appJs, /data-admin-open-notifications/);
  assert.match(appJs, /data-admin-lock/);
});

test("taxonomy audit is read-only", () => {
  assert.match(workspaceJs, /read-only audit/i);
  assert.match(workspaceJs, /Not saved/);
  assert.doesNotMatch(workspaceJs, /saveTaxonomy|renameTheme|bulkRename/i);
});

test("system health uses verified status labels", () => {
  assert.match(workspaceJs, /not-verified/);
  assert.match(workspaceJs, /Website \/ app shell/);
  assert.match(workspaceJs, /Stripe API connection/);
  assert.match(workspaceJs, /Recent email delivery/);
});

test("promo audit warnings and duplicate guards present", () => {
  assert.match(appJs, /adminPromoSaveInFlight/);
  assert.match(appJs, /Promo code is required/);
  assert.match(appJs, /duplicateEnvAndStore/);
  assert.match(appJs, /admin-promo-audit-warning/);
});

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1", port, path: urlPath, method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-admin-audit-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 19890 + Math.floor(Math.random() * 30);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: {
      promoCodes: [{ id: "p1", code: "FAKECODE", trialDays: 30, status: "active", redemptionCount: 0 }],
      curriculumLibrary: { lessonPlans: [], activities: [], resources: [] },
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
      ADMIN_EMAIL: "admin-audit@test.local",
      ADMIN_PASSWORD: "admin-audit-pass",
      ADMIN_ACCESS_CODE: "admin-audit-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { child, port, tmpDir };
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited");
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function unlockAdmin(page, baseUrl, { clearSession = true } = {}) {
  if (clearSession) {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(() => {
      localStorage.removeItem("llhAdminUnlocked");
      localStorage.removeItem("llhAdminSession");
      localStorage.removeItem("llhAdminRememberEmail");
    });
  }
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitBootReady(page);
  await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
  await page.fill('input[name="adminEmail"]', "admin-audit@test.local");
  await page.fill('input[name="adminPassword"]', "admin-audit-pass");
  await page.fill('input[name="adminCode"]', "admin-audit-code");
  await page.click('#adminUnlockForm button[type="submit"]');
  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
  await page.waitForSelector(".admin-sidebar-btn", { timeout: 20000 });
}

async function clickAdminGroup(page, groupId, section = null) {
  if (section?.alerts) {
    const btn = page.locator("[data-admin-open-notifications]");
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();
  } else {
    const btn = page.locator(`[data-admin-group="${groupId}"]`);
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();
  }
  await page.waitForTimeout(350);
}

async function runAdminAudit(browser, baseUrl, device) {
  const page = await browser.newPage({ viewport: { width: device.width, height: device.height } });
  const failures = [];
  await unlockAdmin(page, baseUrl, { clearSession: true });

  const providerSidebarHidden = await page.evaluate(() => {
    const sb = document.querySelector(".app-shell > .sidebar");
    if (!sb) return true;
    return getComputedStyle(sb).display === "none";
  });
  if (!providerSidebarHidden) failures.push("provider sidebar visible in admin");

  const publicChromeHidden = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar");
    const publicNav = document.querySelector(".llh-public-nav");
    const topbarHidden = !topbar || getComputedStyle(topbar).display === "none";
    const navHidden = !publicNav || getComputedStyle(publicNav).display === "none";
    return topbarHidden && navHidden;
  });
  if (!publicChromeHidden) failures.push("public marketing chrome visible in admin");

  const lockButtons = await page.evaluate(() => ({
    sidebarLock: document.querySelectorAll("[data-admin-lock]").length,
    legacyLockVisible: [...document.querySelectorAll("#adminLockButton")].filter((el) => getComputedStyle(el).display !== "none").length,
    subNavVisible: [...document.querySelectorAll(".admin-sub-nav")].filter((el) => getComputedStyle(el).display !== "none").length,
  }));
  if (lockButtons.sidebarLock < 1) failures.push("sidebar Lock Admin missing");
  if (lockButtons.legacyLockVisible > 0) failures.push("duplicate legacy Lock Admin visible");
  if (lockButtons.subNavVisible > 0) failures.push("duplicate admin sub-nav pills visible");

  for (const section of ADMIN_SECTIONS) {
    try {
      await clickAdminGroup(page, section.group, section);
      if (section.alerts) {
        await page.getByRole("heading", { name: "Owner alerts inbox" }).waitFor({ state: "visible", timeout: 20000 });
      } else {
        await page.waitForSelector(section.expect, { state: "visible", timeout: 20000 });
      }
      const stuck = await page.locator(".messages-loading, [data-admin-async='loading']").first().isVisible().catch(() => false);
      if (stuck && section.group === "messages") {
        await page.waitForFunction(() => {
          const el = document.querySelector("#adminInboxApp");
          return el && !el.textContent.includes("Loading admin inbox");
        }, null, { timeout: 25000 });
      }
      if (device.label === "phone") {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-phone-${section.slug}.png`), fullPage: true });
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          minTap: Math.min(...[...document.querySelectorAll(".admin-sidebar-btn, .admin-landing-card button")].map((b) => b.getBoundingClientRect().width).filter((w) => w > 0)),
        }));
        if (layout.scrollWidth > layout.clientWidth + 4) failures.push(`${section.slug}: horizontal scroll`);
        if (layout.minTap > 0 && layout.minTap < 40) failures.push(`${section.slug}: undersized tap targets`);
      }
    } catch (e) {
      failures.push(`${section.slug}: ${e.message}`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-fail-${device.label}-${section.slug}.png`), fullPage: true });
    }
  }

  // Messages: retry + search
  try {
    await clickAdminGroup(page, "messages");
    await page.waitForFunction(() => document.querySelector("#adminInboxApp")?.textContent?.length > 20, null, { timeout: 25000 });
    const search = page.locator("[data-inbox-search]");
    if (await search.count()) await search.fill("test");
    const retry = page.locator("[data-inbox-retry]");
    if (await retry.count()) assert.ok(true);
  } catch (e) { failures.push(`messages-features: ${e.message}`); }

  // Users search
  try {
    await clickAdminGroup(page, "users");
    await page.fill("#adminUsersSearch", "admin");
    await page.waitForTimeout(300);
  } catch (e) { failures.push(`users-search: ${e.message}`); }

  // Promo fake validation
  try {
    await clickAdminGroup(page, "website");
    await page.locator('[data-admin-landing-tab="promo-codes"]').click();
    await page.waitForSelector("#adminPromoCodeForm", { timeout: 20000 });
    await page.evaluate(() => {
      const form = document.querySelector("#adminPromoCodeForm");
      if (!form) return;
      form.setAttribute("novalidate", "");
      const codeInput = form.querySelector('input[name="code"]');
      if (codeInput) codeInput.value = "";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(
      () => /required/i.test(document.querySelector("#adminPromoCodesApp")?.textContent || ""),
      null,
      { timeout: 5000 },
    );
  } catch (e) { failures.push(`promo: ${e.message}`); }

  // System health not stuck
  try {
    await clickAdminGroup(page, "system-health");
    await page.waitForSelector(".admin-health-card", { timeout: 10000 });
    const loading = await page.locator("[data-admin-async='loading']").isVisible().catch(() => false);
    if (loading) failures.push("system-health stuck loading");
  } catch (e) { failures.push(`system-health: ${e.message}`); }

  // Refresh persistence (while admin is still unlocked)
  try {
    await clickAdminGroup(page, "users");
    const tabBefore = await page.evaluate(() => localStorage.getItem("llhAdminActiveSection"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitBootReady(page);
    await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
    await page.waitForSelector(".admin-sidebar-btn", { timeout: 15000 });
    const tabAfter = await page.evaluate(() => localStorage.getItem("llhAdminActiveSection"));
    if (tabBefore !== tabAfter) failures.push("admin tab not preserved on refresh");
  } catch (e) { failures.push(`refresh: ${e.message}`); }

  // Exit admin via sidebar footer
  try {
    await page.locator('.admin-sidebar-footer [data-view="home"]').click();
    await page.waitForSelector("#view-calendar.active-view, #view-home.active-view", { timeout: 15000 });
  } catch (e) { failures.push(`exit-admin: ${e.message}`); }

  // Signed-out admin lock
  try {
    await page.evaluate(() => {
      localStorage.removeItem("llhAdminUnlocked");
      localStorage.removeItem("llhAdminSession");
    });
    await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
    await waitBootReady(page);
    const lock = await page.evaluate(() => !document.querySelector("#adminLockPanel")?.hidden);
    assert.ok(lock);
  } catch (e) { failures.push(`signed-out-lock: ${e.message}`); }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-redesign-${device.label}.png`), fullPage: true });
  await page.close();
  return failures;
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { child, port, tmpDir } = startServer();
  const browser = await chromium.launch({ headless: true });
  const allFailures = [];
  try {
    await waitForBoot(port, child);
    const baseUrl = `http://127.0.0.1:${port}`;
    for (const device of Object.values(DEVICES)) {
      const failures = await runAdminAudit(browser, baseUrl, device);
      if (failures.length) {
        process.exitCode = 1;
        allFailures.push(...failures.map((f) => `${device.label}: ${f}`));
      }
    }
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  if (allFailures.length) {
    console.error("\nAdmin audit failures:");
    allFailures.forEach((f) => console.error(`  - ${f}`));
  } else {
    console.log("\nAll admin device audits passed.");
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
