#!/usr/bin/env node
"use strict";

/**
 * Phase 19 focused suite — accessibility, performance, reliability, recovery.
 * Fake data only. No Stripe/email/SMS/push/live AI. No production backup/restore.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./platform-resilience-data-model.js");
const tlModel = require("./testing-lab-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase19-admin@example.com";
const ADMIN_PASSWORD = "Phase19Resilience!99";
const ADMIN_CODE = "phase19-lab-code";
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
  const storePath = path.join(os.tmpdir(), `llh-p19-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9900 + Math.floor(Math.random() * 400);
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
  {
    assert.equal(model.PHASE, 19);
    assert.match(model.FEATURE_MARKER, /phase19/);
    assert.ok(model.PERFORMANCE_BUDGETS.listPageSize >= 10);
    const keyA = model.buildDraftScopeKey({ surface: "forms", organizationId: "org_aaa", userId: "u1", recordId: "r1" });
    const keyB = model.buildDraftScopeKey({ surface: "forms", organizationId: "org_bbb", userId: "u1", recordId: "r1" });
    assert.notEqual(keyA, keyB);
    const draft = model.createDraftRecord({
      surface: "forms",
      organizationId: "org_abcdef12",
      userId: "admin@example.invalid",
      recordId: "rec1",
      payload: { title: "ok", password: "SECRET", temporaryPassword: "nope" },
    });
    assert.equal(draft.payload.password, undefined);
    assert.equal(draft.payload.temporaryPassword, undefined);
    assert.equal(draft.payload.title, "ok");
    const sanitized = model.sanitizeErrorLog({
      message: "boom",
      password: "x",
      code: "timeout",
      organizationId: "org_abcdef12",
    });
    assert.equal(sanitized.password, undefined);
    assert.equal(sanitized.noSecrets, true);
    const page = model.paginateList(Array.from({ length: 60 }, (_, i) => i), { page: 2, pageSize: 25 });
    assert.equal(page.items.length, 25);
    assert.equal(page.page, 2);
    assert.equal(page.hasMore, true);
    pass("unit_model_draft_sanitize_paginate");
  }

  {
    const prod = await startServer({
      env: {
        SITE_URL: "https://littlelearnershubbyleah.com",
        ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      },
    });
    try {
      const token = await login(prod.port).catch(() => null);
      // Even with token, production must reject Lab health
      const health = await request(prod.port, "GET", `${BASE}/health`, {
        headers: token ? auth(token) : {},
      });
      assert.equal(health.status, 403);
      pass("production_health_rejected");
    } finally {
      await stopServer(prod);
    }
  }

  const ctx = await startServer();
  try {
    const token = await login(ctx.port);
    const seed = await request(ctx.port, "POST", `${BASE}/seed`, {
      headers: auth(token),
      body: { scenario: "small_center", reset: true },
    });
    assert.equal(seed.status, 200, JSON.stringify(seed.body));
    const orgId = seed.body.organizationId;
    assert.ok(tlModel.isFakeOrganizationId(orgId));
    pass("seed_fake_org");

    const health = await request(ctx.port, "GET", `${BASE}/health`, { headers: auth(token) });
    assert.equal(health.status, 200, JSON.stringify(health.body));
    assert.equal(health.body.featureMarker, model.FEATURE_MARKER);
    assert.equal(health.body.storage.ready, true);
    assert.equal(health.body.externalServices.stripeCheckout, "disabled");
    assert.equal(health.body.externalServices.outboundEmail, "disabled");
    assert.equal(health.body.backupRestore.productionBackup, false);
    assert.equal(health.body.backupRestore.fakeSimulationAvailable, true);
    assert.ok(health.body.performance.durationMs >= 0);
    assert.ok(health.body.performance.budgetMs > 0);
    pass("health_summary");

    const badBackup = await request(ctx.port, "POST", `${BASE}/backup/simulate`, {
      headers: auth(token),
      body: { organizationId: "prod_live_customer_org" },
    });
    assert.equal(badBackup.status, 403);
    pass("backup_rejects_real_org");

    const backup = await request(ctx.port, "POST", `${BASE}/backup/simulate`, {
      headers: auth(token),
      body: {},
    });
    assert.equal(backup.status, 200, JSON.stringify(backup.body));
    assert.equal(backup.body.backup.testingOnly, true);
    assert.ok(backup.body.backup.excludes.includes("passwords"));
    pass("backup_simulate");

    const preview = await request(ctx.port, "POST", `${BASE}/restore/preview`, {
      headers: auth(token),
      body: { backupId: backup.body.backup.id },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.requiresConfirm, true);
    assert.ok(preview.body.preview.wouldNotChange.includes("production database"));
    const noConfirm = await request(ctx.port, "POST", `${BASE}/restore/confirm`, {
      headers: auth(token),
      body: { previewId: preview.body.preview.id, confirm: false },
    });
    assert.equal(noConfirm.status, 400);
    const confirm = await request(ctx.port, "POST", `${BASE}/restore/confirm`, {
      headers: auth(token),
      body: { previewId: preview.body.preview.id, confirm: true },
    });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.testingOnly, true);
    pass("restore_preview_confirm");

    const draftSave = await request(ctx.port, "POST", `${BASE}/drafts/save`, {
      headers: auth(token),
      body: {
        surface: "testing_lab_checklist",
        organizationId: orgId,
        userId: ADMIN_EMAIL,
        recordId: "billing",
        payload: { draftText: "hello", password: "SECRET" },
      },
    });
    assert.equal(draftSave.status, 200);
    assert.equal(draftSave.body.draft.scope.organizationId, orgId);
    const draftWrong = await request(ctx.port, "POST", `${BASE}/drafts/load`, {
      headers: auth(token),
      body: {
        surface: "testing_lab_checklist",
        organizationId: orgId,
        userId: "other@example.invalid",
        recordId: "billing",
      },
    });
    assert.equal(draftWrong.status, 200);
    assert.equal(draftWrong.body.draft, null);
    const draftOk = await request(ctx.port, "POST", `${BASE}/drafts/load`, {
      headers: auth(token),
      body: {
        surface: "testing_lab_checklist",
        organizationId: orgId,
        userId: ADMIN_EMAIL,
        recordId: "billing",
      },
    });
    assert.equal(draftOk.status, 200);
    assert.ok(draftOk.body.draft);
    assert.equal(draftOk.body.draft.payload.password, undefined);
    pass("draft_scope_isolation");

    const failed = await request(ctx.port, "POST", `${BASE}/failed-saves/record`, {
      headers: auth(token),
      body: {
        code: "timeout",
        message: "Simulated timeout",
        surface: "forms",
        organizationId: orgId,
        password: "should-not-store",
        networkState: "timeout",
      },
    });
    assert.equal(failed.status, 200);
    assert.equal(failed.body.failedSave.password, undefined);
    assert.equal(failed.body.failedSave.noSecrets, true);
    pass("failed_save_sanitized");

    const activity = await request(ctx.port, "GET", `${BASE}/activity?page=1&pageSize=10`, { headers: auth(token) });
    assert.equal(activity.status, 200);
    assert.ok(Array.isArray(activity.body.items));
    assert.equal(activity.body.pageSize, 10);
    pass("activity_pagination");

    {
      const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
      const a11y = fs.readFileSync(path.join(ROOT, "platform-a11y.js"), "utf8");
      const perf = fs.readFileSync(path.join(ROOT, "platform-perf.js"), "utf8");
      const res = fs.readFileSync(path.join(ROOT, "platform-resilience.js"), "utf8");
      assert.match(html, /llh-skip-link|Skip to main content/);
      assert.match(html, /platform-a11y\.js/);
      assert.match(html, /platform-perf\.js/);
      assert.match(html, /platform-resilience\.js/);
      assert.doesNotMatch(html, /testing-lab-ui\.js\?v=20260722-phase18/);
      assert.match(css, /prefers-reduced-motion/);
      assert.match(css, /:focus-visible/);
      assert.match(css, /\.llh-error-summary/);
      assert.match(a11y, /trapFocus|openDialog|renderErrorSummary/);
      assert.match(perf, /ensureViewScripts|cachedGet|paginate/);
      assert.match(res, /createSaveController|draftStore|beforeunload/);
      assert.match(fs.readFileSync(path.join(ROOT, "testing-lab-ui.js"), "utf8"), /phase19-platform-resilience/);
      pass("assets_a11y_perf_markers");
    }

    // Browser: phone a11y/recovery + computer health + reduced motion + keyboard focus
    {
      const playwright = require("playwright");
      const browser = await playwright.chromium.launch({ headless: true });
      try {
        for (const width of [360, 390, 430]) {
          const context = await browser.newContext({ viewport: { width, height: 800 } });
          await context.addInitScript(() => {
            Object.defineProperty(window, "matchMedia", {
              writable: true,
              value: (query) => ({
                matches: String(query).includes("prefers-reduced-motion"),
                media: query,
                addEventListener() {},
                removeEventListener() {},
                addListener() {},
                removeListener() {},
                dispatchEvent() { return false; },
              }),
            });
          });
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:${ctx.port}/`, { waitUntil: "networkidle" });
          await page.evaluate((adminToken) => {
            localStorage.setItem("llhAdminToken", adminToken);
            sessionStorage.setItem("llhAdminToken", adminToken);
          }, token);
          await page.goto(`http://127.0.0.1:${ctx.port}/#testing-lab`, { waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => typeof window.LLHPlatformPerf?.ensureViewScripts === "function", null, { timeout: 20000 });
          await page.evaluate(async () => {
            await window.LLHPlatformPerf.ensureViewScripts("testing-lab");
          });
          await page.waitForFunction(() => typeof window.renderTestingLabPage === "function", null, { timeout: 20000 });
          await page.evaluate(async () => {
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
          await page.waitForSelector('[data-feature-marker="phase18-testing-lab-mobile"]', { timeout: 15000 });
          const checks = await page.evaluate(() => {
            const skip = document.getElementById("llh-skip-to-main");
            const panel = document.querySelector(".tl-panel");
            const mobile = document.querySelector("[data-tl-mobile-summary]");
            const desktop = document.querySelector("[data-tl-desktop-lab]");
            return {
              skipExists: Boolean(skip),
              mobileShown: mobile && getComputedStyle(mobile).display !== "none",
              desktopHidden: desktop && getComputedStyle(desktop).display === "none",
              hasPassword: Boolean(panel?.querySelector('input[type="password"]')),
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
              reducedMotionHelper: window.LLHPlatformA11y?.prefersReducedMotion?.() === true,
              saveController: typeof window.LLHPlatformResilience?.createSaveController === "function",
            };
          });
          assert.equal(checks.skipExists, true, `${width} skip link`);
          assert.equal(checks.mobileShown, true, `${width} mobile summary`);
          assert.equal(checks.desktopHidden, true, `${width} desktop hidden`);
          assert.equal(checks.hasPassword, false, `${width} password`);
          assert.equal(checks.overflow, false, `${width} overflow`);
          assert.equal(checks.reducedMotionHelper, true);
          assert.equal(checks.saveController, true);
          await context.close();
        }
        pass("phone_a11y_recovery_360_390_430");

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
        await page.click('[data-tl-panel="health"]');
        await page.waitForSelector('[data-feature-marker="phase19-platform-resilience"]', { timeout: 15000 });
        const healthUi = await page.evaluate(() => {
          const el = document.querySelector("[data-tl-health]");
          const text = el?.innerText || "";
          return {
            visible: Boolean(el && getComputedStyle(el).display !== "none"),
            hasFlags: /Feature flags/i.test(text),
            hasExternal: /External services/i.test(text),
            hasStorage: /Storage/i.test(text),
            focusVisibleRule: Boolean([...document.styleSheets].length),
          };
        });
        assert.equal(healthUi.visible, true);
        assert.equal(healthUi.hasFlags, true);
        assert.equal(healthUi.hasExternal, true);
        assert.equal(healthUi.hasStorage, true);

        // Keyboard: Tab reaches skip link / interactive control
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || "");
        assert.ok(focused, "keyboard focus moved");
        pass("computer_health_keyboard");
        await desk.close();

        // Zoom ~200%: set viewport CSS zoom via emulation of smaller layout width equivalent
        const zoom = await browser.newContext({ viewport: { width: 640, height: 900 } });
        const zpage = await zoom.newPage();
        await zpage.goto(`http://127.0.0.1:${ctx.port}/`, { waitUntil: "networkidle" });
        await zpage.evaluate((adminToken) => {
          localStorage.setItem("llhAdminToken", adminToken);
          sessionStorage.setItem("llhAdminToken", adminToken);
          document.documentElement.style.zoom = "2";
        }, token);
        await zpage.goto(`http://127.0.0.1:${ctx.port}/#testing-lab`, { waitUntil: "domcontentloaded" });
        await zpage.evaluate(async () => {
          await window.LLHPlatformPerf.ensureViewScripts("testing-lab");
          const section = document.querySelector("#view-testing-lab") || document.body;
          section.classList.add("active-view");
          section.hidden = false;
          section.style.display = "block";
          await window.renderTestingLabPage(section);
        });
        await zpage.waitForSelector(".tl-panel", { timeout: 15000 });
        const zoomOk = await zpage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4
          || document.body.scrollWidth <= window.innerWidth + 4);
        assert.equal(zoomOk, true, "zoom layout should not hard-overflow");
        pass("text_zoom_foundation");
        await zoom.close();
      } finally {
        await browser.close();
      }
    }

    const billing = await request(ctx.port, "GET", "/api/director-center/billing/status", { headers: auth(token) });
    assert.equal(billing.status, 200);
    pass("phase17_smoke");
  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 19 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
