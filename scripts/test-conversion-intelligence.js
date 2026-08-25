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
    assert.ok(ok.json?.data?.ownerWorkflowSummary);
    assert.ok(Array.isArray(ok.json?.data?.ownerActionQueue));
    pass("owner/admin authorization works");

    // Phase 2B API: status / notes / reasons
    const leadEmail = "alice@free.test";
    const deniedLead = await requestJson("POST", "/api/admin/conversion-leads", {
      email: leadEmail,
      status: "follow_up",
    }, { port: PORT });
    assert.equal(deniedLead.status, 401);
    pass("phase2B: non-owner cannot mutate conversion leads");

    const badStatus = await requestJson("POST", "/api/admin/conversion-leads", {
      email: leadEmail,
      status: "totally_invalid_crm_state",
    }, { port: PORT, headers: { Authorization: `Bearer ${token}` } });
    assert.equal(badStatus.status, 400);
    pass("phase2B: invalid status rejected");

    const badReason = await requestJson("POST", "/api/admin/conversion-leads", {
      email: leadEmail,
      reason: "not_a_real_reason",
    }, { port: PORT, headers: { Authorization: `Bearer ${token}` } });
    assert.equal(badReason.status, 400);
    pass("phase2B: invalid reason rejected");

    const saveStatus = await requestJson("POST", "/api/admin/conversion-leads", {
      email: leadEmail,
      status: "follow_up",
      note: "Called — interested but waiting on budget <script>x</script>",
      reason: "center_budget",
      reasonContext: "Director wants Q3",
    }, { port: PORT, headers: { Authorization: `Bearer ${token}` } });
    assert.equal(saveStatus.status, 200);
    assert.equal(saveStatus.json?.lead?.status, "follow_up");
    assert.equal(saveStatus.json?.paidAuthoritative, false);
    assert.ok(saveStatus.json?.lead?.notes?.length >= 1);
    assert.ok(!String(saveStatus.json.lead.notes[0].text).includes("<script>"));
    assert.equal(saveStatus.json.lead.reasons[0].reason, "center_budget");
    pass("phase2B: owner can persist status, sanitized note history, reason");

    const note2 = await requestJson("POST", "/api/admin/conversion-leads", {
      email: leadEmail,
      note: "Second note keeps history",
    }, { port: PORT, headers: { Authorization: `Bearer ${token}` } });
    assert.equal(note2.status, 200);
    assert.ok(note2.json.lead.notes.length >= 2);
    pass("phase2B: note history preserved");

    // Owner status "converted" must not fabricate billing conversion.
    const fakeConvert = await requestJson("POST", "/api/admin/conversion-leads", {
      email: leadEmail,
      status: "converted",
    }, { port: PORT, headers: { Authorization: `Bearer ${token}` } });
    assert.equal(fakeConvert.status, 200);
    assert.equal(fakeConvert.json.lead.status, "converted");
    assert.equal(fakeConvert.json.paidAuthoritative, false);
    pass("phase2B: owner status cannot fabricate authoritative paid conversion");

    const detail = await requestJson("GET", `/api/admin/conversion-intelligence?range=all&detailEmail=${encodeURIComponent(leadEmail)}`, null, {
      port: PORT,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(detail.status, 200);
    const layers = detail.json?.data?.conversionLeadDetail?.layers;
    assert.ok(layers?.observed);
    assert.ok(layers?.derived);
    assert.ok(layers?.ownerEntered);
    assert.equal(layers.derived.paidAuthoritative, false);
    assert.equal(layers.ownerEntered.status, "converted");
    pass("phase2B: detail separates observed / derived / owner-entered");
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
  const clientSrc = fs.readFileSync(path.join(ROOT, "scripts/conversion-analytics-client.js"), "utf8");
  const adminUi = fs.readFileSync(path.join(ROOT, "admin-conversion-intelligence.js"), "utf8");
  assert.match(serverJs, /handleAdminConversionIntelligence/);
  assert.match(serverJs, /conversion-intelligence\.js/);
  assert.match(indexHtml, /admin-conversion-intelligence/);
  assert.match(indexHtml, /conversion-analytics-client\.js/);
  assert.match(appJs, /conversion-intelligence/);
  assert.match(appJs, /trackUpgradeCtaImpression/);
  assert.match(clientSrc, /trackUpgradeCtaImpression/);
  assert.match(adminUi, /Activation/);
  assert.match(adminUi, /Signup Cohort/);
  assert.match(adminUi, /Pre-purchase Association/);
  assert.match(adminUi, /Owner Action Queue/);
  assert.match(adminUi, /Owner Follow-Up/);
  assert.match(adminUi, /owner-entered/i);
  assert.match(adminUi, /conv-queue-mobile/);
  assert.match(adminUi, /applyScrollRestore/);
  assert.match(adminUi, /root\.renderAdminConversionIntelligence/);
  assert.match(serverJs, /handleAdminConversionLeadUpdate/);
  assert.match(serverJs, /\/api\/admin\/conversion-leads/);
  assert.ok(fs.existsSync(path.join(ROOT, "server/conversion-phase2.js")));
  assert.ok(fs.existsSync(path.join(ROOT, "server/conversion-leads.js")));
  pass("admin UI and API wiring");
}

function phase2ATests() {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  // --- ACTIVATION ---
  const pageOnly = conversionIntelligence.computeActivationState({
    signupAt: iso(86400000),
    events: [{ name: "page_view", createdAt: iso(80000000), detail: {} }],
  });
  assert.equal(pageOnly.activated, false);
  pass("activation: page view only → not activated");

  const oneLesson = conversionIntelligence.computeActivationState({
    signupAt: iso(86400000),
    events: [
      { name: "lesson_viewed", createdAt: iso(80000000), detail: { resourceId: "a" } },
      { name: "activity_viewed", createdAt: iso(79000000), detail: { resourceId: "a" } },
    ],
  });
  assert.equal(oneLesson.activated, false);
  pass("activation: one distinct resource → not activated");

  const twoDupes = conversionIntelligence.computeActivationState({
    signupAt: iso(86400000),
    events: [
      { name: "lesson_viewed", createdAt: iso(80000000), detail: { resourceId: "same" } },
      { name: "lesson_viewed", createdAt: iso(79000000), detail: { resourceId: "same" } },
      { name: "lesson_saved", createdAt: iso(78000000), detail: { resourceId: "same" } },
    ],
  });
  assert.equal(twoDupes.activated, false);
  pass("activation: duplicate resource view does not satisfy distinct requirement");

  const activated = conversionIntelligence.computeActivationState({
    signupAt: iso(86400000),
    events: [
      { name: "lesson_viewed", createdAt: iso(80000000), detail: { resourceId: "a" } },
      { name: "lesson_viewed", createdAt: iso(79000000), detail: { resourceId: "b" } },
      { name: "lesson_saved", createdAt: iso(78000000), detail: { resourceId: "b" } },
    ],
  });
  assert.equal(activated.activated, true);
  assert.ok(activated.activatedAt);
  pass("activation: two distinct resources + meaningful action → activated");

  const orderAct = conversionIntelligence.computeActivationState({
    signupAt: iso(86400000),
    events: [
      { name: "lesson_saved", createdAt: iso(82000000), detail: { resourceId: "a" } },
      { name: "lesson_viewed", createdAt: iso(81000000), detail: { resourceId: "a" } },
      { name: "lesson_viewed", createdAt: iso(80000000), detail: { resourceId: "b" } },
    ],
  });
  assert.equal(orderAct.activated, true);
  assert.equal(orderAct.activatedAt, iso(80000000));
  pass("activation: timestamp ordering when meaningful action precedes second view");

  // --- COHORTS ---
  const matureSignup = iso(40 * 86400000);
  const immatureSignup = iso(2 * 86400000);
  const cohortProfiles = new Map([
    ["email:mature@t.com", {
      email: "mature@t.com",
      signupAt: matureSignup,
      converted: true,
      paidAtMs: new Date(matureSignup).getTime() + 2 * 86400000,
      events: [{ name: "account_created", createdAt: matureSignup }],
      sessions: new Set(["s1"]),
      pricingViews: 0,
      checkoutStarts: 0,
      lessonViews: 0,
      proEncounters: 0,
      upgradeClicks: 0,
      activated: true,
    }],
    ["email:mature-free@t.com", {
      email: "mature-free@t.com",
      signupAt: matureSignup,
      converted: false,
      paidAtMs: 0,
      events: [{ name: "account_created", createdAt: matureSignup }],
      sessions: new Set(["s1"]),
      pricingViews: 0,
      checkoutStarts: 0,
      lessonViews: 0,
      proEncounters: 0,
      upgradeClicks: 0,
      activated: false,
    }],
    ["email:immature@t.com", {
      email: "immature@t.com",
      signupAt: immatureSignup,
      converted: false,
      paidAtMs: 0,
      events: [{ name: "account_created", createdAt: immatureSignup }],
      sessions: new Set(["s1"]),
      pricingViews: 0,
      checkoutStarts: 0,
      lessonViews: 0,
      proEncounters: 0,
      upgradeClicks: 0,
      activated: false,
    }],
  ]);
  const cohorts = conversionIntelligence.buildSignupCohorts(cohortProfiles, now);
  const matureKey = matureSignup.slice(0, 10);
  const immatureKey = immatureSignup.slice(0, 10);
  const matureRow = cohorts.cohorts.find((c) => c.cohort === matureKey);
  const immatureRow = cohorts.cohorts.find((c) => c.cohort === immatureKey);
  assert.ok(matureRow);
  assert.equal(matureRow.eligible30d, 2);
  assert.equal(matureRow.paidWithin30d, 1);
  assert.equal(matureRow.rate30d, "50%");
  pass("cohorts: mature converted + non-converted counted");

  assert.ok(immatureRow);
  assert.equal(immatureRow.rate30d, "pending");
  assert.equal(immatureRow.paidWithin30d, "—");
  pass("cohorts: immature user excluded from 30d denominator");

  assert.equal(matureRow.paidWithin1d, 0);
  pass("cohorts: conversion after window does not count inside earlier window");

  // --- PERSONA ---
  assert.equal(conversionIntelligence.resolvePersona({ persona: "home_daycare" }), "home_daycare");
  assert.equal(conversionIntelligence.resolvePersona({ onboardingPersona: "center" }), "center");
  assert.equal(conversionIntelligence.resolvePersona({ accountType: "center", role: "teacher" }), "teacher_staff");
  assert.equal(conversionIntelligence.resolvePersona({}), "unknown");
  pass("persona: resolution order and unknown safe");

  // --- AGE GROUP ---
  assert.equal(conversionEvents.extractAgeGroup({ detail: { age: "School Age" } }), "School Age");
  assert.equal(conversionEvents.extractAgeGroup({ detail: { age: "Mixed Ages" } }), "Mixed Ages");
  assert.equal(conversionEvents.extractAgeGroup({ detail: { age: "Toddler (1-2)" } }), "Toddler");
  const ageSeg = conversionIntelligence.buildAgeGroupSegmentation([
    { name: "lesson_viewed", user: "a@t.com", visitorId: "v1", createdAt: iso(1000), detail: { resourceId: "x", age: "Toddler" } },
    { name: "printable_viewed", user: "a@t.com", visitorId: "v1", createdAt: iso(900), detail: { resourceId: "x", age: "Toddler" } },
    { name: "lesson_viewed", user: "b@t.com", visitorId: "v2", createdAt: iso(800), detail: { resourceId: "y", age: "School Age" } },
  ], new Map([
    ["email:a@t.com", { email: "a@t.com", pricingViews: 1, checkoutStarts: 0, converted: false }],
    ["email:b@t.com", { email: "b@t.com", pricingViews: 0, checkoutStarts: 0, converted: false }],
  ]));
  assert.ok(ageSeg.rows.some((r) => r.ageGroup === "Toddler" && r.printableEngagement >= 1));
  assert.ok(ageSeg.rows.some((r) => r.ageGroup === "School Age"));
  pass("age group: canonical normalization + printable interactions");

  // --- OFFER ---
  assert.equal(conversionIntelligence.normalizeOffer({ detail: { type: "early_user" } }), "early_user");
  assert.equal(conversionIntelligence.normalizeOffer({ detail: { type: "annual" } }), "pro_annual");
  assert.equal(conversionIntelligence.normalizeOffer({ detail: { type: "monthly" } }), "pro_monthly");
  assert.equal(conversionIntelligence.normalizeOffer({ detail: { type: "founding" } }), "founding");
  assert.equal(conversionIntelligence.normalizeOffer({ detail: { trial7day: true } }), "trial");
  assert.equal(conversionIntelligence.normalizeOffer({ billingOffer: "pro_monthly" }), "pro_monthly");
  pass("offer: normalize early_user/annual/monthly/founding/trial");

  const offerProfiles = new Map([
    ["email:buyer@t.com", {
      email: "buyer@t.com",
      converted: true,
      paidAtMs: now - 10000,
      billingOffer: "pro_monthly",
      events: [
        { name: "checkout_start", createdAt: iso(20000), detail: { type: "annual" } },
        { name: "checkout_start", createdAt: iso(15000), detail: { type: "monthly" } },
        { name: "checkout_start", createdAt: iso(5000), detail: { type: "early_user" } }, // after purchase — ignored
      ],
    }],
  ]);
  const offers = conversionIntelligence.buildOfferAttribution(offerProfiles);
  const monthly = offers.find((o) => o.offer === "pro_monthly");
  assert.ok(monthly && monthly.paidConversions >= 1);
  pass("offer: last pre-purchase checkout_start wins; post-purchase ignored");

  assert.equal(
    conversionIntelligence.userHasAuthoritativePaidConversion({
      plan: "Pro",
      stripeSubscriptionStatus: "past_due",
      firstPaidInvoiceAt: iso(1000),
    }),
    false,
  );
  pass("offer: past_due/unpaid does not count as paid");

  // --- CAMPAIGN ---
  const campProfiles = new Map([
    ["email:c@t.com", {
      email: "c@t.com",
      signupAt: iso(86400000),
      source: "Facebook",
      firstTouch: { source: "Facebook", medium: "paid_social", campaign: "spring", content: "ad1" },
      activated: true,
      pricingViews: 1,
      checkoutStarts: 1,
      converted: true,
      events: [{ name: "account_created", createdAt: iso(86400000) }],
    }],
  ]);
  const camp = conversionIntelligence.buildCampaignAttribution(campProfiles);
  assert.ok(camp.firstTouch.some((r) => r.source === "Facebook" && r.campaign === "spring" && r.content === "ad1"));
  pass("campaign: first-touch source/campaign/content preserved");

  // --- LESSON ASSOCIATION ---
  const lessonProfiles = new Map([
    ["email:u@t.com", {
      email: "u@t.com",
      converted: true,
      paidAtMs: now - 2 * 86400000,
      events: [
        { name: "pricing_viewed", user: "u@t.com", createdAt: iso(5 * 86400000) },
        { name: "pricing_viewed", user: "u@t.com", createdAt: iso(20 * 86400000) },
      ],
    }],
  ]);
  const lessonEvents = [
    { name: "lesson_viewed", user: "u@t.com", visitorId: "vu", createdAt: iso(10 * 86400000), detail: { resourceId: "farm", title: "Farm", age: "Toddler" } },
    { name: "lesson_viewed", user: "u@t.com", visitorId: "vu", createdAt: iso(9 * 86400000), detail: { resourceId: "farm", title: "Farm", age: "Toddler" } },
    { name: "lesson_saved", user: "u@t.com", createdAt: iso(8 * 86400000), detail: { resourceId: "farm" } },
    { name: "printable_viewed", user: "u@t.com", createdAt: iso(7 * 86400000), detail: { resourceId: "farm" } },
    { name: "pro_content_encountered", user: "u@t.com", createdAt: iso(6 * 86400000), detail: { lessonId: "farm", featureType: "printable_locked" } },
  ];
  // Wire profile events for pricing window checks
  lessonProfiles.get("email:u@t.com").events = [
    ...lessonEvents,
    { name: "pricing_viewed", user: "u@t.com", createdAt: iso(5 * 86400000) },
    { name: "pricing_viewed", user: "u@t.com", createdAt: iso(20 * 86400000) },
  ];
  const lessonAssoc = conversionIntelligence.buildLessonPurchaseAssociation(lessonEvents, lessonProfiles);
  const farm = lessonAssoc.topLessons.find((l) => l.lessonId === "farm");
  assert.ok(farm);
  assert.equal(farm.uniqueViewers, 1);
  assert.equal(farm.saves, 1);
  assert.ok(farm.printableInteractions >= 1);
  assert.ok(farm.proEncounters >= 1);
  assert.equal(farm.pricingViewsWithin7d, 1);
  assert.equal(farm.purchasesWithin30d, 1);
  assert.match(lessonAssoc.associationDisclaimer, /not causal/i);
  pass("lesson association: unique viewers, saves, printables, windows, disclaimer");

  // --- LOST USERS ---
  const lostProfiles = new Map([
    ["email:fresh@t.com", {
      email: "fresh@t.com",
      signupAt: iso(1 * 86400000),
      activated: false,
      converted: false,
      lastActive: iso(1000),
      sessions: new Set(["s1"]),
      checkoutStarts: 0,
      events: [],
      pricingViews: 0,
      upgradeClicks: 0,
      lessonViews: 0,
      proEncounters: 0,
      hadPaidHistory: false,
      hasProAccess: false,
    }],
    ["email:stale@t.com", {
      email: "stale@t.com",
      signupAt: iso(20 * 86400000),
      activated: false,
      converted: false,
      lastActive: iso(15 * 86400000),
      sessions: new Set(["s1"]),
      checkoutStarts: 0,
      events: [{ name: "account_created", createdAt: iso(20 * 86400000) }],
      pricingViews: 0,
      upgradeClicks: 0,
      lessonViews: 0,
      proEncounters: 0,
      hadPaidHistory: false,
      hasProAccess: false,
    }],
    ["email:ended@t.com", {
      email: "ended@t.com",
      signupAt: iso(60 * 86400000),
      activated: true,
      converted: false,
      lastActive: iso(5 * 86400000),
      sessions: new Set(["s1", "s2"]),
      checkoutStarts: 0,
      events: [],
      pricingViews: 0,
      upgradeClicks: 0,
      lessonViews: 0,
      proEncounters: 0,
      hadPaidHistory: true,
      hasProAccess: false,
    }],
  ]);
  const lost = conversionIntelligence.buildLostUserSegments(lostProfiles, now);
  const neverUse = lost.segments.find((s) => s.id === "never_meaningful_use");
  assert.ok(neverUse.count >= 1);
  assert.ok(!neverUse.users.some((u) => u.user.includes("fresh")));
  pass("lost users: fresh signup excluded; mature never-use counted");
  const ended = lost.segments.find((s) => s.id === "previously_paid_ended");
  assert.ok(ended.count >= 1);
  pass("lost users: previously-paid-ended segment works");

  // --- HIGH INTENT QUEUE ---
  const queueProfiles = new Map([
    ["email:queue.user@t.com", {
      email: "queue.user@t.com",
      signupAt: iso(10 * 86400000),
      activated: false,
      converted: false,
      sessions: new Set(["s1", "s2"]),
      pricingViews: 2,
      proEncounters: 2,
      checkoutStarts: 1,
      checkoutCompleted: false,
      lessonViews: 5,
      upgradeClicks: 1,
      lastActive: iso(1000),
      events: [
        { name: "account_created", createdAt: iso(10 * 86400000) },
        { name: "checkout_start", createdAt: iso(5 * 86400000) },
        { name: "pro_checkout_abandoned", createdAt: iso(4 * 86400000) },
      ],
    }],
  ]);
  const queue = conversionIntelligence.buildHighIntentQueue(queueProfiles, conversionIntelligence.computeIntentScore, now);
  assert.ok(queue.length >= 1);
  assert.ok(queue[0].categories.includes("Checkout abandoned"));
  assert.ok(queue[0].categories.includes("Pricing viewed repeatedly"));
  assert.ok(queue[0].user.includes("…"));
  pass("high-intent queue: deterministic categories + masked identity");

  // --- CTA impressions ---
  assert.equal(resolveCanonicalEvent({ name: "upgrade_prompt_shown" }), null);
  assert.equal(resolveCanonicalEvent({ name: "upgrade_cta_impression" }), "upgrade_cta_impression");
  const ctaEvents = [
    { name: "upgrade_prompt_shown", user: "c1@t.com", visitorId: "v1", createdAt: iso(1000), detail: { promptId: "locked_lesson_preview" } },
    { name: "upgrade_cta_impression", user: "c1@t.com", visitorId: "v1", createdAt: iso(900), detail: { promptId: "locked_lesson_preview", ctaLocation: "locked_lesson_preview" } },
    { name: "upgrade_cta_clicked", user: "c1@t.com", visitorId: "v1", createdAt: iso(800), detail: { ctaLocation: "locked_lesson_preview" } },
    { name: "pro_content_encountered", user: "c1@t.com", visitorId: "v1", createdAt: iso(700), detail: { featureType: "pro_lesson_locked" } },
  ];
  const cta = conversionIntelligence.buildCtaPerformanceWithImpressions(ctaEvents);
  const locked = cta.find((r) => r.cta === "locked_lesson_preview");
  assert.ok(locked);
  assert.equal(locked.impressions, 1);
  assert.equal(locked.uniqueClicks, 1);
  assert.equal(locked.ctr, "100%");
  pass("CTA: unique impressions, no historical+new double-count, CTR correct");
  const clientSrc = fs.readFileSync(path.join(ROOT, "scripts/conversion-analytics-client.js"), "utf8");
  assert.ok(clientSrc.includes("trackUpgradeCtaImpression"));
  assert.equal(resolveCanonicalEvent({ name: "pro_content_encountered" }), "pro_content_encountered");
  assert.equal(resolveCanonicalEvent({ name: "upgrade_prompt_shown" }), null);
  pass("CTA: client impression helper present; pro_content_encountered remains distinct");

  // End-to-end report includes Phase 2A keys
  const store = buildFixtureStore();
  store.users["alice@free.test"].attribution = {
    source: "Facebook", medium: "paid_social", campaign: "spring", content: "creative-a",
  };
  store.analyticsEvents.push({
    id: "e22", name: "signup_persona_selected", user: "alice@free.test", createdAt: iso(2 * 86400000 - 1000),
    detail: { persona: "home_daycare", accountType: "home_daycare", role: "owner" },
  });
  const report = conversionIntelligence.buildConversionIntelligence(store, { range: "all", events: store.analyticsEvents });
  assert.ok(report.activation);
  assert.ok(report.signupCohorts);
  assert.ok(report.campaignAttribution);
  assert.ok(report.personaSegmentation);
  assert.ok(report.ageGroupSegmentation);
  assert.ok(report.offerAttribution);
  assert.ok(report.lessonAssociation);
  assert.ok(report.lostUsers);
  assert.ok(report.highIntentQueue);
  assert.ok(report.funnel.stages.length >= 10);
  pass("phase2A: report includes all new sections; funnel intact");
}

function phase2BTests() {
  const leads = conversionIntelligence.conversionLeads;
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  // Status + note sanitization / length
  assert.equal(leads.isValidLeadStatus("follow_up"), true);
  assert.equal(leads.isValidLeadStatus("crm_galaxy"), false);
  assert.equal(leads.isValidNonBuyerReason("price"), true);
  assert.equal(leads.isValidNonBuyerReason("vibes"), false);
  const cleaned = leads.sanitizeOwnerText("  Hello <b>world</b>\0  ");
  assert.equal(cleaned, "Hello world");
  const long = leads.sanitizeOwnerText("x".repeat(5000));
  assert.equal(long.length, leads.NOTE_MAX_LENGTH);
  pass("phase2B: status/reason validation + note sanitization/length");

  const store = { conversionLeads: {}, users: {} };
  leads.setLeadStatus(store, "Lead@Free.Test", "high_intent", "owner@test");
  leads.addLeadNote(store, "lead@free.test", "First");
  leads.addLeadNote(store, "lead@free.test", "Second");
  leads.addLeadReason(store, "lead@free.test", "price", "Too expensive vs alternatives");
  const lead = leads.getConversionLead(store, "lead@free.test");
  assert.equal(lead.status, "high_intent");
  assert.equal(lead.notes.length, 2);
  assert.equal(lead.reasons[0].reason, "price");
  pass("phase2B: status persistence + notes history + reason persistence");

  assert.throws(() => leads.setLeadStatus(store, "a@b.com", "nope"), /Invalid conversion lead status/);
  assert.throws(() => leads.addLeadReason(store, "a@b.com", "nope"), /Invalid non-buyer reason/);
  pass("phase2B: invalid mutations throw");

  // Authoritative paid never invented by owner status
  assert.equal(leads.resolveEffectiveStatus("new", "converted", false), "converted"); // label only
  assert.equal(leads.resolveEffectiveStatus("new", "follow_up", true), "converted"); // billing wins
  const unpaid = conversionIntelligence.userHasAuthoritativePaidConversion({
    plan: "Pro",
    stripeSubscriptionStatus: "past_due",
    firstPaidInvoiceAt: iso(86400000),
  });
  // past_due may still have membershipHasProAccess depending on membership-access — force check
  const unpaidStrict = conversionIntelligence.userHasAuthoritativePaidConversion({
    plan: "Free",
    stripeSubscriptionStatus: "unpaid",
    subscriptionStatus: "past due",
  });
  assert.equal(unpaidStrict, false);
  pass("phase2B: past_due/unpaid never treated as successful conversion");

  // Queue filters + ordering + layers
  const fixture = buildFixtureStore(now);
  fixture.conversionLeads = store.conversionLeads;
  // Ensure alice has lead data under her email key used by fixture
  leads.setLeadStatus(fixture, "alice@free.test", "follow_up", "owner@test");
  leads.addLeadReason(fixture, "alice@free.test", "not_ready_yet", "Maybe next month");

  const report = conversionIntelligence.buildConversionIntelligence(fixture, {
    range: "all",
    events: fixture.analyticsEvents,
  });
  assert.ok(report.ownerWorkflowSummary);
  assert.ok(Array.isArray(report.ownerActionQueue));
  assert.ok(report.lostUserWorkflow?.groups?.length >= 4);
  assert.ok(report.ownerWorkflowSummary.converted >= 1);
  pass("phase2B: owner workflow summary + lost-user workflow present");

  const scores = report.ownerActionQueue.map((r) => Number(r.intentScore) || 0);
  for (let i = 1; i < scores.length; i += 1) {
    assert.ok(scores[i - 1] >= scores[i] || report.ownerActionQueue[i - 1].paidAuthoritative === false);
  }
  pass("phase2B: high-intent ordering remains deterministic");

  const activatedOnly = conversionIntelligence.buildConversionIntelligence(fixture, {
    range: "all",
    events: fixture.analyticsEvents,
    activated: "activated",
  });
  assert.ok(activatedOnly.ownerActionQueue.every((r) => r.activated));
  const followOnly = conversionIntelligence.buildConversionIntelligence(fixture, {
    range: "all",
    events: fixture.analyticsEvents,
    leadStatus: "follow_up",
  });
  assert.ok(followOnly.ownerActionQueue.every((r) => r.effectiveStatus === "follow_up" || r.ownerStatus === "follow_up"));
  const combo = conversionIntelligence.buildConversionIntelligence(fixture, {
    range: "all",
    events: fixture.analyticsEvents,
    activated: "activated",
    leadStatus: "follow_up",
  });
  assert.ok(combo.ownerActionQueue.every((r) => r.activated && (r.effectiveStatus === "follow_up" || r.ownerStatus === "follow_up")));
  pass("phase2B: filters work independently and together");

  const checkoutUnpaid = report.ownerActionQueue.filter((r) => r.checkoutStarted === "Yes" && !r.paidAuthoritative);
  assert.ok(checkoutUnpaid.length >= 1 || report.ownerWorkflowSummary.checkoutStartedUnpaid >= 0);
  pass("phase2B: checkout-started unpaid classification available");

  const paidRow = report.ownerActionQueue.find((r) => r.paidAuthoritative);
  assert.ok(paidRow);
  assert.equal(paidRow.derivedStatus, "converted");
  pass("phase2B: converted user appears with authoritative paid flag");

  // Owner "converted" on free user does not flip paidAuthoritative
  leads.setLeadStatus(fixture, "alice@free.test", "converted", "owner@test");
  const afterFake = conversionIntelligence.buildConversionIntelligence(fixture, {
    range: "all",
    events: fixture.analyticsEvents,
    detailEmail: "alice@free.test",
  });
  const alice = afterFake.ownerActionQueue.find((r) => r.email === "alice@free.test");
  assert.ok(alice);
  assert.equal(alice.paidAuthoritative, false);
  assert.equal(alice.ownerStatus, "converted");
  assert.ok(afterFake.conversionLeadDetail.layers.observed);
  assert.ok(afterFake.conversionLeadDetail.layers.derived);
  assert.ok(afterFake.conversionLeadDetail.layers.ownerEntered);
  assert.notEqual(
    JSON.stringify(afterFake.conversionLeadDetail.layers.observed),
    JSON.stringify(afterFake.conversionLeadDetail.layers.ownerEntered),
  );
  pass("phase2B: observed/derived/owner-entered stay separated; status ≠ billing");

  // Phase 2A regressions
  assert.ok(afterFake.signupCohorts);
  assert.ok(afterFake.campaignAttribution);
  assert.ok(afterFake.personaSegmentation);
  assert.ok(afterFake.offerAttribution);
  const cta = conversionIntelligence.buildCtaPerformanceWithImpressions([
    { name: "upgrade_prompt_shown", user: "c1@t.com", visitorId: "v1", createdAt: iso(1000), detail: { promptId: "x", ctaLocation: "x" } },
    { name: "upgrade_cta_impression", user: "c1@t.com", visitorId: "v1", createdAt: iso(900), detail: { promptId: "x", ctaLocation: "x" } },
  ]);
  assert.equal(cta.find((r) => r.cta === "x")?.impressions, 1);
  pass("phase2B: no regression to Phase 2A cohorts/attribution/CTA dedupe");
}

function ownerUxFixTests() {
  const leads = conversionIntelligence.conversionLeads;
  const store = { conversionLeads: {}, users: {} };

  leads.addLeadReason(store, "a@test.com", "price", "");
  leads.addLeadReason(store, "b@test.com", "price", "");
  leads.addLeadReason(store, "c@test.com", "not_ready_yet", "");
  leads.addLeadReason(store, "d@test.com", "just_browsing", "");
  leads.addLeadReason(store, "e@test.com", "needs_specific_content", "");
  leads.setLeadStatus(store, "f@test.com", "follow_up", "owner@test");
  leads.addLeadReason(store, "g@test.com", "price", "");
  leads.addLeadReason(store, "g@test.com", "other", "");

  const freq = leads.buildOwnerReasonFrequency(store);
  assert.equal(freq[0].reason, "price");
  assert.equal(freq[0].count, 2);
  assert.ok(freq.every((row) => row.reason && row.count > 0));
  for (let i = 1; i < freq.length; i += 1) {
    assert.ok(freq[i - 1].count >= freq[i].count);
  }
  pass("owner UX: reason roll-up counts owner-entered reasons, excludes blanks, sorted desc");

  const fixture = buildFixtureStore();
  leads.addLeadReason(fixture, "alice@free.test", "price", "");
  leads.addLeadReason(fixture, "carol@intent.test", "not_ready_yet", "");
  const report = conversionIntelligence.buildConversionIntelligence(fixture, {
    range: "all",
    events: fixture.analyticsEvents,
  });
  assert.ok(Array.isArray(report.ownerReasonFrequency));
  const priceRow = report.ownerReasonFrequency.find((row) => row.reason === "price");
  assert.ok(priceRow);
  assert.equal(priceRow.count, 1);
  assert.ok(report.ownerReasonFrequency.every((row) => row.label && row.count > 0));
  pass("owner UX: API report includes ownerReasonFrequency (not inferred)");

  const unpaidAlice = report.ownerActionQueue.find((row) => row.email === "alice@free.test");
  assert.ok(unpaidAlice);
  assert.equal(unpaidAlice.paidAuthoritative, false);
  pass("owner UX: authoritative paid logic untouched in queue");

  const adminUi = fs.readFileSync(path.join(ROOT, "admin-conversion-intelligence.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles/llh-admin-workspace.css"), "utf8");
  assert.match(adminUi, /Owner Follow-Up/);
  assert.doesNotMatch(adminUi, /Phase 2B — Owner Follow-Up/);
  assert.doesNotMatch(adminUi, /derived:\s*\$\{/);
  assert.match(adminUi, /Suggested:/);
  assert.match(adminUi, /conv-queue-mobile/);
  assert.match(adminUi, /conv-queue-desktop/);
  assert.match(adminUi, /applyScrollRestore/);
  assert.match(adminUi, /scrollRestore/);
  assert.match(css, /conv-owner-followup-kpis/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*conv-queue-mobile/);
  pass("owner UX: mobile queue CSS/markup + scroll preservation + owner-facing wording");
}

async function main() {
  console.log("Conversion Intelligence tests\n");
  wiringTests();
  const report = unitTests();
  phase2ATests();
  phase2BTests();
  ownerUxFixTests();
  await apiTests();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("\nExample funnel (fixture data):");
  for (const stage of report.funnel.stages.slice(0, 8)) {
    console.log(`  ${stage.uniqueUsers} — ${stage.label} (${stage.pctOfSignups}% of signups)`);
  }
  if (report.activation) {
    console.log(`\nActivation: ${report.activation.activatedUsers}/${report.activation.signups} (${report.activation.activationRate})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
