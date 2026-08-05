#!/usr/bin/env node
/**
 * Pass 2 — Production regression after Teaching Kit Owner Preview deploy.
 * Proves Viewer/Print/Attachments stay off for every non-owner account type
 * and that major customer surfaces still load. Does not enable customer flags.
 * Does not write real customer data (seeded sessions use blockServerPersistence).
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { chromium } = require("playwright");
const {
  PERSONAS,
  seedSession,
  waitBootReady,
  clickSidebarNav,
  dismissFreePlanNudgeIfPresent,
} = require("./test-helpers/llh-browser-nav");

const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const OWNER = "leahivie@icloud.com";
const PLAN_ID = process.env.LLH_TK_PLAN_ID || "cur-lp-preschool-farm-animals";
const OUT = "/opt/cursor/artifacts/tk-owner-preview-pass2";
const SERVICE = "srv-d8o3f3r6sc1c73comlc0";

fs.mkdirSync(OUT, { recursive: true });

const findings = [];
function pass(m, d) { findings.push({ ok: true, m, d }); console.log(`  ✓ ${m}${d ? ` — ${d}` : ""}`); }
function fail(m, d) { findings.push({ ok: false, m, d }); console.log(`  ✗ ${m}${d ? ` — ${d}` : ""}`); }

function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...(opts.headers || {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(raw || "null"); } catch { json = { raw: raw.slice(0, 300) }; }
        resolve({ status: res.statusCode, json, text: raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function listAllEnv() {
  const key = process.env.RENDER_API_KEY;
  if (!key) return {};
  let cursor = "";
  const map = {};
  for (let i = 0; i < 20; i += 1) {
    const pathName = `/v1/services/${SERVICE}/env-vars${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
    const batch = await new Promise((resolve, reject) => {
      https.get({
        hostname: "api.render.com",
        path: pathName,
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      }, (r) => {
        let raw = "";
        r.on("data", (c) => { raw += c; });
        r.on("end", () => {
          try { resolve(JSON.parse(raw || "[]")); } catch { resolve([]); }
        });
      }).on("error", reject);
    });
    if (!batch.length) break;
    for (const row of batch) {
      const k = row.envVar?.key || row.key;
      const v = row.envVar?.value || row.value;
      if (k) map[k] = v;
    }
    cursor = batch[batch.length - 1]?.cursor;
    if (!cursor) break;
  }
  return map;
}

const STAFF_PERSONAS = {
  "center-owner": {
    email: "matrix-center-owner@test.local",
    firstName: "Center",
    lastName: "Owner",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "center",
    centerRole: "owner",
  },
  director: {
    email: "matrix-director@test.local",
    firstName: "Dir",
    lastName: "Ector",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "director",
    accountType: "center",
    centerRole: "director",
  },
  teacher: {
    email: "matrix-teacher@test.local",
    firstName: "Tea",
    lastName: "Cher",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "teacher",
    accountType: "center",
    centerRole: "teacher",
  },
  assistant: {
    email: "matrix-assistant@test.local",
    firstName: "As",
    lastName: "Sistant",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "assistant",
    accountType: "center",
    centerRole: "assistant",
  },
  "home-daycare": {
    email: "matrix-home-daycare@test.local",
    firstName: "Home",
    lastName: "Daycare",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
};

const SURFACES = [
  { key: "lessons", nav: "lessons", view: "lessons" },
  { key: "activities", nav: "activities", view: "activities" },
  { key: "calendar", nav: "calendar", view: "calendar" },
  { key: "children", nav: "children", view: "children" },
  { key: "daily-logs", nav: "child-tools-daily-logs", view: "child-tools-daily-logs" },
  { key: "docs", nav: "ai", view: "ai" },
  { key: "behavior", nav: "behavior-support", view: "behavior-support" },
  { key: "messages", nav: "messages", view: "messages" },
  { key: "settings", nav: "settings", view: "settings" },
  { key: "billing", nav: "billing", view: "billing", optional: true },
];

async function assertTkBlocked(label, headers) {
  const res = await httpJson(`${PROD}/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`, { headers });
  if (res.status === 404 && res.json?.code === "teaching_kit_disabled") {
    pass(`${label}: TK API blocked`);
  } else {
    fail(`${label}: TK API blocked`, `${res.status} ${res.json?.code || res.json?.error}`);
  }
}

async function walkPersona(browser, name, persona, device) {
  const page = await browser.newPage({
    viewport: { width: device.width, height: device.height },
  });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  try {
    await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await waitBootReady(page);
    await seedSession(page, persona, { lastView: "calendar", blockServerPersistence: true });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await waitBootReady(page);
    await dismissFreePlanNudgeIfPresent(page);

    const identity = await page.evaluate(() => ({
      user: String(typeof currentUser !== "undefined" ? currentUser : "").toLowerCase(),
      preview: typeof isOwnerTeachingKitPreviewActive === "function"
        ? isOwnerTeachingKitPreviewActive()
        : false,
      flags: typeof effectiveTeachingKitCustomerFlags === "function"
        ? effectiveTeachingKitCustomerFlags()
        : null,
    }));
    if (identity.user === String(persona.email).toLowerCase()) pass(`${name}/${device.label}: session`);
    else fail(`${name}/${device.label}: session`, identity.user);
    if (identity.preview === false) pass(`${name}/${device.label}: owner preview off`);
    else fail(`${name}/${device.label}: owner preview off`);
    if (identity.flags?.teachingKitViewer !== true
      && identity.flags?.teachingKitPrintCenter !== true
      && identity.flags?.teachingKitAttachments !== true) {
      pass(`${name}/${device.label}: TK client flags off`);
    } else fail(`${name}/${device.label}: TK client flags off`, identity.flags);

    const kit = await page.evaluate(async (planId) => {
      if (typeof fetchTeachingKitForPlan !== "function") return { ok: false, reason: "missing" };
      return fetchTeachingKitForPlan(planId, { day: "monday" });
    }, PLAN_ID);
    if (kit?.ok === false && (kit.reason === "flag_off" || kit.code === "teaching_kit_disabled")) {
      pass(`${name}/${device.label}: TK fetch blocked`);
    } else fail(`${name}/${device.label}: TK fetch blocked`, kit);

    // Navigate major surfaces via visible sidebar clicks when present.
    for (const surface of SURFACES) {
      try {
        const visible = await page.evaluate((view) => {
          const nodes = [...document.querySelectorAll(`.sidebar .nav-link[data-view="${view}"]`)];
          return nodes.some((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true" && node.offsetParent !== null);
        }, surface.nav);
        if (!visible) {
          pass(`${name}/${device.label}: ${surface.key} nav optional/absent`);
          continue;
        }
        await clickSidebarNav(page, surface.nav, surface.view);
        await page.waitForTimeout(350);
        const hasTkOwnerBanner = await page.locator("[data-tk-owner-preview-banner]").count();
        if (hasTkOwnerBanner === 0) pass(`${name}/${device.label}: ${surface.key} no owner banner`);
        else fail(`${name}/${device.label}: ${surface.key} leaked owner banner`);
        const active = await page.locator(`#view-${surface.view}.active-view`).count();
        if (active === 1) pass(`${name}/${device.label}: ${surface.key} rendered`);
        else fail(`${name}/${device.label}: ${surface.key} rendered`);
      } catch (error) {
        if (surface.optional) pass(`${name}/${device.label}: ${surface.key} optional (${error.message})`);
        else fail(`${name}/${device.label}: ${surface.key}`, error.message);
      }
    }

    await page.screenshot({
      path: path.join(OUT, `pass2-${name}-${device.label}.png`),
      fullPage: false,
    });

    const serious = consoleErrors.filter((e) => !/favicon|fonts\.g|third-party|ResizeObserver|net::ERR/i.test(e));
    if (serious.length === 0) pass(`${name}/${device.label}: no serious console errors`);
    else fail(`${name}/${device.label}: console`, serious.slice(0, 3).join(" | "));
  } finally {
    await page.close();
  }
}

async function main() {
  const bv = await httpJson(`${PROD}/api/build-version`);
  pass("live build", `${bv.json?.shortSha} shell=${bv.json?.shellVersion}`);

  const inv = await httpJson(`${PROD}/api/public/home-inventory`);
  if (inv.json?.lessonPlanCount === 127 && inv.json?.activityCount === 2110) pass("inventory 127/2110");
  else fail("inventory", JSON.stringify(inv.json));

  await assertTkBlocked("anonymous", {});

  // Spoofed customer identities must not unlock TK on production (header ignored).
  const spoofAccounts = [
    ["Free spoof", { "x-llh-user-email": "free-member@example.com", Authorization: "Bearer test:free-member@example.com" }],
    ["Trial spoof", { "x-llh-user-email": "trial@example.com", Authorization: "Bearer test:trial@example.com" }],
    ["Founding spoof", { "x-llh-user-email": "founding@example.com", Authorization: "Bearer test:founding@example.com" }],
    ["Pro spoof", { "x-llh-user-email": "pro-member@example.com", Authorization: "Bearer test:pro-member@example.com" }],
    ["Center Owner spoof", { "x-llh-user-email": "center-owner@example.com", Authorization: "Bearer test:center-owner@example.com" }],
    ["Director spoof", { "x-llh-user-email": "director@example.com", Authorization: "Bearer test:director@example.com" }],
    ["Teacher spoof", { "x-llh-user-email": "teacher@example.com", Authorization: "Bearer test:teacher@example.com" }],
    ["Assistant spoof", { "x-llh-user-email": "assistant@example.com", Authorization: "Bearer test:assistant@example.com" }],
    ["Owner alias spoof", { "x-llh-user-email": "leahrivie@icloud.com", Authorization: "Bearer test:leahrivie@icloud.com" }],
  ];
  for (const [label, headers] of spoofAccounts) {
    await assertTkBlocked(label, headers);
  }

  // Store flags remain off (owner admin read).
  const env = await listAllEnv();
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD && env.ADMIN_ACCESS_CODE) {
    const login = await httpJson(`${PROD}/api/admin/login`, {
      method: "POST",
      body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, code: env.ADMIN_ACCESS_CODE },
    });
    if (login.status === 200 && login.json?.token) {
      const sc = await httpJson(`${PROD}/api/admin/site-content?adminToken=${encodeURIComponent(login.json.token)}`);
      const flags = sc.json?.siteContent?.featureFlags || {};
      if (flags.teachingKitViewer !== true
        && flags.teachingKitPrintCenter !== true
        && flags.teachingKitAttachments !== true) {
        pass("store customer TK flags still OFF");
      } else fail("store customer TK flags still OFF", JSON.stringify({
        v: flags.teachingKitViewer, p: flags.teachingKitPrintCenter, a: flags.teachingKitAttachments,
      }));
      // Owner still elevated
      const ownerKit = await httpJson(`${PROD}/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`, {
        headers: { Authorization: `Bearer ${login.json.token}` },
      });
      if (String(env.ADMIN_EMAIL || "").toLowerCase() === OWNER
        && ownerKit.status === 200
        && ownerKit.json?.featureFlags?.ownerPreview === true) {
        pass("owner admin still elevated");
      } else if (String(env.ADMIN_EMAIL || "").toLowerCase() !== OWNER) {
        pass("admin email is not owner — skip owner elevate check");
      } else fail("owner admin still elevated", `${ownerKit.status} ${ownerKit.json?.code}`);
    } else fail("admin login for flag audit", login.status);
  } else {
    fail("RENDER_API_KEY/admin env unavailable for flag audit");
  }

  const publicSc = await httpJson(`${PROD}/api/site-content`);
  if (!publicSc.json?.siteContent?.featureFlags) pass("public site-content omits featureFlags");
  else fail("public site-content omits featureFlags");

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const devices = [
      { label: "desktop", width: 1366, height: 900 },
      { label: "mobile", width: 390, height: 844 },
    ];
    const personas = {
      free: PERSONAS.free,
      trial: PERSONAS.trial,
      founding: PERSONAS.founding,
      pro: PERSONAS.pro,
      ...STAFF_PERSONAS,
    };
    for (const [name, persona] of Object.entries(personas)) {
      for (const device of devices) {
        await walkPersona(browser, name, persona, device);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    pass: "owner-preview-pass2-regression",
    passed: findings.filter((f) => f.ok).length,
    failed: findings.filter((f) => !f.ok).length,
    findings,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, "pass2-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed }, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
