#!/usr/bin/env node
/**
 * Admin 2.0 insights unit + API smoke tests.
 * Run: npm run test:admin-insights
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const insights = require("../server/admin-insights.js");

const ROOT = path.join(__dirname, "..");

function unit() {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const store = {
    users: {
      "teacher@provider.com": {
        email: "teacher@provider.com",
        firstName: "Tess",
        lastName: "Teacher",
        plan: "Pro",
        subscriptionStatus: "active",
        signupAt: iso(10 * 86400000),
        emailVerified: true,
        emailVerifiedAt: iso(9.5 * 86400000),
        lastLoginAt: iso(3600000),
        lastSeenAt: iso(1800000),
        trialEnd: iso(8.5 * 86400000),
        metaStartTrialAt: iso(9 * 86400000),
        metaPurchaseAt: iso(8 * 86400000),
        attribution: {
          source: "Facebook",
          campaign: "spring",
          medium: "paid_social",
          landingPage: "/?utm_source=facebook",
          firstSeenAt: iso(11 * 86400000),
        },
        featureUsage: { lesson_plan_view: 4 },
      },
    },
    featureRequests: [
      {
        id: "fr1",
        title: "More infant activities",
        description: "Need more infant options",
        category: "Curriculum",
        status: "Planned",
        votes: 3,
        email: "teacher@provider.com",
        createdAt: iso(86400000),
        estimatedRelease: "",
        notifyOnComplete: true,
        adminNotes: [],
      },
    ],
    siteContent: {
      curriculum: {
        lessonPlans: [{ id: "lp1", title: "Back to School", ageGroup: "Preschool", updatedAt: iso(0) }],
        activities: [{ id: "a1", title: "Leaf Sort", ageGroup: "Toddler" }],
      },
    },
    analyticsEvents: [
      { name: "website_visit", sessionId: "s1", visitorId: "v1", createdAt: iso(1000), path: "/?utm_source=facebook", userAgent: "Mozilla/5.0 (iPhone)", attribution: { source: "Facebook", landingPage: "/?utm_source=facebook" } },
      { name: "page_view", sessionId: "s1", visitorId: "v1", createdAt: iso(500), path: "/lessons", detail: { view: "lessons" }, user: "teacher@provider.com", userAgent: "Mozilla/5.0 (iPhone)" },
      { name: "cta_click", sessionId: "s1", visitorId: "v1", createdAt: iso(450), detail: { cta: "start_free", label: "Start Free" }, attribution: { source: "Facebook" } },
      { name: "signup_start", sessionId: "s1", visitorId: "v1", createdAt: iso(440), detail: { source: "auth_modal" } },
      { name: "lesson_plan_view", sessionId: "s1", createdAt: iso(400), detail: { title: "Back to School", lessonId: "lp1" }, user: "teacher@provider.com" },
      { name: "search_no_results", sessionId: "s2", createdAt: iso(300), detail: { query: "halloween toddler", results: 0 } },
      { name: "account_signup_complete", createdAt: iso(200), user: "teacher@provider.com", visitorId: "v1", attribution: { source: "Facebook" } },
      { name: "checkout_success", createdAt: iso(100), user: "teacher@provider.com", detail: { plan: "monthly" } },
      // Bounce visitor: lands from TikTok desktop, views pricing, never CTAs → funnel exit.
      { name: "website_visit", sessionId: "s3", visitorId: "v-bounce", createdAt: iso(900), path: "/?utm_source=tiktok", url: "https://littlelearnershubbyleah.com/?utm_source=tiktok", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", attribution: { source: "TikTok", landingPage: "/?utm_source=tiktok" } },
      { name: "page_view", sessionId: "s3", visitorId: "v-bounce", createdAt: iso(600), path: "/pricing", detail: { view: "pricing" }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", attribution: { source: "TikTok", landingPage: "/?utm_source=tiktok" } },
    ],
    marketingAdSpend: { Facebook: 100, total: 100 },
    emailEngagement: { events: [{ type: "sent", templateId: "welcome", createdAt: iso(50) }], campaigns: {} },
  };

  const advisor = insights.buildInsights(store, { hub: "advisor", range: "30d" });
  assert.equal(advisor.hub, "advisor");
  assert.ok(advisor.data.recommendations.length >= 1);
  assert.ok(advisor.data.summaryLines.some((line) => /signup/i.test(line)));

  const usage = insights.buildInsights(store, { hub: "feature-usage", range: "30d" });
  assert.ok(usage.data.mostViewedLessons.some((r) => r.key === "Back to School"));
  assert.ok(usage.data.searchNoResults.some((r) => r.key === "halloween toddler"));

  const journey = insights.buildInsights(store, { hub: "user-journey", email: "teacher@provider.com" });
  assert.equal(journey.data.found, true);
  assert.ok(journey.data.milestones.some((m) => m.id === "signup" && m.at));
  assert.ok(journey.data.milestones.some((m) => m.id === "paid" && m.at));

  const fr = insights.buildInsights(store, { hub: "feature-requests", sort: "votes" });
  assert.equal(fr.data.items[0].title, "More infant activities");
  assert.equal(fr.data.items[0].statusLabel, "Planned");

  const funnel = insights.buildInsights(store, { hub: "marketing-funnel", range: "30d" });
  assert.equal(funnel.hub, "marketing-funnel");
  assert.ok(funnel.data.stages.some((s) => s.id === "visitors" && s.count >= 1));
  assert.ok(funnel.data.stages.some((s) => s.id === "ctaClicks" && s.count >= 1));
  assert.ok(funnel.data.stages.some((s) => s.id === "signupCompletions" && s.count >= 1));
  assert.ok(funnel.data.stages.some((s) => s.id === "paidConversions" && s.count >= 1));
  assert.ok(funnel.data.stages.some((s) => s.id === "activeSubscribers" && s.count >= 1));
  assert.ok(funnel.data.transitions.length >= 5);
  assert.ok(funnel.data.bySource.some((r) => r.source === "Facebook"));
  assert.ok(funnel.data.topLandingPages.length >= 1);
  assert.ok(funnel.data.deviceBreakdown.some((r) => r.key === "Mobile"));
  assert.equal(funnel.data.costs.costPerSignup, 100);
  assert.ok(funnel.data.stagePeople.visitors?.length >= 1);

  const exitInsights = funnel.data.exitInsights;
  assert.ok(exitInsights, "exitInsights present");
  assert.ok(Array.isArray(exitInsights.exitStages));
  assert.ok(exitInsights.exitStages.some((s) => s.from === "landingPageViews" && s.exitCount >= 1));
  assert.ok(exitInsights.mostCommonExit);
  assert.ok(typeof exitInsights.mostCommonExit.exitCount === "number");
  assert.ok(Array.isArray(exitInsights.topAbandonmentLandingPages));
  assert.ok(exitInsights.topAbandonmentLandingPages.length >= 1);

  const exitDrill = insights.buildInsights(store, {
    hub: "marketing-funnel",
    range: "30d",
    exitStage: "landingPageViews",
  });
  assert.equal(exitDrill.data.exitStageFilter, "landingPageViews");
  const exitPeople = exitDrill.data.exitInsights?.exitPeople?.landingPageViews || [];
  assert.ok(exitPeople.length >= 1, "exit drill-down people");
  assert.ok(exitPeople.some((p) => (p.lastPage || "").includes("pricing") || p.visitorKey === "v-bounce" || !p.email));
  assert.ok(exitPeople.some((p) => p.device === "Desktop" || p.source === "TikTok"));
  assert.ok(exitPeople.every((p) => typeof p.minutesBeforeExitLabel === "string"));

  const fbOnly = insights.buildInsights(store, { hub: "marketing-funnel", range: "30d", source: "Facebook" });
  assert.equal(fbOnly.data.sourceFilter, "Facebook");
  assert.ok((fbOnly.data.stages.find((s) => s.id === "visitors")?.count || 0) >= 1);
  const fbLandExit = (fbOnly.data.exitInsights?.exitStages || []).find((s) => s.from === "landingPageViews");
  assert.ok(!(fbLandExit?.sources || []).some((s) => s.key === "TikTok"), "Facebook filter excludes TikTok exits");

  // Email verification is optional by default — informational, not a drop-off recommendation.
  assert.equal(funnel.data.emailVerificationRequired, false);
  assert.ok(funnel.data.stages.some((s) => s.id === "emailVerified" && s.informational === true));
  assert.ok((funnel.data.transitions || []).some((t) => t.to === "emailVerified" && t.informational === true));
  assert.ok((funnel.data.transitions || []).some((t) => t.from === "emailVerified" && t.informational === true));
  assert.ok(!(funnel.data.exitInsights?.exitStages || []).some((s) => s.to === "emailVerified"),
    "optional email verify is not an exit destination");
  assert.ok(!(funnel.data.worstDropOff && /email verified/i.test(`${funnel.data.worstDropOff.fromLabel} ${funnel.data.worstDropOff.toLabel}`)),
    "worstDropOff ignores optional email verify");
  assert.ok(Array.isArray(funnel.data.advisorTransitions));
  assert.ok(funnel.data.advisorTransitions.some((t) => t.from === "signupCompletions" && t.to === "trialStarts"));
  assert.ok(funnel.data.freeSignupFunnel, "freeSignupFunnel breakdown is attached");
  assert.ok(Array.isArray(funnel.data.freeSignupFunnel.stages));
  assert.equal(funnel.data.freeSignupFunnel.stages[0].id, "homepageVisitors");
  assert.ok(funnel.data.signupStepCounts);

  const advisorRecheck = insights.buildInsights(store, { hub: "advisor", range: "30d" });
  assert.ok(advisorRecheck.data.summaryLines.some((line) => /email verification is optional/i.test(line)));
  assert.ok(!(advisorRecheck.data.recommendations || []).some((r) => /email verified/i.test(`${r.title} ${r.detail}`)),
    "advisor must not recommend fixing optional email verification drop-off");

  // When verification is required, emailVerified becomes actionable again.
  const requiredStore = {
    ...store,
    settings: { emailVerificationRequired: true },
  };
  const requiredFunnel = insights.buildInsights(requiredStore, { hub: "marketing-funnel", range: "30d" });
  assert.equal(requiredFunnel.data.emailVerificationRequired, true);
  assert.ok(requiredFunnel.data.stages.some((s) => s.id === "emailVerified" && s.informational === false));

  console.log("PASS admin-insights unit hubs");
}

function requestJson(port, method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitHealth(port, child) {
  for (let i = 0; i < 50; i += 1) {
    if (child.exitCode != null) throw new Error("server exited");
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function apiSmoke() {
  const storePath = path.join(os.tmpdir(), `llh-insights-${crypto.randomBytes(4).toString("hex")}.json`);
  const port = 19900 + Math.floor(Math.random() * 200);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {},
    analyticsEvents: [],
    featureRequests: [],
    foundingMembers: [],
    siteContent: { curriculum: { lessonPlans: [], activities: [] } },
  }));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@insights.test",
      ADMIN_PASSWORD: "insights-pass",
      ADMIN_ACCESS_CODE: "42424",
      MONITOR_ALERTS_ENABLED: "false",
      MONITOR_CHECK_INTERVAL_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitHealth(port, child);
    assert.equal((await requestJson(port, "GET", "/api/admin/insights?hub=advisor")).status, 401);
    const login = await requestJson(port, "POST", "/api/admin/login", {
      body: { email: "owner@insights.test", password: "insights-pass", code: "42424" },
    });
    assert.equal(login.status, 200, login.text?.slice(0, 200));
    const token = login.json.token || login.json.adminToken;
    const advisor = await requestJson(port, "GET", "/api/admin/insights?hub=advisor&range=7d", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(advisor.status, 200, advisor.text?.slice(0, 300));
    assert.equal(advisor.json.insights.hub, "advisor");
    assert.ok(Array.isArray(advisor.json.insights.data.recommendations));

    const usage = await requestJson(port, "GET", "/api/admin/insights?hub=feature-usage&range=today", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(usage.status, 200);
    assert.ok(usage.json.insights.data.mostUsedPages);

    console.log("PASS admin-insights API smoke");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

async function wiring() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const adminInsightsUi = fs.readFileSync(path.join(ROOT, "admin-insights.js"), "utf8");
  assert.match(appJs, /advisor/);
  assert.match(appJs, /marketing-funnel/);
  assert.match(appJs, /feature-requests-center/);
  assert.match(appJs, /search_no_results/);
  assert.match(appJs, /cta_click/);
  assert.match(appJs, /signup_start/);
  assert.match(appJs, /id:\s*"insights"[\s\S]*label:\s*"Insights"/);
  assert.match(indexHtml, /admin-insights\.js/);
  assert.match(indexHtml, /adminInsightsApp/);
  assert.match(adminInsightsUi, /AI Business Advisor/);
  assert.match(adminInsightsUi, /marketing-funnel/);
  assert.match(adminInsightsUi, /admin-insights-funnel-bar/);
  assert.match(adminInsightsUi, /Why They Left/);
  assert.match(adminInsightsUi, /data-funnel-exit-stage/);
  assert.match(adminInsightsUi, /Email verification is optional/);
  assert.match(adminInsightsUi, /is-informational/);
  assert.match(adminInsightsUi, /Largest drop-off/);
  assert.match(adminInsightsUi, /Unavailable/);
  assert.match(adminInsightsUi, /FREE SIGNUP FUNNEL/);
  assert.match(adminInsightsUi, /renderFreeSignupFunnel/);
  assert.match(fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8"), /\/api\/admin\/insights/);
  assert.match(fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8"), /exitStage/);
  assert.match(fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8"), /analyticsRevenue\.collectRevenueItems/);
  console.log("PASS admin-insights wiring");
}

function phase1Trust() {
  const revenue = require("../server/analytics-revenue.js");
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  // Drop-off math honesty
  const drop10to4 = insights.buildTransitionRow(
    { id: "signupCompletions", label: "Signup completed", count: 10 },
    { id: "trialStarts", label: "Trial started", count: 4 },
  );
  assert.equal(drop10to4.dropOffCount, 6);
  assert.equal(drop10to4.dropOffRate, 60);
  assert.equal(drop10to4.dropOffRateLabel, "60.0%");
  assert.equal(drop10to4.conversionRate, 40);

  const dropSame = insights.buildTransitionRow(
    { id: "a", label: "A", count: 10 },
    { id: "b", label: "B", count: 10 },
  );
  assert.equal(dropSame.dropOffCount, 0);
  assert.equal(dropSame.dropOffRate, 0);
  assert.equal(dropSame.dropOffRateLabel, "0.0%");

  const dropZero = insights.buildTransitionRow(
    { id: "a", label: "A", count: 0 },
    { id: "b", label: "B", count: 0 },
  );
  assert.equal(dropZero.dropOffRate, 0);
  assert.equal(dropZero.conversionRate, 0);
  assert.equal(dropZero.dropOffRateLabel, "0%");

  // ---------------------------------------------------------------------------
  // Revenue fixtures (1–7) — exact createdAt twin key only
  // ---------------------------------------------------------------------------
  const twinAt = iso(1000);
  const t1 = revenue.collectRevenueItems(
    [{
      id: "evt_pay_1",
      name: "checkout_success",
      user: "payer@provider.com",
      createdAt: twinAt,
      detail: { monthlyPrice: 13.99 },
      amount: 13.99,
    }],
    [{
      id: "bill_1",
      email: "payer@provider.com",
      type: "checkout_success",
      amount: 13.99,
      createdAt: twinAt,
    }],
  );
  assert.equal(revenue.sumRevenueAmount(t1), 13.99, "fixture1 twin → $13.99");

  const t2a = iso(2000);
  const t2b = iso(3000);
  const t2 = revenue.collectRevenueItems(
    [
      { id: "a1", name: "checkout_success", user: "payer@provider.com", createdAt: t2a, amount: 13.99 },
      { id: "a2", name: "checkout_success", user: "payer@provider.com", createdAt: t2b, amount: 13.99 },
    ],
    [
      { id: "b1", email: "payer@provider.com", type: "checkout_success", amount: 13.99, createdAt: t2a },
      { id: "b2", email: "payer@provider.com", type: "checkout_success", amount: 13.99, createdAt: t2b },
    ],
  );
  assert.equal(revenue.sumRevenueAmount(t2), 27.98, "fixture2 two distinct timestamps → $27.98");

  const sharedTs = iso(4000);
  const t3 = revenue.collectRevenueItems(
    [
      { id: "e1", name: "checkout_success", user: "one@provider.com", createdAt: sharedTs, amount: 10 },
      { id: "e2", name: "checkout_success", user: "two@provider.com", createdAt: sharedTs, amount: 10 },
    ],
    [
      { id: "bb1", email: "one@provider.com", type: "checkout_success", amount: 10, createdAt: sharedTs },
      { id: "bb2", email: "two@provider.com", type: "checkout_success", amount: 10, createdAt: sharedTs },
    ],
  );
  assert.equal(revenue.sumRevenueAmount(t3), 20, "fixture3 different emails same timestamp both count");

  const t4 = revenue.collectRevenueItems(
    [{ id: "e", name: "checkout_success", user: "same@provider.com", createdAt: iso(5000), amount: 13.99 }],
    [{ id: "b", email: "same@provider.com", type: "checkout_success", amount: 13.99, createdAt: iso(6000) }],
  );
  assert.equal(revenue.sumRevenueAmount(t4), 27.98, "fixture4 same email/amount different timestamps both count");

  const t5 = revenue.collectRevenueItems(
    [],
    [
      { email: "x@provider.com", type: "subscription_canceled", amount: 19.99, createdAt: twinAt },
      { email: "x@provider.com", type: "payment_failed", amount: 19.99, createdAt: twinAt },
      { email: "ok@provider.com", type: "checkout_success", amount: 9.99, createdAt: twinAt },
    ],
  );
  assert.equal(revenue.sumRevenueAmount(t5), 9.99, "fixture5 cancel/fail excluded");

  const t6 = revenue.collectRevenueItems(
    [{ id: "only_a", name: "checkout_success", user: "analytics@provider.com", createdAt: iso(7000), amount: 13.99 }],
    [],
  );
  assert.equal(revenue.sumRevenueAmount(t6), 13.99, "fixture6 analytics-only counts once");

  const t7 = revenue.collectRevenueItems(
    [],
    [{ id: "only_b", email: "billing@provider.com", type: "checkout_success", amount: 13.99, createdAt: iso(8000) }],
  );
  assert.equal(revenue.sumRevenueAmount(t7), 13.99, "fixture7 billing-only counts once");

  // Prove recordBillingEvent copies analytics createdAt (source invariant for twin key).
  const indexJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(
    indexJs,
    /function recordBillingEvent[\s\S]*?createdAt:\s*event\.createdAt\s*\|\|\s*new Date\(\)\.toISOString\(\)/,
  );
  assert.match(indexJs, /if \(billingStorePatch\) recordBillingEvent\(store, event\);/);
  assert.match(
    indexJs,
    /function appendBillingEvent[\s\S]*?createdAt:\s*new Date\(\)\.toISOString\(\)/,
    "appendBillingEvent uses independent timestamps (not twin-guaranteed)",
  );

  // Open feature requests exclude Completed / Declined (canonical FEATURE_REQUEST_STATUSES)
  const frStore = {
    featureRequests: [
      { id: "1", title: "A", status: "New", votes: 1 },
      { id: "2", title: "B", status: "Planned", votes: 2 },
      { id: "3", title: "C", status: "In Progress", votes: 3 },
      { id: "4", title: "D", status: "Completed", votes: 4 },
      { id: "5", title: "E", status: "Declined", votes: 5 },
      { id: "6", title: "F", status: "Under Review", votes: 1 },
      { id: "7", title: "G", status: "completed", votes: 1 },
      { id: "8", title: "H", status: "COMPLETED", votes: 1 },
    ],
    users: {},
    analyticsEvents: [],
  };
  assert.equal(insights.countOpenFeatureRequests(frStore), 4);
  assert.equal(insights.isOpenFeatureRequestStatus("Completed"), false);
  assert.equal(insights.isOpenFeatureRequestStatus("completed"), false);
  assert.equal(insights.isOpenFeatureRequestStatus("Planned"), true);
  assert.deepEqual(
    [...insights.CLOSED_FEATURE_REQUEST_STATUSES].sort(),
    ["archived", "completed", "declined", "rejected", "released"].sort(),
  );
  const commsLib = require("../server/comms-lib.js");
  assert.deepEqual(
    [...commsLib.FEATURE_REQUEST_STATUSES],
    ["New", "Under Review", "Planned", "In Progress", "Completed", "Declined"],
  );

  // Canonical Advisor ↔ Funnel signup / paid / visitors; no today fallback on empty 7d
  const oldVisit = iso(10 * 86400000);
  const parityStore = {
    users: {
      "new@provider.com": {
        email: "new@provider.com",
        signupAt: iso(2 * 86400000),
        createdAt: iso(2 * 86400000),
        metaPurchaseAt: iso(1 * 86400000),
        firstPaidInvoiceAt: iso(1 * 86400000),
        plan: "Pro",
        subscriptionStatus: "active",
        attribution: { source: "Direct", landingPage: "/" },
      },
    },
    featureRequests: frStore.featureRequests,
    analyticsEvents: [
      // Only an old visit — outside 7d so visitors in 7d should be 0 (not today's fallback).
      {
        name: "website_visit",
        sessionId: "old",
        visitorId: "v-old",
        createdAt: oldVisit,
        path: "/",
      },
      // Refresh duplicates same visitor today — unique visitor count stays 1 if in range.
    ],
    siteContent: { curriculum: { lessonPlans: [], activities: [] } },
  };

  const empty7dAdvisor = insights.buildInsights(parityStore, {
    hub: "advisor",
    range: "7d",
    marketing: { realtime: { sessionVisitsToday: 122 } },
  });
  const empty7dFunnel = insights.buildInsights(parityStore, { hub: "marketing-funnel", range: "7d" });
  assert.equal(empty7dAdvisor.data.metrics.visitors, 0, "7d visitors stay 0 (no Today fallback)");
  assert.equal(
    empty7dAdvisor.data.metrics.visitors,
    empty7dFunnel.data.stages.find((s) => s.id === "visitors").count,
  );
  assert.ok(!empty7dAdvisor.data.summaryLines.some((line) => /122/.test(line)));

  // Signup + paid from user stamps (no checkout_success / signup events) — Advisor matches Funnel
  const stampAdvisor = insights.buildInsights(parityStore, { hub: "advisor", range: "30d" });
  const stampFunnel = insights.buildInsights(parityStore, { hub: "marketing-funnel", range: "30d" });
  const funnelSignups = stampFunnel.data.stages.find((s) => s.id === "signupCompletions").count;
  const funnelPaid = stampFunnel.data.stages.find((s) => s.id === "paidConversions").count;
  assert.equal(stampAdvisor.data.metrics.signups, funnelSignups);
  assert.equal(stampAdvisor.data.metrics.paid, funnelPaid);
  assert.equal(stampAdvisor.data.metrics.signups, 1);
  assert.equal(stampAdvisor.data.metrics.paid, 1);

  // Canonical KPI equality across Insights ranges (visitors / signups / paid)
  const rangeParityStore = {
    users: {
      "range@provider.com": {
        email: "range@provider.com",
        signupAt: iso(2 * 3600000),
        createdAt: iso(2 * 3600000),
        metaPurchaseAt: iso(3600000),
        firstPaidInvoiceAt: iso(3600000),
        plan: "Pro",
        subscriptionStatus: "active",
        attribution: { source: "Direct", landingPage: "/" },
      },
    },
    featureRequests: [],
    analyticsEvents: [
      {
        name: "website_visit",
        sessionId: "r1",
        visitorId: "v-range",
        createdAt: iso(3 * 3600000),
        path: "/",
      },
      {
        name: "website_visit",
        sessionId: "r1b",
        visitorId: "v-range",
        createdAt: iso(2.5 * 3600000),
        path: "/",
      },
    ],
    siteContent: { curriculum: { lessonPlans: [], activities: [] } },
  };
  for (const range of ["today", "7d", "30d", "all"]) {
    const advisor = insights.buildInsights(rangeParityStore, {
      hub: "advisor",
      range,
      marketing: { realtime: { sessionVisitsToday: 999 } },
    });
    const funnel = insights.buildInsights(rangeParityStore, { hub: "marketing-funnel", range });
    const visitors = funnel.data.stages.find((s) => s.id === "visitors").count;
    const signups = funnel.data.stages.find((s) => s.id === "signupCompletions").count;
    const paid = funnel.data.stages.find((s) => s.id === "paidConversions").count;
    assert.equal(advisor.data.metrics.visitors, visitors, `visitors parity ${range}`);
    assert.equal(advisor.data.metrics.signups, signups, `signups parity ${range}`);
    assert.equal(advisor.data.metrics.paid, paid, `paid parity ${range}`);
    assert.ok(!advisor.data.summaryLines.some((line) => /999/.test(line)), `no today fallback ${range}`);
  }

  // Empty today stays zero (no fallback)
  const emptyToday = insights.buildInsights(
    { users: {}, featureRequests: [], analyticsEvents: [] },
    { hub: "advisor", range: "today", marketing: { realtime: { sessionVisitsToday: 50 } } },
  );
  assert.equal(emptyToday.data.metrics.visitors, 0);
  assert.equal(emptyToday.data.metrics.signups, 0);
  assert.equal(emptyToday.data.metrics.paid, 0);

  // Paid event + matching user stamp still counts once
  const paidUnionStore = {
    ...parityStore,
    analyticsEvents: [
      ...(parityStore.analyticsEvents || []),
      {
        name: "checkout_success",
        user: "new@provider.com",
        createdAt: iso(1 * 86400000),
        detail: { plan: "monthly" },
      },
    ],
  };
  const paidAdvisor = insights.buildInsights(paidUnionStore, { hub: "advisor", range: "30d" });
  const paidFunnel = insights.buildInsights(paidUnionStore, { hub: "marketing-funnel", range: "30d" });
  assert.equal(paidAdvisor.data.metrics.paid, 1);
  assert.equal(paidAdvisor.data.metrics.paid, paidFunnel.data.stages.find((s) => s.id === "paidConversions").count);

  // Drop-off wording
  assert.ok(
    stampAdvisor.data.summaryLines.some((line) => /Largest drop-off:/.test(line) && /drop-off\)/.test(line))
      || !stampAdvisor.data.summaryLines.some((line) => /Largest drop-off:/.test(line)),
    "drop-off lines must say drop-off when present",
  );
  // Force a drop-off summary with known edge
  const dropStore = {
    users: {},
    featureRequests: [],
    analyticsEvents: Array.from({ length: 10 }, (_, i) => ({
      name: "website_visit",
      visitorId: `v${i}`,
      sessionId: `s${i}`,
      createdAt: iso(1000 + i),
      path: "/",
    })).concat(
      Array.from({ length: 10 }, (_, i) => ({
        name: "account_signup_complete",
        user: `u${i}@provider.com`,
        visitorId: `v${i}`,
        createdAt: iso(500 + i),
      })),
    ),
  };
  // Add user signup stamps without trials → 100% drop signup→trial
  dropStore.users = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      `u${i}@provider.com`,
      {
        email: `u${i}@provider.com`,
        signupAt: iso(500 + i),
        createdAt: iso(500 + i),
      },
    ]),
  );
  const dropAdvisor = insights.buildInsights(dropStore, { hub: "advisor", range: "7d" });
  const dropLine = dropAdvisor.data.summaryLines.find((line) => /Largest drop-off:/.test(line));
  assert.ok(dropLine, "expected largest drop-off summary line");
  assert.match(dropLine, /drop-off\)/);
  assert.doesNotMatch(dropLine, /^Biggest Opportunity:/);

  // Open requests KPI
  assert.equal(stampAdvisor.data.metrics.openFeatureRequests, 4);

  // Search active_empty (not instrumentation missing)
  const searchEmpty = insights.buildSearchAnalytics({ users: {} }, [], insights.parseRange("7d"));
  assert.equal(searchEmpty.instrumentation, "active_empty");
  assert.match(searchEmpty.note, /no tracked searches occurred/i);
  assert.doesNotMatch(searchEmpty.note, /instrumentation is pending/i);

  const searchAdvisor = insights.buildInsights(
    { users: {}, featureRequests: [], analyticsEvents: [] },
    { hub: "advisor", range: "7d" },
  );
  assert.ok(searchAdvisor.data.summaryLines.some((line) => /Search tracking is active for library search/i.test(line)));
  assert.ok(!searchAdvisor.data.summaryLines.some((line) => /waiting on search event instrumentation/i.test(line)));

  // Email honesty
  const email = insights.buildEmailAnalytics({
    emailEngagement: { events: [{ type: "sent", templateId: "welcome" }], campaigns: {} },
  });
  assert.equal(email.totals.delivered, null);
  assert.equal(email.totals.openRate, null);
  assert.equal(email.totals.clickRate, null);
  assert.equal(email.totals.sent, 1);
  assert.equal(email.totals.sentWithoutImmediateFailure, 1);
  assert.notEqual(email.totals.delivered, 0);
  assert.notEqual(email.totals.openRate, "0%");
  assert.notEqual(email.totals.clickRate, "0%");
  // Measured zero open rate when receipts exist but none opened
  const emailZero = insights.buildEmailAnalytics({
    freeUserWelcomeEmail: {
      recipientReceipts: {
        a: { email: "a@provider.com", sentAt: iso(10), openedAt: "", clickedAt: "" },
      },
    },
  });
  assert.equal(emailZero.totals.openRate, "0.0%");
  assert.equal(emailZero.totals.clickRate, "0.0%");
  assert.equal(emailZero.totals.delivered, null);
  // UI maps null delivered → "Unavailable" (not 0)
  const adminUi = fs.readFileSync(path.join(ROOT, "admin-insights.js"), "utf8");
  assert.match(adminUi, /t\.delivered == null \? "Unavailable" : t\.delivered/);
  assert.match(adminUi, /t\.openRate \?\? "Unavailable"/);

  // Trial starts unchanged: stamp-based
  const trialStore = {
    users: {
      "trial@provider.com": {
        email: "trial@provider.com",
        signupAt: iso(3 * 86400000),
        metaStartTrialAt: iso(2 * 86400000),
        trialStart: iso(2 * 86400000),
      },
    },
    featureRequests: [],
    analyticsEvents: [],
  };
  const trialAdvisor = insights.buildInsights(trialStore, { hub: "advisor", range: "7d" });
  assert.equal(trialAdvisor.data.metrics.trials, 1);

  console.log("PASS admin-insights phase1 trust");
}

async function main() {
  unit();
  phase1Trust();
  await apiSmoke();
  await wiring();
  console.log("All admin-insights checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
