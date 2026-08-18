#!/usr/bin/env node
/**
 * Free signup funnel reporting — unique actors, stage order, rates, zero-safe math.
 * Does not exercise signup UI or billing.
 * Run: npm run test:free-signup-funnel
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const insights = require("../server/admin-insights.js");

const ROOT = path.join(__dirname, "..");

function iso(msAgo, now = Date.now()) {
  return new Date(now - msAgo).toISOString();
}

function ev(name, extras = {}, now = Date.now()) {
  return {
    name,
    createdAt: extras.createdAt || iso(extras.ago || 1000, now),
    visitorId: extras.visitorId || "",
    sessionId: extras.sessionId || extras.visitorId || "",
    user: extras.user || "",
    path: extras.path || "/",
    url: extras.url || "https://littlelearnershubbyleah.com/",
    detail: extras.detail || {},
    attribution: extras.attribution || {},
  };
}

function stageById(funnel, id) {
  return (funnel.stages || []).find((s) => s.id === id);
}

function leakById(funnel, id) {
  return (funnel.leaks || []).find((s) => s.id === id);
}

function testUniqueActorsAndNoDoubleCount() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 9000 }, now),
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 8000 }, now),
    ev("cta_click", {
      visitorId: "v1",
      detail: { cta: "start_free", label: "Start Free", placement: "hero" },
      ago: 7000,
    }, now),
    ev("cta_click", {
      visitorId: "v1",
      detail: { cta: "start_free", label: "Start Free", placement: "hero" },
      ago: 6900,
    }, now),
    ev("signup_start", { visitorId: "v1", detail: { source: "auth_modal" }, ago: 6800 }, now),
    ev("signup_start", { visitorId: "v1", detail: { source: "auth_modal" }, ago: 6700 }, now),
    ev("signup_start", { visitorId: "v1", detail: { source: "auth_modal" }, ago: 6600 }, now),
    ev("signup_form_submit", { visitorId: "v1", user: "one@provider.com", detail: { email: "one@provider.com" }, ago: 6500 }, now),
    ev("account_signup_complete", { user: "one@provider.com", detail: { email: "one@provider.com", plan: "Free" }, ago: 6400 }, now),
    ev("signup_landed_free", { user: "one@provider.com", detail: { email: "one@provider.com" }, ago: 6300 }, now),
  ];

  const funnel = insights.buildFreeSignupFunnel(events);
  assert.equal(stageById(funnel, "homepageVisitors").uniqueActors, 1, "repeat homepage visits are one actor");
  assert.equal(stageById(funnel, "startFreeClicks").uniqueActors, 1, "repeat Start Free clicks are one actor");
  assert.equal(stageById(funnel, "signupStart").uniqueActors, 1, "signup_start is not double-counted");
  assert.equal(stageById(funnel, "signupStart").eventCount, 3, "raw signup_start events still visible");
  assert.equal(stageById(funnel, "signupFormSubmit").uniqueActors, 1);
  assert.equal(stageById(funnel, "accountCreated").uniqueActors, 1, "email links back to visitor");
  assert.equal(stageById(funnel, "landedFree").uniqueActors, 1);
  assert.equal(leakById(funnel, "E").count, 1);
  console.log("PASS unique actors + signup_start dedupe + identity link");
}

function testStageOrderAndRates() {
  const now = Date.now();
  const events = [];
  for (let i = 1; i <= 10; i += 1) {
    events.push(ev("website_visit", { visitorId: `v${i}`, detail: { view: "home" }, ago: 20000 - i }, now));
  }
  // 4 click Start Free
  events.push(ev("cta_click", { visitorId: "v1", detail: { cta: "start_free", placement: "hero" }, ago: 9000 }, now));
  events.push(ev("cta_click", { visitorId: "v2", detail: { cta: "start_free", placement: "hero" }, ago: 8900 }, now));
  events.push(ev("cta_click", { visitorId: "v2", detail: { cta: "start_free", placement: "nav" }, ago: 8800 }, now));
  events.push(ev("signup_click", { visitorId: "v4", ago: 8700 }, now));
  events.push(ev("cta_click", { visitorId: "v3", detail: { cta: "start_free", placement: "page" }, ago: 8600 }, now));
  // signup_start for 4 clickers (v1 twice)
  for (const id of ["v1", "v1", "v2", "v3", "v4"]) {
    events.push(ev("signup_start", { visitorId: id, ago: 8000 }, now));
  }
  // 3 submit
  events.push(ev("signup_form_submit", { visitorId: "v1", user: "a@x.com", ago: 7000 }, now));
  events.push(ev("signup_form_submit", { visitorId: "v2", user: "b@x.com", ago: 6900 }, now));
  events.push(ev("signup_form_submit", { visitorId: "v3", user: "c@x.com", ago: 6800 }, now));
  // 2 account + 2 landed
  events.push(ev("account_signup_complete", { visitorId: "v1", user: "a@x.com", ago: 6000 }, now));
  events.push(ev("account_signup_complete", { visitorId: "v2", user: "b@x.com", ago: 5900 }, now));
  events.push(ev("signup_landed_free", { visitorId: "v1", user: "a@x.com", ago: 5000 }, now));
  events.push(ev("signup_landed_free", { visitorId: "v2", user: "b@x.com", ago: 4900 }, now));
  // noise that must not enter this funnel
  events.push(ev("website_visit", { visitorId: "v-lessons", detail: { view: "lessons" }, path: "/lessons", ago: 4000 }, now));
  events.push(ev("cta_click", { visitorId: "v-trial", detail: { cta: "start_trial", placement: "hero" }, ago: 3900 }, now));

  const funnel = insights.buildFreeSignupFunnel(events);
  const ids = funnel.stages.map((s) => s.id);
  assert.deepEqual(ids, [
    "homepageVisitors",
    "startFreeClicks",
    "signupStart",
    "signupFormSubmit",
    "accountCreated",
    "landedFree",
  ], "stages stay in Free signup order");

  assert.equal(stageById(funnel, "homepageVisitors").uniqueActors, 10);
  assert.equal(stageById(funnel, "startFreeClicks").uniqueActors, 4);
  assert.equal(stageById(funnel, "signupStart").uniqueActors, 4);
  assert.equal(stageById(funnel, "signupFormSubmit").uniqueActors, 3);
  assert.equal(stageById(funnel, "accountCreated").uniqueActors, 2);
  assert.equal(stageById(funnel, "landedFree").uniqueActors, 2);

  const clicked = stageById(funnel, "startFreeClicks");
  assert.equal(clicked.conversionFromPrev, 40);
  assert.equal(clicked.conversionFromPrevLabel, "40.0%");
  assert.equal(clicked.dropOffCount, 6);
  assert.equal(clicked.dropOffRate, 60);
  assert.equal(clicked.dropOffRateLabel, "60.0%");

  const started = stageById(funnel, "signupStart");
  assert.equal(started.conversionFromPrev, 100);
  assert.equal(started.dropOffCount, 0);

  const submitted = stageById(funnel, "signupFormSubmit");
  assert.equal(submitted.conversionFromPrev, 75);
  assert.equal(submitted.dropOffCount, 1);
  assert.equal(submitted.dropOffRate, 25);

  const created = stageById(funnel, "accountCreated");
  assert.equal(created.conversionFromPrev, 66.7);
  assert.equal(created.dropOffCount, 1);

  const landed = stageById(funnel, "landedFree");
  assert.equal(landed.conversionFromPrev, 100);
  assert.equal(landed.dropOffCount, 0);

  assert.equal(leakById(funnel, "A").count, 6);
  assert.equal(leakById(funnel, "B").count, 1);
  assert.equal(leakById(funnel, "C").count, 1);
  assert.equal(leakById(funnel, "D").count, 0);
  assert.equal(leakById(funnel, "E").count, 2);

  assert.match(funnel.largestLeakLabel, /Homepage visitors → Clicked Start Free/);
  assert.equal(funnel.largestLeak.dropOffCount, 6);

  const hero = funnel.ctaSources.find((s) => s.id === "hero");
  const nav = funnel.ctaSources.find((s) => s.id === "nav");
  const other = funnel.ctaSources.find((s) => s.id === "other");
  assert.equal(hero.uniqueActors, 2, "v1 + v2 hero");
  assert.equal(nav.uniqueActors, 2, "v2 nav + v4 signup_click");
  assert.equal(other.uniqueActors, 1, "v3 page (farm/pricing/footer lumped)");
  assert.ok(!funnel.ctaSources.some((s) => /farm|pricing/i.test(s.id)), "no fabricated farm/pricing source");

  assert.equal(funnel.signupStepCounts.signup_start, 4);
  assert.equal(funnel.signupStepCounts.signup_form_submit, 3);
  assert.equal(funnel.signupStepCounts.account_signup_complete, 2);
  assert.equal(funnel.signupStepCounts.signup_landed_free, 2);
  console.log("PASS stage order, conversion math, leaks, CTA sources");
}

function testZeroDenominator() {
  const empty = insights.buildFreeSignupFunnel([]);
  assert.equal(empty.stages.length, 6);
  for (const stage of empty.stages) {
    assert.equal(stage.uniqueActors, 0);
    assert.equal(stage.dropOffCount, 0);
    assert.ok(Number.isFinite(stage.conversionFromPrev));
    assert.ok(Number.isFinite(stage.dropOffRate));
  }
  assert.equal(stageById(empty, "startFreeClicks").conversionFromPrev, 0);
  assert.equal(stageById(empty, "startFreeClicks").conversionFromPrevLabel, "0%");
  assert.equal(stageById(empty, "startFreeClicks").dropOffRateLabel, "0%");
  for (const leak of empty.leaks) {
    assert.equal(leak.count, 0);
    assert.equal(leak.percent, 0);
    assert.equal(leak.percentLabel, "0%");
  }
  assert.equal(empty.largestLeak, null);
  assert.match(empty.largestLeakLabel, /none in this range/i);
  console.log("PASS zero-denominator cases are safe");
}

function testExistingAdvisorOpportunitiesStillWork() {
  const now = Date.now();
  const store = {
    users: {},
    featureRequests: [],
    siteContent: { curriculum: { lessonPlans: [], activities: [] } },
    analyticsEvents: [
      ev("website_visit", { visitorId: "adv1", detail: { view: "home" }, ago: 5000 }, now),
      ev("search_no_results", { visitorId: "adv1", detail: { query: "halloween toddler", results: 0 }, ago: 4000 }, now),
    ],
  };
  for (let i = 0; i < 6; i += 1) {
    store.users[`new${i}@provider.com`] = {
      email: `new${i}@provider.com`,
      signupAt: iso(2 * 86400000, now),
      plan: "Free",
    };
    store.analyticsEvents.push({
      name: "account_signup_complete",
      user: `new${i}@provider.com`,
      visitorId: `adv-s${i}`,
      createdAt: iso(2 * 86400000, now),
    });
  }
  const advisor = insights.buildInsights(store, { hub: "advisor", range: "30d" });
  assert.ok(advisor.data.recommendations.length >= 1, "advisor still emits opportunities");
  assert.ok(
    advisor.data.recommendations.some((r) => /lesson plan/i.test(`${r.title} ${r.detail}`)),
    "onboarding opportunity (accounts created, no lessons) still fires",
  );
  assert.ok(advisor.data.freeSignupFunnel, "advisor exposes freeSignupFunnel");
  assert.ok(Array.isArray(advisor.data.summaryLines));

  const marketing = insights.buildInsights(store, { hub: "marketing-funnel", range: "30d" });
  assert.ok(Array.isArray(marketing.data.stages));
  assert.ok(marketing.data.stages.some((s) => s.id === "visitors"));
  assert.ok(marketing.data.stages.some((s) => s.id === "signupStarts"));
  assert.ok(marketing.data.freeSignupFunnel);
  assert.ok(marketing.data.signupStepCounts);
  assert.deepEqual(
    insights.FUNNEL_STAGE_DEFS.map((s) => s.id),
    [
      "visitors",
      "landingPageViews",
      "ctaClicks",
      "signupStarts",
      "signupCompletions",
      "emailVerified",
      "trialStarts",
      "trialEnded",
      "paidConversions",
      "activeSubscribers",
    ],
    "existing marketing funnel stages unchanged",
  );
  console.log("PASS existing advisor opportunities and marketing stages still work");
}

function testWiring() {
  const ui = fs.readFileSync(path.join(ROOT, "admin-insights.js"), "utf8");
  const server = fs.readFileSync(path.join(ROOT, "server/admin-insights.js"), "utf8");
  assert.match(ui, /FREE SIGNUP FUNNEL/);
  assert.match(ui, /renderFreeSignupFunnel/);
  assert.match(ui, /Start Free by placement/);
  assert.match(server, /function buildFreeSignupFunnel/);
  assert.match(server, /freeSignupFunnel: buildFreeSignupFunnel/);
  assert.doesNotMatch(server, /placement === "farm"/);
  assert.doesNotMatch(server, /placement === "pricing"/);
  console.log("PASS Free signup funnel wiring");
}

function main() {
  testUniqueActorsAndNoDoubleCount();
  testStageOrderAndRates();
  testZeroDenominator();
  testExistingAdvisorOpportunitiesStillWork();
  testWiring();
  console.log("All free-signup-funnel checks passed.");
}

main();
