#!/usr/bin/env node
/**
 * Final real-browser admin audit — fake/local data only.
 * Run: npm run test:admin-final-browser-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const {
  PERSONAS,
  seedSession,
  waitBootReady,
  clickSidebarNav,
  dismissFreePlanNudgeIfPresent,
  evaluateShell,
  assertSingleView,
} = require("./test-helpers/llh-browser-nav");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const REPORT_PATH = "/opt/cursor/artifacts/admin-final-browser-audit.json";

const ADMIN_SECTIONS = [
  { group: "admin-home", label: "Admin Home" },
  { group: "users", label: "Users", expect: ".admin-users-table" },
  { group: "billing", label: "Billing" },
  { group: "content", label: "Content" },
  { group: "messages", label: "Messages", expect: "#adminInboxApp" },
  { group: "website", label: "Website" },
  { group: "ai", label: "AI Tools" },
  { group: "system-health", label: "System Health", expect: ".admin-health-card" },
  { group: "advanced", label: "Advanced" },
  { group: "alerts", label: "Alerts", alerts: true },
];

const findings = [];

function record(name, ok, detail = "") {
  findings.push({ name, ok, detail });
  if (ok) console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else {
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

function requestJson(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1", port, path: urlPath, method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers }
        : { ...headers },
      timeout: 30000,
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-admin-final-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 19960 + Math.floor(Math.random() * 30);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {},
    supportTickets: [],
    bugReports: [],
    featureRequests: [],
    feedbackItems: [],
    promoCodes: [],
    promoRedemptions: [],
    adminSessions: {},
    adminInboxArchive: [],
    siteContent: { curriculumLibrary: { lessonPlans: [], activities: [], resources: [] } },
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
      ADMIN_EMAIL: "admin-final@test.local",
      ADMIN_PASSWORD: "admin-final-pass",
      ADMIN_ACCESS_CODE: "admin-final-code",
      PROMO_FREE_TRIAL_CODE: "TRY1MONTH",
      PROMO_FREE_TRIAL_DAYS: "30",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { child, port, tmpDir, storePath };
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

async function adminToken(port) {
  const login = await requestJson(port, "POST", "/api/admin/login", {
    email: "admin-final@test.local",
    password: "admin-final-pass",
    code: "admin-final-code",
  });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  return login.json.token;
}

async function seedInboxFixtures(port) {
  await requestJson(port, "POST", "/api/bug-report", {
    email: "regression-probe@test.local",
    name: "Probe Bot",
    title: "[PROBE] Calendar smoke ticket",
    description: "Regression probe — safe to archive in admin audit.",
    category: "Calendar",
  });
  await requestJson(port, "POST", "/api/support-ticket", {
    email: "real-parent@example.com",
    name: "Real Parent",
    topic: "Billing question",
    message: "Please confirm my subscription renewal date.",
  });
}

async function unlockAdmin(page, baseUrl) {
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitBootReady(page);
  await page.evaluate(() => {
    localStorage.removeItem("llhAdminUnlocked");
    localStorage.removeItem("llhAdminSession");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitBootReady(page);
  await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
  await page.fill('input[name="adminEmail"]', "admin-final@test.local");
  await page.fill('input[name="adminPassword"]', "admin-final-pass");
  await page.fill('input[name="adminCode"]', "admin-final-code");
  await page.click('#adminUnlockForm button[type="submit"]');
  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
  await page.waitForSelector(".admin-sidebar-btn", { timeout: 20000 });
}

async function clickAdminSection(page, section) {
  if (section.alerts) {
    await page.locator("[data-admin-open-notifications]").click();
    await page.getByRole("heading", { name: "Owner alerts inbox" }).waitFor({ state: "visible", timeout: 20000 });
    return;
  }
  await page.locator(`[data-admin-group="${section.group}"]`).click();
  if (section.expect) await page.waitForSelector(section.expect, { state: "visible", timeout: 20000 });
  else await page.waitForSelector("#adminWorkspaceLandingApp", { state: "visible", timeout: 20000 });
  await page.waitForTimeout(250);
}

async function countVisibleAdminPanels(page) {
  return page.evaluate(() => {
    const panels = [
      ".admin-workspace-landing-panel",
      ".admin-content-manager-panel",
      ".admin-layout",
      ".admin-owner-panel",
      ".admin-analytics-panel",
      ".admin-users-panel",
      ".admin-inbox-panel",
      ".admin-messages-panel",
      ".admin-notifications-panel",
    ];
    return panels.filter((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && el.offsetParent !== null;
    }).length;
  });
}

async function publicChromeHidden(page) {
  return page.evaluate(() => {
    const topbar = document.querySelector(".topbar");
    const publicNav = document.querySelector(".llh-public-nav");
    const getStarted = [...document.querySelectorAll("a,button")].some((el) => /get started/i.test(el.textContent || "") && el.offsetParent !== null && !el.closest("#view-admin"));
    const topbarHidden = !topbar || getComputedStyle(topbar).display === "none";
    const navHidden = !publicNav || getComputedStyle(publicNav).display === "none";
    return topbarHidden && navHidden && !getStarted;
  });
}

async function runAdminAudit(page, baseUrl) {
  await unlockAdmin(page, baseUrl);
  record("admin-unlock", true);

  const chromeHidden = await publicChromeHidden(page);
  record("public-header-hidden", chromeHidden);

  for (const section of ADMIN_SECTIONS) {
    await clickAdminSection(page, section);
    const visiblePanels = await countVisibleAdminPanels(page);
    const chromeOk = await publicChromeHidden(page);
    record(`sidebar-${section.label}`, visiblePanels <= 2 && chromeOk, `visiblePanels=${visiblePanels}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-final-${section.group}.png`), fullPage: true });
  }

  // Alerts dedicated check
  await clickAdminSection(page, { alerts: true, label: "Alerts" });
  const alertsHeading = await page.getByRole("heading", { name: "Owner alerts inbox" }).isVisible();
  record("alerts-opens", alertsHeading);

  // Inbox filters + archive
  await page.locator('[data-admin-group="messages"]').click();
  await page.waitForSelector("#adminInboxApp", { state: "visible", timeout: 20000 });
  await page.waitForFunction(
    () => !document.querySelector("#adminInboxApp")?.textContent?.includes("Loading admin inbox"),
    null,
    { timeout: 25000 },
  );
  await page.locator('[data-inbox-kind="test-internal"]').click();
  await page.waitForTimeout(400);
  const probeVisible = await page.locator("text=[PROBE]").first().isVisible().catch(() => false);
  record("inbox-test-filter", probeVisible);

  page.once("dialog", (dialog) => dialog.accept());
  const archiveBtn = page.locator("[data-inbox-archive]").first();
  if (await archiveBtn.count()) {
    await archiveBtn.click();
    await page.waitForTimeout(600);
    const stillVisible = await page.locator("text=[PROBE]").count();
    record("inbox-archive-confirm", stillVisible === 0, `remaining=${stillVisible}`);
  } else {
    record("inbox-archive-confirm", false, "no archive button");
  }

  // Promo duplicate TRY1MONTH — client + server guard
  await page.locator('[data-admin-group="website"]').click();
  await page.locator('[data-admin-landing-tab="promo-codes"]').click();
  await page.waitForSelector("#adminPromoCodeForm", { timeout: 20000 });
  await page.fill('#adminPromoCodeForm input[name="code"]', "TRY1MONTH");
  await page.fill('#adminPromoCodeForm input[name="trialDays"]', "30");
  await page.fill('#adminPromoCodeForm input[name="label"]', "Duplicate attempt");
  await page.locator("#adminPromoCodeForm button[type='submit']").click();
  await page.waitForFunction(
    () => /environment promo|duplicate|already exists/i.test(document.querySelector("#adminPromoCodesApp")?.textContent || ""),
    null,
    { timeout: 8000 },
  );
  const promoError = await page.evaluate(() => document.querySelector("#adminPromoCodesApp")?.textContent || "");
  record("promo-rejects-try1month", /environment promo|duplicate/i.test(promoError));

  // System Health — no false Working on failed checks
  await page.locator('[data-admin-group="system-health"]').click();
  await page.waitForSelector(".admin-health-card", { state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () => !document.querySelector("[data-admin-async='loading']"),
    null,
    { timeout: 45000 },
  );
  const health = await page.evaluate(() => [...document.querySelectorAll(".admin-health-card")].map((card) => ({
    name: card.querySelector(".eyebrow")?.textContent?.trim() || "",
    status: card.getAttribute("data-status"),
    label: card.querySelector("h4")?.textContent?.trim() || "",
    detail: card.querySelector(".muted-copy")?.textContent?.trim() || "",
  })));
  const falseWorking = health.filter((c) => (
    c.status === "working"
    && /not checked|was not checked|could not reach|unavailable/i.test(c.detail)
  ));
  record("system-health-no-false-working", falseWorking.length === 0, falseWorking.map((c) => c.name).join(", ") || `${health.length} cards`);
  const hasWebsite = health.some((c) => /website/i.test(c.name) && c.status === "working");
  const stripeNotFalseWorking = health.filter((c) => /stripe/i.test(c.name)).every((c) => c.status !== "working" || /verified|HTTP|configured/i.test(c.detail));
  record("system-health-stripe-not-mislabeled", stripeNotFalseWorking);
  record("system-health-website-checked", hasWebsite);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-final-system-health.png"), fullPage: true });

  // Exit Admin (while still unlocked)
  await page.locator('.admin-sidebar-footer [data-view="home"]').click();
  await page.waitForSelector("#view-calendar.active-view, #view-home.active-view", { timeout: 15000 });
  const exited = await page.evaluate(() => !document.querySelector("#view-admin")?.classList.contains("active-view"));
  record("exit-admin", exited);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-final-exit-admin.png"), fullPage: true });

  // Lock Admin — return to admin, unlock again, then lock
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await waitBootReady(page);
  const needsUnlock = await page.evaluate(() => !localStorage.getItem("llhAdminUnlocked"));
  if (needsUnlock) {
    await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
    await page.fill('input[name="adminEmail"]', "admin-final@test.local");
    await page.fill('input[name="adminPassword"]', "admin-final-pass");
    await page.fill('input[name="adminCode"]', "admin-final-code");
    await page.click('#adminUnlockForm button[type="submit"]');
    await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
  }
  await page.locator("[data-admin-lock]").click();
  await page.waitForSelector("#adminLockPanel:not([hidden])", { timeout: 15000 });
  const locked = await page.evaluate(() => Boolean(document.querySelector("#adminLockPanel") && !document.querySelector("#adminLockPanel").hidden));
  record("lock-admin", locked);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-final-lock-admin.png"), fullPage: true });
}

async function runPersonaNav(page, baseUrl, personaKey) {
  const persona = PERSONAS[personaKey];
  assert.ok(persona, personaKey);
  await seedSession(page, persona);
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitBootReady(page);
  await dismissFreePlanNudgeIfPresent(page);
  await clickSidebarNav(page, "calendar");
  let shell = await evaluateShell(page);
  assertSingleView(shell, `${personaKey}-calendar`);
  await clickSidebarNav(page, "lessons");
  shell = await evaluateShell(page);
  assertSingleView(shell, `${personaKey}-lessons`);
  await clickSidebarNav(page, "settings");
  shell = await evaluateShell(page);
  assertSingleView(shell, `${personaKey}-settings`);
  record(`persona-nav-${personaKey}`, true);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-final-persona-${personaKey}.png`), fullPage: true });
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { child, port, tmpDir } = startServer();
  const browser = await chromium.launch({ headless: true });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForBoot(port, child);
    await seedInboxFixtures(port);
    const token = await adminToken(port);
    const promoBefore = await requestJson(port, "GET", `/api/admin/promo-codes?adminToken=${token}`);
    const try1Count = (promoBefore.json.promoCodes || []).filter((p) => p.code === "TRY1MONTH").length;
    record("promo-try1month-unchanged-before-audit", try1Count >= 1, `stored=${try1Count}`);

    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await runAdminAudit(page, baseUrl);
    await page.close();

    for (const key of ["free", "trial", "founding", "pro"]) {
      const personaPage = await browser.newPage({ viewport: { width: 1366, height: 900 } });
      try {
        await runPersonaNav(personaPage, baseUrl, key);
      } catch (error) {
        record(`persona-nav-${key}`, false, error.message);
      }
      await personaPage.close();
    }

    const promoAfter = await requestJson(port, "GET", `/api/admin/promo-codes?adminToken=${token}`);
    const try1After = (promoAfter.json.promoCodes || []).filter((p) => p.code === "TRY1MONTH").length;
    record("promo-try1month-unchanged-after-audit", try1After === try1Count, `before=${try1Count} after=${try1After}`);
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify({ findings, at: new Date().toISOString() }, null, 2));
  const failed = findings.filter((f) => !f.ok);
  if (failed.length) {
    console.error(`\n${failed.length} failure(s). Report: ${REPORT_PATH}`);
  } else {
    console.log(`\nAll admin final browser checks passed. Report: ${REPORT_PATH}`);
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
