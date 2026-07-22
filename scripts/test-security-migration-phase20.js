#!/usr/bin/env node
"use strict";

/**
 * Phase 20 focused suite — security, migration simulator, release readiness.
 * Fake data only. No production migration. No Stripe/email/SMS/push/live AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const security = require("./phase20-security-data-model.js");
const migration = require("./migration-simulator-data-model.js");
const readiness = require("./release-readiness-data-model.js");
const tlModel = require("./testing-lab-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase20-admin@example.com";
const ADMIN_PASSWORD = "Phase20SecurityMig!99";
const ADMIN_CODE = "phase20-lab-code";
const BASE = "/api/testing-lab";

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function baseStore() {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: true,
        [EXPANSION_FEATURE_KEYS.TESTING_LAB]: true,
      },
    },
  };
}

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-p20-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9700 + Math.floor(Math.random() * 400);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: env.SITE_URL || "http://127.0.0.1",
      LLH_GIT_BRANCH: "cursor/director-family-foundation-bc66",
      LLH_GIT_SHA: "phase20testsha",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: env.ALLOW_TESTING_LAB_ADMIN_PREVIEW === undefined ? "true" : env.ALLOW_TESTING_LAB_ADMIN_PREVIEW,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForHealth(port);
  return { child, port, storePath };
}

async function stopServer(ctx) {
  if (ctx?.child) ctx.child.kill("SIGTERM");
}

async function login(port) {
  const res = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

async function run() {
  security.resetRateLimitForTests();

  {
    assert.equal(security.PHASE, 20);
    assert.match(security.FEATURE_MARKER, /phase20/);
    const sanitized = security.sanitizeErrorForLog({ message: "x", password: "secret", code: "e" });
    assert.equal(sanitized.password, undefined);
    assert.equal(sanitized.noSecrets, true);
    const a = security.checkRateLimit("unit-key", { limit: 2, windowMs: 60_000 });
    assert.equal(a.allowed, true);
    security.checkRateLimit("unit-key", { limit: 2, windowMs: 60_000 });
    const blocked = security.checkRateLimit("unit-key", { limit: 2, windowMs: 60_000 });
    assert.equal(blocked.allowed, false);
    const review = security.buildSecurityReviewSummary();
    assert.equal(review.formalCertification, false);
    assert.ok(review.checklist.length >= 10);
    pass("unit_security_sanitize_rate_checklist");
  }

  {
    const store = { testingLab: { session: { organizationId: "org_aabbccddeeff0011", scenario: "small_center" } }, familyFoundation: { fakeAccounts: {
      a1: { id: "a1", organizationId: "org_aabbccddeeff0011", kind: "owner", email: "owner@example.invalid", role: "owner" },
    } } };
    const insp = migration.inspectFakeOrganization(store, "org_aabbccddeeff0011");
    assert.equal(insp.mutated, false);
    assert.equal(insp.counts.fakeAccounts, 1);
    const preview = migration.buildMigrationPreview(store, "org_aabbccddeeff0011", insp);
    assert.equal(preview.requiresConfirm, true);
    assert.throws(() => migration.applyFakeMigration(store, preview, { confirm: false }), /confirm/i);
    const applied = migration.applyFakeMigration(store, preview, { confirm: true, actorEmail: ADMIN_EMAIL });
    assert.equal(applied.testingOnly, true);
    const rolled = migration.rollbackFakeMigration(store, applied.backupId, { confirm: true, actorEmail: ADMIN_EMAIL });
    assert.equal(rolled.rolledBack, true);
    const report = migration.exportSanitizedReport(insp, preview);
    assert.equal(report.noPasswords, true);
    assert.ok(!JSON.stringify(report).toLowerCase().includes("passwordhash"));
    assert.throws(() => migration.inspectFakeOrganization(store, "prod_live_customer_org"), /fake/i);
    pass("unit_migration_preview_apply_rollback");
  }

  {
    const summary = readiness.buildReleaseReadinessSummary({
      store: { siteContent: { featureFlags: { testingLab: true } }, testingLab: { session: {} }, platformResilience: {}, migrationSimulator: {} },
      env: { DATABASE_PROVIDER: "local-json", DISABLE_STRIPE_CHECKOUT: "true", DISABLE_OUTBOUND_EMAIL: "true", DISABLE_AI_CALLS: "true", SITE_URL: "http://127.0.0.1" },
      branchName: "cursor/director-family-foundation-bc66",
    });
    assert.equal(summary.featureMarker, readiness.FEATURE_MARKER);
    assert.equal(summary.computerRecommended, true);
    assert.equal(summary.killSwitches.stripeCheckout, "disabled");
    const phone = readiness.phoneStatusSummary(summary);
    assert.equal(phone.computerRecommended, true);
    assert.match(phone.featureMarker, /phase20-release-readiness-mobile/);
    pass("unit_release_readiness_phone");
  }

  {
    const prod = await startServer({
      env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true" },
    });
    try {
      const token = await login(prod.port).catch(() => null);
      for (const pathName of [
        `${BASE}/release-readiness`,
        `${BASE}/security-review`,
        `${BASE}/migration/inspect`,
      ]) {
        const res = await request(prod.port, "GET", pathName, { headers: token ? auth(token) : {} });
        assert.equal(res.status, 403, pathName);
      }
      const apply = await request(prod.port, "POST", `${BASE}/migration/apply`, {
        headers: token ? auth(token) : {},
        body: { previewId: "x", confirm: true },
      });
      assert.equal(apply.status, 403);
      pass("production_rejects_readiness_and_migration");
    } finally {
      await stopServer(prod);
    }
  }

  const ctx = await startServer();
  try {
    security.resetRateLimitForTests();
    const token = await login(ctx.port);
    const seed = await request(ctx.port, "POST", `${BASE}/seed`, {
      headers: auth(token),
      body: { scenario: "small_center", reset: true },
    });
    assert.equal(seed.status, 200, JSON.stringify(seed.body));
    assert.ok(tlModel.isFakeOrganizationId(seed.body.organizationId));
    pass("seed_fake_org");

    const sec = await request(ctx.port, "GET", `${BASE}/security-review`, { headers: auth(token) });
    assert.equal(sec.status, 200);
    assert.equal(sec.body.formalCertification, false);
    assert.ok(sec.body.remainingProfessionalReview.length >= 3);
    pass("security_review_endpoint");

    const ready = await request(ctx.port, "GET", `${BASE}/release-readiness`, { headers: auth(token) });
    assert.equal(ready.status, 200, JSON.stringify(ready.body));
    assert.equal(ready.body.featureMarker, readiness.FEATURE_MARKER);
    assert.equal(ready.body.identity.branchName, "cursor/director-family-foundation-bc66");
    assert.equal(ready.body.killSwitches.stripeCheckout, "disabled");
    assert.equal(ready.body.productionLock.testingLabRejectedOnProduction, true);
    assert.ok(ready.body.phoneSummary.computerRecommended);
    pass("release_readiness_endpoint");

    const inspect = await request(ctx.port, "GET", `${BASE}/migration/inspect`, { headers: auth(token) });
    assert.equal(inspect.status, 200, JSON.stringify(inspect.body));
    assert.equal(inspect.body.mutated, false);
    assert.ok(inspect.body.counts.fakeAccounts >= 1);
    pass("migration_inspect");

    const preview = await request(ctx.port, "POST", `${BASE}/migration/preview`, { headers: auth(token), body: {} });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.requiresConfirm, true);
    assert.ok(preview.body.report.noSecrets);
    const noConfirm = await request(ctx.port, "POST", `${BASE}/migration/apply`, {
      headers: auth(token),
      body: { previewId: preview.body.preview.id, confirm: false },
    });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.code, "confirmation_required");
    const apply = await request(ctx.port, "POST", `${BASE}/migration/apply`, {
      headers: auth(token),
      body: { previewId: preview.body.preview.id, confirm: true },
    });
    assert.equal(apply.status, 200, JSON.stringify(apply.body));
    assert.equal(apply.body.testingOnly, true);
    const history = await request(ctx.port, "GET", `${BASE}/migration/history`, { headers: auth(token) });
    assert.equal(history.status, 200);
    assert.ok((history.body.items || []).length >= 1);
    const rollback = await request(ctx.port, "POST", `${BASE}/migration/rollback`, {
      headers: auth(token),
      body: { backupId: apply.body.backupId, confirm: true },
    });
    assert.equal(rollback.status, 200);
    assert.equal(rollback.body.rolledBack, true);
    pass("migration_preview_confirm_history_rollback");

    {
      const ui = fs.readFileSync(path.join(ROOT, "testing-lab-ui.js"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
      assert.match(ui, /phase20-release-readiness/);
      assert.match(ui, /phase20-migration-simulator/);
      assert.match(ui, /phase20-release-readiness-mobile/);
      assert.match(css, /@media \(max-width: 480px\)/);
      assert.match(fs.readFileSync(path.join(ROOT, "docs/TESTING_SITE_INTEGRATION_PLAN.md"), "utf8"), /little-learner-hub-testing/);
      pass("assets_and_integration_plan");
    }

    {
      const playwright = require("playwright");
      const browser = await playwright.chromium.launch({ headless: true });
      try {
        const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await desk.newPage();
        await page.goto(`http://127.0.0.1:${ctx.port}/`, { waitUntil: "networkidle" });
        await page.evaluate((adminToken) => {
          localStorage.setItem("llhAdminToken", adminToken);
          sessionStorage.setItem("llhAdminToken", adminToken);
        }, token);
        await page.goto(`http://127.0.0.1:${ctx.port}/#testing-lab`, { waitUntil: "domcontentloaded" });
        await page.evaluate(async () => {
          await window.LLHPlatformPerf.ensureViewScripts("testing-lab");
          document.querySelectorAll(".view").forEach((el) => {
            el.classList.remove("active-view");
            el.hidden = true;
          });
          const section = document.querySelector("#view-testing-lab") || document.body;
          section.classList.add("active-view");
          section.hidden = false;
          section.style.display = "block";
          await window.renderTestingLabPage(section);
        });
        await page.waitForSelector('[data-feature-marker="phase18-testing-lab"]', { timeout: 15000 });
        await page.click('[data-tl-panel="release"]');
        await page.waitForSelector('[data-feature-marker="phase20-release-readiness"]', { timeout: 15000 });
        const text = await page.locator("[data-tl-release]").innerText();
        assert.match(text, /Release Readiness Center/i);
        assert.match(text, /kill switches/i);
        assert.ok(!/temporaryPassword|Bearer\s+[A-Za-z0-9]/i.test(text));
        pass("computer_release_readiness_ui");
        await desk.close();

        for (const width of [360, 390, 430]) {
          const phone = await browser.newContext({ viewport: { width, height: 800 } });
          const pp = await phone.newPage();
          await pp.goto(`http://127.0.0.1:${ctx.port}/`, { waitUntil: "networkidle" });
          await pp.evaluate((adminToken) => {
            localStorage.setItem("llhAdminToken", adminToken);
            sessionStorage.setItem("llhAdminToken", adminToken);
          }, token);
          await pp.goto(`http://127.0.0.1:${ctx.port}/#testing-lab`, { waitUntil: "domcontentloaded" });
          await pp.evaluate(async () => {
            await window.LLHPlatformPerf.ensureViewScripts("testing-lab");
            const section = document.querySelector("#view-testing-lab") || document.body;
            section.classList.add("active-view");
            section.hidden = false;
            section.style.display = "block";
            await window.renderTestingLabPage(section);
          });
          await pp.waitForSelector("[data-tl-mobile-summary]", { timeout: 15000 });
          const checks = await pp.evaluate(() => {
            const mobile = document.querySelector("[data-tl-mobile-summary]");
            const desktop = document.querySelector("[data-tl-desktop-lab]");
            const text = mobile?.innerText || "";
            return {
              mobileShown: mobile && getComputedStyle(mobile).display !== "none",
              desktopHidden: desktop && getComputedStyle(desktop).display === "none",
              computerRec: /computer recommended/i.test(text),
              noMigApply: !document.querySelector("[data-tl-mig-apply]"),
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
              phase20: mobile?.getAttribute("data-phase20-marker") === "phase20-release-readiness-mobile",
            };
          });
          assert.equal(checks.mobileShown, true, `${width}`);
          assert.equal(checks.desktopHidden, true, `${width}`);
          assert.equal(checks.computerRec, true, `${width}`);
          assert.equal(checks.noMigApply, true, `${width}`);
          assert.equal(checks.overflow, false, `${width}`);
          assert.equal(checks.phase20, true, `${width}`);
          await phone.close();
        }
        pass("phone_status_summary_360_390_430");
      } finally {
        await browser.close();
      }
    }
  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 20 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
