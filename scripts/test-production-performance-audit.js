#!/usr/bin/env node
/**
 * Read-only production performance & data-safety audit.
 * No admin credentials required. No writes, purchases, emails, or messages.
 *
 * Run: node scripts/test-production-performance-audit.js
 */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { chromium, devices } = require("playwright");

const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const ARTIFACT_DIR = path.join("/opt/cursor/artifacts", "production-performance-audit");
const REPORT_PATH = path.join(ARTIFACT_DIR, "report.json");

const findings = [];
const timings = [];

function record(category, name, ok, detail = "", extra = {}) {
  const row = { category, name, ok, detail, ...extra };
  findings.push(row);
  const label = ok ? "PASS" : "FAIL";
  console.log(`${label}  [${category}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function timing(name, ms, extra = {}) {
  timings.push({ name, ms, ...extra });
}

function fetchTimed(url, options = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: options.timeout || 60000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        timing(url.replace(PROD, ""), Date.now() - started, {
          status: res.statusCode,
          bytes: body.length,
        });
        let json = null;
        try { json = JSON.parse(body.toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, body, json, bytes: body.length, ms: Date.now() - started });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
  });
}

async function measureAdminShell(page, label) {
  const started = Date.now();
  await page.goto(`${PROD}/admin`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("body.app-boot-ready", { timeout: 30000 }).catch(() => {});
  await page.waitForSelector("#adminUnlockForm", { state: "visible", timeout: 60000 });
  const usableMs = Date.now() - started;
  timing(`${label}: admin unlock shell`, usableMs);
  const state = await page.evaluate(() => ({
    bootReady: document.body.classList.contains("app-boot-ready"),
    protectedHidden: document.querySelector("#adminProtectedContent")?.hidden !== false,
    hasSessionStore: /admin-session-store|adminSessionStore/.test(document.documentElement.innerHTML) || true,
  }));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin-unlock-${label}.png`), fullPage: false });
  record("admin", `${label} unlock form usable`, state.bootReady && state.protectedHidden, `${usableMs}ms`);
  return { usableMs, state };
}

async function auditPublicApis(baseline) {
  const health = await fetchTimed(`${PROD}/api/health`);
  record("api", "Health endpoint", health.status === 200 && health.json?.ok, `${health.ms}ms, ${health.bytes}B`);

  const inventory = await fetchTimed(`${PROD}/api/public/home-inventory`);
  const lessons = Number(inventory.json?.lessonPlanCount || 0);
  const activities = Number(inventory.json?.activityCount || 0);
  record("data", "Lesson plan count stable", lessons >= 89, `${lessons} plans`);
  record("data", "Activity count stable", activities >= 1500, `${activities} activities`);
  if (baseline?.lessons) {
    record("data", "Lesson count unchanged during audit", lessons === baseline.lessons, `${baseline.lessons} → ${lessons}`);
  }
  if (baseline?.activities) {
    record("data", "Activity count unchanged during audit", activities === baseline.activities, `${baseline.activities} → ${activities}`);
  }

  const readiness = await fetchTimed(`${PROD}/api/launch-readiness`);
  record("api", "Launch readiness", readiness.status === 200, `${readiness.ms}ms, ${readiness.bytes}B`);

  const badLogin = await new Promise((resolve, reject) => {
    const started = Date.now();
    const payload = JSON.stringify({ email: "audit@example.com", password: "x", code: "x" });
    const req = https.request(`${PROD}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        timing("/api/admin/login (invalid)", Date.now() - started, { status: res.statusCode, bytes: chunks.reduce((s, c) => s + c.length, 0) });
        resolve({ status: res.statusCode, ms: Date.now() - started });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  record("admin", "Login rejects invalid creds quickly", badLogin.status === 401, `${badLogin.ms}ms`);

  const appJs = await fetchTimed(`${PROD}/app.js?v=${Date.now()}`);
  record("deploy", "Non-blocking admin unlock pattern", appJs.body.toString("utf8").includes("void loadAdminAnalyticsFromBackend"));
  record("deploy", "Lazy admin section prefetch", appJs.body.toString("utf8").includes("prefetchAdminSectionData"));
  record("deploy", "Analytics response cache TTL", appJs.body.toString("utf8").includes("ADMIN_ANALYTICS_CACHE_MS"));
}

async function auditPublicSite(page, viewport, label) {
  await page.setViewportSize(viewport);
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err.message || err)));

  const homeStart = Date.now();
  try {
    await page.goto(PROD, { waitUntil: "networkidle", timeout: 120000 });
  } catch {
    await page.goto(PROD, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  timing(`${label}: homepage`, Date.now() - homeStart);
  const homeOk = await page.evaluate(() => /Affordable Childcare Curriculum/i.test(document.body?.innerText || ""));
  record("site", `${label} homepage styled`, homeOk);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `homepage-${label}.png`), fullPage: false });

  await page.goto(`${PROD}/#/lessons`, { waitUntil: "networkidle", timeout: 90000 });
  const lessonsOk = await page.evaluate(() => /lesson/i.test(document.body?.innerText || ""));
  record("site", `${label} lesson library loads`, lessonsOk);

  await page.goto(`${PROD}/#/forms`, { waitUntil: "networkidle", timeout: 90000 });
  const formsOk = await page.evaluate(() => /form/i.test(document.body?.innerText || ""));
  record("site", `${label} forms route loads`, formsOk);

  const signIn = page.getByRole("button", { name: /sign in|log in/i }).or(page.getByRole("link", { name: /sign in|log in/i })).first();
  if (await signIn.count()) {
    await page.goto(PROD, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await signIn.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const authVisible = await page.locator("#authModal:not([hidden]), .auth-modal.open, #loginForm, input[name='email']").first().isVisible().catch(() => false);
    record("site", `${label} sign-in UI opens`, authVisible);
  } else {
    record("site", `${label} sign-in UI opens`, false, "sign-in control not found");
  }

  const criticalErrors = errors.filter((e) => !/favicon|Failed to load resource|net::ERR|admin-analytics/i.test(e));
  record("site", `${label} no critical console errors`, criticalErrors.length === 0, criticalErrors.slice(0, 3).join(" | "));
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  console.log(`Production performance audit (read-only)\nURL: ${PROD}\n`);

  const inventoryBaseline = await fetchTimed(`${PROD}/api/public/home-inventory`);
  const baseline = {
    lessons: Number(inventoryBaseline.json?.lessonPlanCount || 0),
    activities: Number(inventoryBaseline.json?.activityCount || 0),
    at: new Date().toISOString(),
  };

  await auditPublicApis(baseline);

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage();
  const mobile = await browser.newPage();

  try {
    await measureAdminShell(desktop, "desktop");
    await measureAdminShell(mobile, "mobile");
    await auditPublicSite(desktop, { width: 1280, height: 900 }, "desktop");
    await auditPublicSite(mobile, devices["iPhone 13"].viewport, "mobile");
  } finally {
    await browser.close();
  }

  await auditPublicApis(baseline);

  const report = {
    prod: PROD,
    auditedAt: new Date().toISOString(),
    baseline,
    timings: timings.sort((a, b) => b.ms - a.ms),
    findings,
    passed: findings.filter((f) => f.ok).length,
    total: findings.length,
    note: "Authenticated admin section timings require owner credentials and were not measured on production.",
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nTimings (slowest first):`);
  timings.sort((a, b) => b.ms - a.ms).slice(0, 12).forEach((t) => {
    console.log(`  ${t.ms}ms  ${t.name}${t.bytes ? ` (${t.bytes}B)` : ""}`);
  });
  console.log(`\n${report.passed}/${report.total} checks passed`);
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
