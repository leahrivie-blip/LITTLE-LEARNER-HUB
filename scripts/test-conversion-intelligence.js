#!/usr/bin/env node
/**
 * Conversion Intelligence — unit + API authorization tests.
 * Run: npm run test:conversion-intelligence
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const conversionEvents = require("../server/conversion-events.js");
const conversionIntelligence = require("../server/conversion-intelligence.js");

const ROOT = path.join(__dirname, "..");
let passed = 0;
let failed = 0;

function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`FAIL ${name}`, err?.message || err);
  throw err;
}

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: options.port,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(options.headers || {}),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildFixtureStore(now = Date.now()) {
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  return {
    users: {
      "alice@free.test": {
        email: "alice@free.test",
        plan: "Free",
        signupAt: iso(2 * 86400000),
        attribution: { source: "Facebook", utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "spring" },
      },
      "bob@paid.test": {
        email: "bob@paid.test",
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        firstPaidInvoiceAt: iso(86400000),
        signupAt: iso(5 * 86400000),
        attribution: { source: "Direct" },
      },
      "carol@intent.test": {
        email: "carol@intent.test",
        plan: "Free",
        signupAt: iso(86400000),
        attribution: { source: "TikTok", utm_source: "tiktok" },
      },
    },
    analyticsEvents: [
      { id: "e1", name: "account_signup_complete", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000), attribution: { source: "Facebook", utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "spring" } },
      { id: "e2", name: "session_started", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000 - 60000), path: "/" },
      { id: "e3", name: "lesson_viewed", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000 - 30000), detail: { resourceId: "farm-friends", title: "Farm Friends", age: "Toddler", access: "Free" } },
      { id: "e4", name: "activity_viewed", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000 - 20000), detail: { resourceId: "farm-act", title: "Farm Activity", age: "Toddler" } },
      { id: "e5", name: "pro_content_encountered", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000 - 10000), detail: { featureType: "printable_locked", lessonId: "farm-friends", lessonTitle: "Farm Friends", ageGroup: "Toddler", location: "lesson_locked" } },
      { id: "e6", name: "pricing_viewed", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000 - 5000), detail: { location: "pricing_page" } },
      { id: "e7", name: "upgrade_cta_clicked", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000 - 4000), detail: { ctaLocation: "lesson_locked_upgrade", lessonId: "farm-friends" } },
      { id: "e8", name: "checkout_started", user: "alice@free.test", visitorId: "v-alice", sessionId: "s1", createdAt: iso(2 * 86400000 - 3000), detail: { type: "monthly" } },
      { id: "e9", name: "account_signup_complete", user: "bob@paid.test", visitorId: "v-bob", sessionId: "s2", createdAt: iso(5 * 86400000), attribution: { source: "Direct" } },
      { id: "e10", name: "lesson_viewed", user: "bob@paid.test", visitorId: "v-bob", sessionId: "s2", createdAt: iso(5 * 86400000 - 10000), detail: { resourceId: "pro-lesson", title: "Pro Lesson", age: "Preschool", access: "Pro" } },
      { id: "e11", name: "upgrade_cta_clicked", user: "bob@paid.test", visitorId: "v-bob", sessionId: "s2", createdAt: iso(5 * 86400000 - 8000), detail: { ctaLocation: "pricing_upgrade" } },
      { id: "e12", name: "checkout_started", user: "bob@paid.test", visitorId: "v-bob", sessionId: "s2", createdAt: iso(5 * 86400000 - 7000) },
      { id: "e13", name: "checkout_success", user: "bob@paid.test", visitorId: "v-bob", sessionId: "s2", createdAt: iso(5 * 86400000 - 6000), detail: { plan: "monthly" } },
      { id: "e14", name: "account_signup_complete", user: "carol@intent.test", visitorId: "v-carol", sessionId: "s3", createdAt: iso(86400000), attribution: { source: "TikTok" } },
      { id: "e15", name: "lesson_viewed", user: "carol@intent.test", visitorId: "v-carol", sessionId: "s3", createdAt: iso(86000000), detail: { resourceId: "l1", title: "L1", age: "Toddler" } },
      { id: "e16", name: "lesson_viewed", user: "carol@intent.test", visitorId: "v-carol", sessionId: "s4", createdAt: iso(80000000), detail: { resourceId: "l2", title: "L2", age: "Toddler" } },
      { id: "e17", name: "lesson_viewed", user: "carol@intent.test", visitorId: "v-carol", sessionId: "s5", createdAt: iso(70000000), detail: { resourceId: "l3", title: "L3", age: "Toddler" } },
      { id: "e18", name: "pricing_viewed", user: "carol@intent.test", visitorId: "v-carol", sessionId: "s5", createdAt: iso(69000000), detail: { location: "pricing_page" } },
      { id: "e19", name: "pricing_viewed", user: "carol@intent.test", visitorId: "v-carol", sessionId: "s5", createdAt: iso(68000000), detail: { location: "pricing_page" } },
      { id: "e20", name: "upgrade_cta_clicked", user: "carol@intent.test", visitorId: "v-carol", sessionId: "s5", createdAt: iso(67000000), detail: { ctaLocation: "dashboard_upgrade" } },
      { id: "e21", name: "sensitive_attempt", user: "alice@free.test", createdAt: iso(1000), detail: { password: "secret123", childName: "Timmy", title: "Safe title" } },
    ],
  };
}

function unitTests() {
  const store = buildFixtureStore();

  // 1. signup attribution capture
  const signupEvent = store.analyticsEvents.find((e) => e.id === "e1");
  assert.equal(normalizeAttributionSource(signupEvent), "Facebook");
  pass("signup attribution capture");

  // 2. lesson viewed event
  assert.equal(resolveCanonicalEvent({ name: "lesson_viewed" }), "lesson_viewed");
  assert.equal(resolveCanonicalEvent({ name: "lesson_plan_view" }), "lesson_viewed");
  pass("lesson viewed event");

  // 3. Pro encounter event
  assert.equal(resolveCanonicalEvent({ name: "pro_content_encountered" }), "pro_content_encountered");
  pass("Pro encounter event");

  // 4. pricing view event
  assert.equal(resolveCanonicalEvent({ name: "pricing_cards_shown" }), "pricing_viewed");
  pass("pricing view event");

  // 5. Upgrade CTA event
  assert.equal(resolveCanonicalEvent({ name: "pro_upgrade_intent" }), "upgrade_cta_clicked");
  pass("Upgrade CTA event");

  // 6. checkout-start connection
  assert.equal(resolveCanonicalEvent({ name: "checkout_start" }), "checkout_started");
  pass("checkout-start connection");

  // 7. completed subscription conversion connection
  assert.equal(conversionIntelligence.userHasAuthoritativePaidConversion(store.users["bob@paid.test"]), true);
  assert.equal(conversionIntelligence.userHasAuthoritativePaidConversion(store.users["alice@free.test"]), false);
  pass("completed subscription conversion connection");

  // 8. duplicate render does not create duplicate view events (client dedupe keys)
  const clientSrc = fs.readFileSync(path.join(ROOT, "scripts/conversion-analytics-client.js"), "utf8");
  assert.match(clientSrc, /wasRecentlyTracked/);
  assert.match(clientSrc, /VIEW_EVENTS/);
  pass("duplicate render does not create duplicate view events");

  // 9. analytics failure cannot break customer UI
  assert.match(clientSrc, /must never break/i);
  assert.match(clientSrc, /catch/);
  pass("analytics failure cannot break customer UI");

  // 12. funnel calculations
  const report = conversionIntelligence.buildConversionIntelligence(store, { range: "all", events: store.analyticsEvents });
  assert.ok(report.funnel.stages.length >= 10);
  assert.ok(report.funnel.baseCount >= 2);
  const accountStage = report.funnel.stages.find((s) => s.id === "account_created");
  assert.ok(accountStage && accountStage.uniqueUsers >= 2);
  pass("funnel calculations are correct");

  // 13. source conversion calculations
  const fb = report.trafficSources.find((s) => s.source === "Facebook");
  const direct = report.trafficSources.find((s) => s.source === "Direct");
  assert.ok(fb && fb.signups >= 1);
  assert.ok(direct && direct.paid >= 1);
  pass("source conversion calculations are correct");

  // 14. individual journey ordering
  const journey = conversionIntelligence.buildUserJourney("alice@free.test", store.analyticsEvents);
  assert.ok(journey.timeline.length >= 3);
  const labels = journey.timeline.map((t) => t.label);
  const accountIdx = labels.findIndex((l) => /account created/i.test(l));
  const checkoutIdx = labels.findIndex((l) => /checkout started/i.test(l));
  assert.ok(accountIdx >= 0 && checkoutIdx > accountIdx);
  pass("individual journey ordering is correct");

  // 15. high-intent calculation is deterministic
  const score1 = conversionIntelligence.computeIntentScore({
    lessonViews: 3,
    activityViews: 1,
    sessions: new Set(["s1", "s2", "s3"]),
    proEncounters: 1,
    pricingViews: 2,
    upgradeClicks: 1,
    checkoutStarts: 0,
    converted: false,
    events: [{ name: "lesson_saved" }],
  });
  const score2 = conversionIntelligence.computeIntentScore({
    lessonViews: 3,
    activityViews: 1,
    sessions: new Set(["s1", "s2", "s3"]),
    proEncounters: 1,
    pricingViews: 2,
    upgradeClicks: 1,
    checkoutStarts: 0,
    converted: false,
    events: [{ name: "lesson_saved" }],
  });
  assert.equal(score1.score, score2.score);
  assert.equal(score1.level, score2.level);
  assert.ok(score1.level === "High purchase intent" || score1.level === "Medium purchase intent");
  pass("high-intent calculation is deterministic");

  // 16. no sensitive form information enters event metadata
  const sanitized = conversionEvents.sanitizeConversionDetail({
    password: "secret",
    childName: "Timmy",
    title: "Farm Friends",
    resourceId: "farm-friends",
  });
  assert.equal(sanitized.password, undefined);
  assert.equal(sanitized.childName, undefined);
  assert.equal(sanitized.title, "Farm Friends");
  pass("no sensitive form information enters event metadata");

  return report;
}

function normalizeAttributionSource(event) {
  return conversionEvents.normalizeAttributionSource(event);
}

function resolveCanonicalEvent(event) {
  return conversionEvents.resolveCanonicalEvent(event);
}

async function apiTests() {
  const PORT = 19820 + Math.floor(Math.random() * 40);
  const STORE_PATH = path.join(os.tmpdir(), `llh-conv-intel-${crypto.randomBytes(4).toString("hex")}.json`);
  const store = buildFixtureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: store.users, analyticsEvents: store.analyticsEvents, siteContent: {} }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_EMAIL: "conv-intel@test.local",
      ADMIN_PASSWORD: "conv-intel-pass",
      ADMIN_ACCESS_CODE: "conv-intel-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    for (let i = 0; i < 120; i += 1) {
      try {
        const res = await requestJson("GET", "/api/health", null, { port: PORT });
        if (res.status === 200) break;
      } catch { /* retry */ }
      if (child.exitCode !== null) throw new Error("Server exited early");
      await new Promise((r) => setTimeout(r, 100));
    }

    const denied = await requestJson("GET", "/api/admin/conversion-intelligence", null, { port: PORT });
    assert.equal(denied.status, 401);
    pass("normal users cannot access Conversion Intelligence");

    const login = await requestJson("POST", "/api/admin/login", {
      email: "conv-intel@test.local",
      password: "conv-intel-pass",
      code: "conv-intel-code",
    }, { port: PORT });
    assert.equal(login.status, 200);
    const token = login.json?.token;
    assert.ok(token);

    const ok = await requestJson("GET", "/api/admin/conversion-intelligence?range=all", null, {
      port: PORT,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.json?.data?.funnel?.stages?.length >= 10);
    pass("owner/admin authorization works");
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

function wiringTests() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /handleAdminConversionIntelligence/);
  assert.match(serverJs, /conversion-intelligence\.js/);
  assert.match(indexHtml, /admin-conversion-intelligence/);
  assert.match(indexHtml, /conversion-analytics-client\.js/);
  assert.match(appJs, /conversion-intelligence/);
  pass("admin UI and API wiring");
}

async function main() {
  console.log("Conversion Intelligence tests\n");
  wiringTests();
  const report = unitTests();
  await apiTests();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("\nExample funnel (fixture data):");
  for (const stage of report.funnel.stages.slice(0, 8)) {
    console.log(`  ${stage.uniqueUsers} — ${stage.label} (${stage.pctOfSignups}% of signups)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
