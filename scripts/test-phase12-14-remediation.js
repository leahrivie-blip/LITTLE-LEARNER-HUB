#!/usr/bin/env node
"use strict";

/**
 * Phase 12–14 remediation suite:
 * - Responsive overflow / layout at phone, large phone, tablet, computer
 * - Real Family Hub licensing-task navigation
 * - Computer Recommended application UI
 * - Capture assert rejects marketing homepage
 * - Feature-marker assertions
 * - Existing permissions / production locks smoke
 *
 * Fake data only. No Stripe/email/SMS/push/AI. Production Family Hub locked.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const expansionFlags = require("./expansion-feature-flags.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");
const { openFamilyHubTab } = require("./capture-mount-helpers.js");

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase1214-remediation@example.com";
const ADMIN_PASSWORD = "Phase1214Remediation!99";
const ADMIN_CODE = "phase1214-remediation-code";

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

function waitForHealth(port, timeoutMs = 25000) {
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

async function startServer() {
  const storePath = path.join(os.tmpdir(), `llh-remediation-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: true,
      },
    },
  }, null, 2));
  const port = 9100 + Math.floor(Math.random() * 200);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForHealth(port);
  return { port, child, storePath };
}

async function stopServer(ctx) {
  if (!ctx?.child) return;
  ctx.child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function issueAndLogin(port, adminToken, kind) {
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const account = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(account, `missing fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {
    headers: auth(adminToken),
    body: {},
  });
  const password = issued.body.password || issued.body.temporaryPassword;
  const login = await request(port, "POST", "/api/auth/password-login", { body: { email: account.email, password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    email: account.email,
    token: login.body.memberSessionToken || login.body.token,
    account,
  };
}

async function measureOverflow(page, rootSelector) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector) || document.documentElement;
    const doc = document.documentElement;
    const overflowing = [];
    const nodes = root.querySelectorAll("*");
    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== "hidden") {
        overflowing.push({
          tag: el.tagName,
          cls: el.className?.toString?.().slice(0, 80) || "",
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
        if (overflowing.length >= 8) break;
      }
    }
    return {
      pageOverflow: doc.scrollWidth > doc.clientWidth + 2,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowing,
    };
  }, rootSelector);
}

async function openDirectorTab(page, tab, marker) {
  const base = page.url().split("#")[0].replace(/\/$/, "");
  await page.goto(`${base}/#director-center`, { waitUntil: "domcontentloaded" });
  const { mountDirectorFeature } = require("./capture-mount-helpers.js");
  const map = {
    enrollment: { renderName: "renderEnrollmentTab", mountId: "dc-enrollment-mount" },
    records_center: { renderName: "renderRecordsCenterTab", mountId: "dc-records-center-mount" },
    licensing_center: { renderName: "renderLicensingCenterTab", mountId: "dc-licensing-center-mount" },
  };
  const cfg = map[tab];
  await mountDirectorFeature(page, { tab, renderName: cfg.renderName, mountId: cfg.mountId, marker });
  await assertFeatureScreen(page, { marker, label: `director ${tab}` });
  await assertNotHomepageFallback(page, `director ${tab}`);
}

async function run() {
  {
    // Unit-ish: capture assert rejects homepage-looking pages
    const playwright = require("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(`
      <html><body>
        <section id="view-home"><div class="hero-section">Little Learner Hub</div><button>Sign up</button></section>
      </body></html>
    `);
    let rejected = false;
    try {
      await assertFeatureScreen(page, { marker: "phase12-enrollment", label: "homepage rejection" });
    } catch {
      rejected = true;
    }
    assert.equal(rejected, true);
    let homepageRejected = false;
    try {
      await assertNotHomepageFallback(page, "homepage rejection");
    } catch {
      homepageRejected = true;
    }
    assert.equal(homepageRejected, true);
    await browser.close();
    pass("capture_rejects_marketing_homepage");
  }

  const ctx = await startServer();
  let browser;
  try {
    const login = await request(ctx.port, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(login.status, 200);
    const token = login.body.token;
    await request(ctx.port, "POST", "/api/director-center/family/seed", { headers: auth(token), body: {} });
    await request(ctx.port, "POST", "/api/director-center/enrollment/seed", { headers: auth(token), body: { reset: true } });
    await request(ctx.port, "POST", "/api/director-center/records/seed", { headers: auth(token), body: { reset: true } });
    await request(ctx.port, "POST", "/api/director-center/licensing/seed", { headers: auth(token), body: { reset: true } });
    await request(ctx.port, "POST", "/api/family-hub/seed", { headers: auth(token), body: {} });

    // Production lock smoke
    {
      const locked = expansionFlags.evaluateExpansionAccess({
        flagKey: EXPANSION_FEATURE_KEYS.FAMILY_HUB,
        environment: expansionFlags.resolveExpansionEnvironment({
          siteUrl: "https://littlelearnershubbyleah.com",
          env: { NODE_ENV: "production", ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true" },
        }),
        storedFlags: { familyHub: true },
      });
      assert.equal(locked.allowed, false);
      pass("production_family_hub_locked");
    }

    const parent = await issueAndLogin(ctx.port, token, "parent_multi_child");
    const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
    assert.equal(home.status, 200);
    assert.ok((home.body.licensingTasks || []).length > 0, "expected licensing tasks on home");
    assert.ok(home.body.licensingTaskCount > 0);
    pass("home_includes_licensing_tasks");

    const tasks = await request(ctx.port, "GET", "/api/family-hub/licensing/tasks", { headers: auth(parent.token) });
    assert.equal(tasks.status, 200);
    assert.equal(tasks.body.computerRecommended, true);
    assert.ok((tasks.body.tasks || []).length > 0);
    for (const task of tasks.body.tasks) {
      assert.ok(task.childId);
      assert.ok(task.childDisplayName);
      assert.equal(task.computerRecommended, true);
    }
    pass("licensing_tasks_enriched");

    // Restricted / pickup denials
    for (const kind of ["pickup_only", "restricted_guardian"]) {
      const actor = await issueAndLogin(ctx.port, token, kind).catch(() => null);
      if (!actor) continue;
      const denied = await request(ctx.port, "GET", "/api/family-hub/licensing/tasks", { headers: auth(actor.token) });
      assert.ok(denied.status === 403 || denied.status === 401, `${kind} should be denied, got ${denied.status}`);
      pass(`licensing_denied_${kind}`);
    }

    const playwright = require("playwright");
    browser = await playwright.chromium.launch({ headless: true });

    // Computer layout + feature markers
    {
      const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await desktop.newPage();
      await page.goto(`http://127.0.0.1:${ctx.port}/`, { waitUntil: "networkidle" });
      await page.evaluate((adminToken) => {
        localStorage.setItem("llhAdminToken", adminToken);
        sessionStorage.setItem("llhAdminToken", adminToken);
      }, token);
      await openDirectorTab(page, "enrollment", "phase12-enrollment");
      let measure = await measureOverflow(page, "[data-feature-marker='phase12-enrollment']");
      assert.equal(measure.pageOverflow, false, JSON.stringify(measure));
      pass("computer_enrollment_no_overflow");

      await openDirectorTab(page, "records_center", "phase13-records");
      measure = await measureOverflow(page, "[data-feature-marker='phase13-records']");
      assert.equal(measure.pageOverflow, false, JSON.stringify(measure));
      const rcComputerRecHidden = await page.evaluate(() => {
        const el = document.querySelector("[data-rc-computer-recommended]");
        if (!el) return true;
        return getComputedStyle(el).display === "none";
      });
      assert.equal(rcComputerRecHidden, true, "Computer Recommended should be hidden on desktop Records");
      pass("computer_records_layout");

      await openDirectorTab(page, "licensing_center", "phase14-licensing");
      measure = await measureOverflow(page, "[data-feature-marker='phase14-licensing']");
      assert.equal(measure.pageOverflow, false, JSON.stringify(measure));
      pass("computer_licensing_layout");
      await desktop.close();
    }

    // Tablet layout
    {
      const tablet = await browser.newContext({ viewport: { width: 834, height: 1112 } });
      const page = await tablet.newPage();
      await page.goto(`http://127.0.0.1:${ctx.port}/`, { waitUntil: "networkidle" });
      await page.evaluate((adminToken) => {
        localStorage.setItem("llhAdminToken", adminToken);
        sessionStorage.setItem("llhAdminToken", adminToken);
      }, token);
      await openDirectorTab(page, "records_center", "phase13-records");
      const measure = await measureOverflow(page, "[data-feature-marker='phase13-records']");
      assert.equal(measure.pageOverflow, false, JSON.stringify(measure));
      const visible = await page.locator("[data-rc-computer-recommended]").isVisible();
      assert.equal(visible, true, "tablet should show Computer Recommended for Records");
      pass("tablet_records_layout");

      await openDirectorTab(page, "licensing_center", "phase14-licensing");
      const lcVisible = await page.locator("[data-lc-computer-recommended]").isVisible();
      assert.equal(lcVisible, true);
      pass("tablet_licensing_layout");
      await tablet.close();
    }

    // Small phone + large phone Family Hub
    for (const [label, width] of [["small_phone", 360], ["large_phone", 430]]) {
      const phone = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
      const page = await phone.newPage();
      await page.goto(`http://127.0.0.1:${ctx.port}/`, { waitUntil: "networkidle" });
      await page.evaluate(({ email, memberToken }) => {
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhMemberSessionToken", memberToken);
        localStorage.setItem("llhAccountType", "parent");
      }, { email: parent.email, memberToken: parent.token });
      await page.goto(`http://127.0.0.1:${ctx.port}/#family-hub`, { waitUntil: "domcontentloaded" });
      await openFamilyHubTab(page, "home");
      await page.waitForTimeout(800);

      // Nav stays at five items
      const navCount = await page.locator(".fh-bottom-nav [data-fh-tab]").count();
      assert.ok(navCount <= 5, `${label} bottom nav exceeded five: ${navCount}`);
      pass(`${label}_nav_max_five`);

      // Home licensing card
      await page.waitForSelector("[data-fh-licensing-home-card]", { timeout: 15000 });
      await page.click('[data-fh-licensing-home-card] [data-fh-tab="licensing"]');
      await page.waitForTimeout(1000);
      await assertFeatureScreen(page, { marker: "phase14-family-licensing-tasks", label: `${label} licensing` });
      const computerRec = await page.locator("[data-fh-computer-recommended]").first().isVisible();
      assert.equal(computerRec, true);
      pass(`${label}_family_licensing_navigation`);

      let measure = await measureOverflow(page, "[data-feature-marker='phase14-family-licensing-tasks']");
      assert.equal(measure.pageOverflow, false, JSON.stringify(measure));
      pass(`${label}_licensing_no_overflow`);

      await openFamilyHubTab(page, "enrollment");
      await assertFeatureScreen(page, { marker: "phase12-enrollment", label: `${label} enrollment` });
      measure = await measureOverflow(page, "[data-feature-marker='phase12-enrollment']");
      assert.equal(measure.pageOverflow, false, JSON.stringify(measure));
      pass(`${label}_enrollment_no_overflow`);

      await openFamilyHubTab(page, "records");
      await assertFeatureScreen(page, { marker: "phase13-records", label: `${label} records` });
      measure = await measureOverflow(page, "[data-feature-marker='phase13-records']");
      assert.equal(measure.pageOverflow, false, JSON.stringify(measure));
      pass(`${label}_records_no_overflow`);

      // Provider phone Computer Recommended
      await page.evaluate((adminToken) => {
        localStorage.setItem("llhAdminToken", adminToken);
        sessionStorage.setItem("llhAdminToken", adminToken);
      }, token);
      await openDirectorTab(page, "licensing_center", "phase14-licensing");
      const lcRec = await page.locator("[data-lc-computer-recommended]").isVisible();
      assert.equal(lcRec, true);
      pass(`${label}_provider_licensing_computer_recommended`);

      await phone.close();
    }

    // Feature marker presence in source UI contracts
    {
      const enrollmentSrc = fs.readFileSync(path.join(ROOT, "enrollment-ui.js"), "utf8");
      const recordsSrc = fs.readFileSync(path.join(ROOT, "records-center-ui.js"), "utf8");
      const licensingSrc = fs.readFileSync(path.join(ROOT, "licensing-center-ui.js"), "utf8");
      const familySrc = fs.readFileSync(path.join(ROOT, "family-hub-ui.js"), "utf8");
      assert.match(enrollmentSrc, /data-feature-marker="phase12-enrollment"/);
      assert.match(recordsSrc, /data-feature-marker="phase13-records"/);
      assert.match(licensingSrc, /data-feature-marker="phase14-licensing"/);
      assert.match(familySrc, /data-feature-marker="phase14-family-licensing-tasks"/);
      assert.match(familySrc, /Licensing Documents Needed/);
      assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "scripts/capture-licensing-center-phase14-screens.js"), "utf8"), /mount\.innerHTML\s*=\s*`[\s\S]*Computer Recommended/);
      pass("feature_marker_contracts");
    }

  } finally {
    if (browser) await browser.close();
    await stopServer(ctx);
  }

  console.log(`\nPhase 12–14 remediation suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
