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

  const fbOnly = insights.buildInsights(store, { hub: "marketing-funnel", range: "30d", source: "Facebook" });
  assert.equal(fbOnly.data.sourceFilter, "Facebook");
  assert.ok((fbOnly.data.stages.find((s) => s.id === "visitors")?.count || 0) >= 1);

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
  assert.match(fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8"), /\/api\/admin\/insights/);
  console.log("PASS admin-insights wiring");
}

async function main() {
  unit();
  await apiSmoke();
  await wiring();
  console.log("All admin-insights checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
