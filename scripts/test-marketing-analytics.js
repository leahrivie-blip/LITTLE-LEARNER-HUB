#!/usr/bin/env node
/**
 * Marketing Analytics dashboard wiring + API slice.
 * Run: npm run test:marketing-analytics
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const adminWs = fs.readFileSync(path.join(ROOT, "admin-workspace.js"), "utf8");

function request(port, method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
        resolve({ status: res.statusCode, text: raw, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, child, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      n += 1;
      if (child.exitCode != null) {
        reject(new Error(`server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch { /* retry */ }
      if (n >= attempts) {
        reject(new Error("server health timeout"));
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

async function main() {
  assert.match(serverJs, /function buildMarketingAnalytics/);
  assert.match(serverJs, /summary\.marketing = buildMarketingAnalytics/);
  assert.match(serverJs, /metaTrackingEvents: \[\]/);
  assert.match(serverJs, /function rememberMetaDelivery/);
  assert.match(serverJs, /mergedMetaTrackingEvents/);
  assert.match(serverJs, /PageView: lastMetaEventSnapshot/);
  assert.match(serverJs, /CompleteRegistration: lastMetaEventSnapshot/);
  assert.match(serverJs, /StartTrial: lastMetaEventSnapshot/);
  assert.match(serverJs, /Purchase: lastMetaEventSnapshot/);
  assert.doesNotMatch(serverJs, /accessToken:\s*metaCfg\.accessToken/);
  assert.match(serverJs, /function extractEventAttribution/);
  assert.match(serverJs, /function normalizeMarketingChannel/);
  assert.match(serverJs, /attribution:\s*\{/);
  assert.match(serverJs, /performance:\s*\{/);
  assert.match(serverJs, /costPerSignup/);
  assert.match(serverJs, /conversionBySource/);
  assert.match(serverJs, /avgHoursBeforeSignup/);
  assert.match(serverJs, /detectDeviceFromUserAgent/);
  console.log("PASS server marketing + Meta health helpers");

  assert.match(appJs, /id: "marketing"/);
  assert.match(appJs, /"marketing-analytics"/);
  assert.match(appJs, /function renderAdminMarketingAnalytics/);
  assert.match(appJs, /Live activity feed/);
  assert.match(appJs, /Meta Pixel &amp; Conversions API/);
  assert.match(appJs, /ensureAdminMarketingAutoRefresh/);
  assert.match(appJs, /adminMarketingAttributionTable/);
  assert.match(appJs, /data-marketing-attr-filter/);
  assert.match(appJs, /Facebook only/);
  assert.match(appJs, /Organic only/);
  assert.match(appJs, /Cost \/ signup/);
  assert.match(appJs, /utm_campaign/);
  assert.match(indexHtml, /admin-marketing-analytics-panel/);
  assert.match(indexHtml, /adminMarketingAnalyticsApp/);
  assert.match(adminWs, /data-admin-landing-tab="marketing-analytics"/);
  console.log("PASS admin Marketing Analytics UI wiring");

  const storePath = path.join(os.tmpdir(), `llh-marketing-${crypto.randomBytes(4).toString("hex")}.json`);
  const port = 19700 + Math.floor(Math.random() * 200);
  const firstVisit = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      "free@example.com": {
        email: "free@example.com",
        firstName: "Free",
        lastName: "User",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        accountStatus: "Active",
        signupAt: now,
        createdAt: now,
        lastSeenAt: now,
        attribution: {
          source: "Facebook",
          campaign: "spring-ads",
          medium: "paid_social",
          referrer: "https://facebook.com/",
          landingPage: "/?utm_source=facebook&utm_campaign=spring-ads",
          firstSeenAt: firstVisit,
        },
      },
      "trial@example.com": {
        email: "trial@example.com",
        firstName: "Trial",
        lastName: "User",
        plan: "Pro",
        subscriptionStatus: "Trialing",
        stripeSubscriptionStatus: "trialing",
        accountStatus: "Active",
        trialStart: now,
        metaStartTrialAt: now,
        metaStartTrialEventId: "trial_evt_1",
        signupAt: now,
        createdAt: now,
        lastSeenAt: now,
        attribution: {
          source: "TikTok",
          campaign: "tt-launch",
          medium: "paid_social",
          referrer: "https://www.tiktok.com/",
          landingPage: "/pricing?utm_source=tiktok&utm_campaign=tt-launch",
          firstSeenAt: firstVisit,
        },
      },
      "paid@example.com": {
        email: "paid@example.com",
        firstName: "Paid",
        lastName: "User",
        plan: "Pro",
        subscriptionStatus: "Pro Subscription Active",
        stripeSubscriptionStatus: "active",
        accountStatus: "Active",
        monthlyPrice: 19.99,
        metaPurchaseAt: now,
        metaPurchaseEventId: "purchase_evt_1",
        metaPurchaseValue: 19.99,
        firstPaidInvoiceAt: now,
        signupAt: now,
        createdAt: now,
        lastSeenAt: now,
        attribution: {
          source: "Google",
          campaign: "brand-search",
          medium: "cpc",
          referrer: "https://google.com/",
          landingPage: "/?gclid=abc123&utm_source=google&utm_campaign=brand-search",
          firstSeenAt: firstVisit,
        },
      },
    },
    analyticsEvents: [
      {
        id: "visit_1",
        name: "website_visit",
        visitorId: "v1",
        sessionId: "s1",
        createdAt: firstVisit,
        source: "facebook",
        url: "https://littlelearnershubbyleah.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=spring-ads",
        path: "/",
        referrer: "https://facebook.com/",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        attribution: {
          source: "facebook",
          campaign: "spring-ads",
          medium: "paid_social",
          referrer: "https://facebook.com/",
          landingPage: "/?utm_source=facebook&utm_medium=paid_social&utm_campaign=spring-ads",
          firstSeenAt: firstVisit,
        },
      },
      {
        id: "visit_2",
        name: "website_visit",
        visitorId: "v2",
        sessionId: "s2",
        createdAt: firstVisit,
        source: "Direct",
        path: "/lessons",
        url: "https://littlelearnershubbyleah.com/lessons",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        attribution: { source: "Direct", landingPage: "/lessons", firstSeenAt: firstVisit },
      },
      {
        id: "signup_1",
        name: "account_signup_complete",
        user: "free@example.com",
        visitorId: "v1",
        createdAt: now,
        source: "facebook",
        url: "https://littlelearnershubbyleah.com/?utm_source=facebook&utm_campaign=spring-ads",
        attribution: {
          source: "facebook",
          campaign: "spring-ads",
          medium: "paid_social",
          referrer: "https://facebook.com/",
          landingPage: "/?utm_source=facebook&utm_campaign=spring-ads",
          firstSeenAt: firstVisit,
        },
      },
      {
        id: "signup_trial",
        name: "account_signup_complete",
        user: "trial@example.com",
        visitorId: "v-tt",
        createdAt: now,
        source: "tiktok",
        attribution: {
          source: "tiktok",
          campaign: "tt-launch",
          medium: "paid_social",
          landingPage: "/pricing?utm_source=tiktok&utm_campaign=tt-launch",
          firstSeenAt: firstVisit,
        },
      },
      {
        id: "checkout_1",
        name: "checkout_success",
        user: "paid@example.com",
        createdAt: now,
        detail: { plan: "monthly", monthlyPrice: 19.99 },
        amount: 19.99,
        source: "google",
        attribution: {
          source: "google",
          campaign: "brand-search",
          medium: "cpc",
          landingPage: "/?gclid=abc123&utm_source=google&utm_campaign=brand-search",
          firstSeenAt: firstVisit,
        },
      },
    ],
    metaTrackingEvents: [
      {
        id: "meta_PageView_visit_1",
        eventName: "PageView",
        eventId: "visit_1",
        ok: true,
        skipped: false,
        reason: "",
        createdAt: now,
      },
    ],
    marketingAdSpend: { total: 300, Facebook: 150, TikTok: 100, Google: 50 },
    billingEvents: [],
    foundingMembers: [],
    feedbackItems: [],
    supportTickets: [],
  }, null, 2));

  const child = spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "test-admin-pass",
      ADMIN_ACCESS_CODE: "12345",
      META_PIXEL_ID: "1400795025275614",
      META_CAPI_ACCESS_TOKEN: "",
      META_TRACKING_ENABLED: "true",
      META_PIXEL_ENABLED: "true",
      META_CAPI_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    await waitForHealth(port, child);
    const login = await request(port, "POST", "/api/admin/login", {
      body: {
        email: "owner@example.com",
        password: "test-admin-pass",
        code: "12345",
      },
    });
    assert.equal(login.status, 200, `admin login failed: ${login.text}`);
    const token = login.json?.token || login.json?.adminToken;
    assert.ok(token, "admin token missing");

    const analytics = await request(port, "GET", "/api/admin/analytics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(analytics.status, 200, `analytics failed: ${analytics.text?.slice(0, 300)}`);
    const marketing = analytics.json?.analytics?.marketing;
    assert.ok(marketing, "marketing slice missing");
    assert.ok(marketing.realtime, "realtime missing");
    assert.ok(marketing.funnel, "funnel missing");
    assert.ok(marketing.meta, "meta health missing");
    assert.ok(marketing.periods, "periods missing");
    assert.ok(Array.isArray(marketing.activityFeed), "activity feed missing");
    assert.equal(marketing.meta.pixelId, "1400795025275614");
    assert.equal(marketing.meta.pixelEnabled, true);
    assert.equal(marketing.meta.capiEnabled, false, "CAPI should be off without token");
    assert.ok(!JSON.stringify(marketing).includes("EAAcwRw"), "token must never appear");
    assert.ok(marketing.meta.lastEvents.PageView?.at, "last PageView missing");
    assert.ok(marketing.meta.lastEvents.CompleteRegistration?.at || marketing.funnel.freeSignups >= 1, "registration signal missing");
    assert.ok(marketing.meta.lastEvents.StartTrial?.at, "last StartTrial missing");
    assert.ok(marketing.meta.lastEvents.Purchase?.at, "last Purchase missing");
    assert.ok(Number(marketing.funnel.freeSignups) >= 1);
    assert.ok(Number(marketing.funnel.trialStarts) >= 1);
    assert.ok(Object.keys(marketing.sources || {}).length >= 1 || Number(marketing.funnel.sessionVisits) >= 1);

    assert.ok(marketing.attribution, "attribution dashboard missing");
    assert.ok(Array.isArray(marketing.attribution.rows), "attribution rows missing");
    assert.ok(marketing.attribution.rows.length >= 3, "expected signup/trial/paid attribution rows");
    const facebookRow = marketing.attribution.rows.find((row) => row.source === "Facebook");
    assert.ok(facebookRow, "Facebook attribution row missing");
    assert.equal(facebookRow.campaign, "spring-ads");
    assert.equal(facebookRow.medium, "paid_social");
    assert.ok(facebookRow.landingPage.includes("utm_source=facebook") || facebookRow.landingPage.includes("spring-ads"));
    assert.ok(facebookRow.firstVisitAt, "first visit date missing");
    assert.ok(marketing.attribution.rows.some((row) => row.source === "TikTok"));
    assert.ok(marketing.attribution.rows.some((row) => row.source === "Google"));
    assert.ok((marketing.attribution.filters || []).some((item) => item.id === "organic"));

    assert.ok(marketing.performance, "performance cards missing");
    assert.equal(marketing.performance.spendConfigured, true);
    assert.equal(marketing.performance.costPerSignup, 150);
    assert.ok(Array.isArray(marketing.performance.conversionBySource));
    assert.ok(Array.isArray(marketing.performance.topLandingPages));
    assert.ok((marketing.performance.devices?.Mobile || 0) >= 1);
    assert.ok((marketing.performance.devices?.Desktop || 0) >= 1);
    assert.ok(marketing.performance.avgTimeBeforeSignupLabel, "avg time before signup missing");
    console.log("PASS /api/admin/analytics marketing slice");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }

  if (stderr.includes("FAILED") && !stderr.includes("[admin-analytics]")) {
    console.warn("stderr notes:", stderr.slice(0, 400));
  }
  console.log("All marketing analytics checks passed.");
}

main().catch((error) => {
  console.error("FAIL marketing analytics");
  console.error(error);
  process.exit(1);
});
