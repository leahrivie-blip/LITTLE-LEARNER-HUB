#!/usr/bin/env node
/**
 * Free activation funnel query layer (server-side only).
 * Run: npm run test:free-activation-funnel
 */
const assert = require("node:assert/strict");
const insights = require("../server/admin-insights.js");

const CUTOFF_MS = new Date(insights.FREE_ACTIVATION_ONBOARDING_COHORT_CUTOFF_ISO).getTime();

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
    detail: extras.detail || {},
    attribution: extras.attribution || {},
  };
}

function stageByKey(funnel, key) {
  return (funnel.stages || []).find((s) => s.key === key);
}

function usersMap(entries) {
  return new Map(Object.entries(entries).map(([email, user]) => [email.toLowerCase(), { email, ...user }]));
}

function testVisitorToAccountProgression() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 9000 }, now),
    ev("cta_click", { visitorId: "v1", detail: { cta: "start_free", placement: "hero" }, ago: 8000 }, now),
    ev("signup_start", { visitorId: "v1", ago: 7000 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "free@x.com", detail: { plan: "Free" }, ago: 6000 }, now),
    ev("signup_landed_free", { visitorId: "v1", user: "free@x.com", ago: 5900 }, now),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({}), () => false, {
    catalogEvents: events,
    rangeKey: "7d",
  });
  assert.equal(stageByKey(funnel, "homepageVisitors").count, 1);
  assert.equal(stageByKey(funnel, "startFreeClicks").count, 1);
  assert.equal(stageByKey(funnel, "signupStarted").count, 1);
  assert.equal(stageByKey(funnel, "accountCreated").count, 1);
  assert.equal(stageByKey(funnel, "freeSignupCompleted").count, 1);
  console.log("PASS visitor → account progression");
}

function testExploreAndLessons() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 20000 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "learner@x.com", sessionId: "s-signup", ago: 15000 }, now),
    ev("signup_landed_free", { visitorId: "v1", user: "learner@x.com", ago: 14900 }, now),
    ev("explore_lesson_plans_clicked", { visitorId: "v1", user: "learner@x.com", ago: 14800 }, now),
    ev("lesson_plan_view", {
      visitorId: "v1",
      user: "learner@x.com",
      sessionId: "s-signup",
      ago: 14000,
      detail: { resourceId: "cur-free-1", access: "Free" },
    }, now),
    ev("lesson_viewed", {
      visitorId: "v1",
      user: "learner@x.com",
      sessionId: "s-signup",
      ago: 13999,
      detail: { lessonId: "cur-free-1", access: "Free" },
    }, now),
    ev("lesson_plan_view", {
      visitorId: "v1",
      user: "learner@x.com",
      sessionId: "s-signup",
      ago: 13000,
      detail: { resourceId: "cur-free-1", access: "Free" },
    }, now),
    ev("lesson_plan_view", {
      visitorId: "v1",
      user: "learner@x.com",
      sessionId: "s-signup",
      ago: 12000,
      detail: { resourceId: "cur-free-2", access: "Free" },
    }, now),
    ev("lesson_plan_view", {
      visitorId: "v1",
      user: "learner@x.com",
      sessionId: "s-signup",
      ago: 11000,
      detail: { resourceId: "cur-pro-1", access: "Pro" },
    }, now),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({}), () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "exploreLessonPlansClicked").count, 1);
  assert.equal(stageByKey(funnel, "firstFreeLessonOpened").count, 1);
  assert.equal(stageByKey(funnel, "twoPlusFreeLessonsOpened").count, 1);
  console.log("PASS explore + Free lesson depth + Pro lesson excluded");
}

function testReturnVisitNextCalendarDay() {
  const signupAt = "2026-09-01T10:00:00.000Z";
  const nextDay = "2026-09-02T09:00:00.000Z";
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, createdAt: signupAt }),
    ev("account_signup_complete", {
      visitorId: "v1",
      user: "return@x.com",
      sessionId: "sess-a",
      createdAt: signupAt,
    }),
    ev("page_view", {
      visitorId: "v1",
      user: "return@x.com",
      sessionId: "sess-b",
      createdAt: nextDay,
      detail: { view: "lessons" },
    }),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({}), () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "returnedAfterSignup").count, 1);
  console.log("PASS return requires later calendar day");
}

function testNewSessionSameDayNotReturn() {
  const signupAt = "2026-09-01T10:00:00.000Z";
  const laterSameDay = "2026-09-01T10:10:00.000Z";
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, createdAt: signupAt }),
    ev("account_signup_complete", {
      visitorId: "v1",
      user: "return@x.com",
      sessionId: "sess-a",
      createdAt: signupAt,
    }),
    ev("page_view", {
      visitorId: "v1",
      user: "return@x.com",
      sessionId: "sess-b",
      createdAt: laterSameDay,
      detail: { view: "lessons" },
    }),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({}), () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "returnedAfterSignup").count, 0);
  console.log("PASS same-day new session is not a return");
}

function testSameSessionNotReturn() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 20000 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "same@x.com", sessionId: "sess-only", ago: 15000 }, now),
    ev("lesson_plan_view", {
      visitorId: "v1",
      user: "same@x.com",
      sessionId: "sess-only",
      ago: 14000,
      detail: { resourceId: "cur-free-1", access: "Free" },
    }, now),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({}), () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "returnedAfterSignup").count, 0);
  console.log("PASS same-session activity is not a return");
}

function testUpgradeAndCheckoutNotPaid() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 30000 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "up@x.com", ago: 20000 }, now),
    ev("upgrade_prompt_click", { visitorId: "v1", user: "up@x.com", ago: 15000, detail: { promptId: "x" } }, now),
    ev("pro_upgrade_intent", { visitorId: "v1", user: "up@x.com", ago: 15000, detail: { promptId: "x" } }, now),
    ev("checkout_start", { visitorId: "v1", user: "up@x.com", ago: 14000 }, now),
    ev("checkout_success", { visitorId: "v1", user: "up@x.com", ago: 13000, detail: { plan: "monthly" } }, now),
  ];
  const users = usersMap({
    "up@x.com": { email: "up@x.com", signupAt: iso(20000, now) },
  });
  const funnel = insights.buildFreeActivationFunnel(events, users, () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "upgradeCtaClicked").count, 1);
  assert.equal(stageByKey(funnel, "checkoutStarted").count, 1);
  assert.equal(stageByKey(funnel, "paid").count, 0);
  console.log("PASS upgrade dedupe + checkout is not paid");
}

function testAuthoritativePaid() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 40000 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "paid@x.com", ago: 30000 }, now),
  ];
  const users = usersMap({
    "paid@x.com": {
      email: "paid@x.com",
      signupAt: iso(30000, now),
      firstPaidInvoiceAt: iso(10000, now),
    },
  });
  const funnel = insights.buildFreeActivationFunnel(events, users, () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "paid").count, 1);
  console.log("PASS authoritative paid from user record");
}

function testCohorts() {
  const preSignup = new Date(CUTOFF_MS - 86400000).toISOString();
  const postSignup = new Date(CUTOFF_MS + 1000).toISOString();
  const events = [
    ev("website_visit", { visitorId: "pre", detail: { view: "home" }, createdAt: preSignup }),
    ev("account_signup_complete", { visitorId: "pre", user: "pre@x.com", createdAt: preSignup }),
    ev("website_visit", { visitorId: "post", detail: { view: "home" }, createdAt: postSignup }),
    ev("account_signup_complete", { visitorId: "post", user: "post@x.com", createdAt: postSignup }),
    ev("website_visit", { visitorId: "noise", detail: { view: "home" }, createdAt: postSignup }),
  ];
  const users = usersMap({
    "pre@x.com": { email: "pre@x.com", signupAt: preSignup },
    "post@x.com": { email: "post@x.com", signupAt: postSignup },
  });
  const pre = insights.buildFreeActivationFunnel(events, users, () => false, {
    catalogEvents: events,
    cohort: "pre_pr853",
  });
  const post = insights.buildFreeActivationFunnel(events, users, () => false, {
    catalogEvents: events,
    cohort: "post_pr853",
  });
  assert.equal(stageByKey(pre, "accountCreated").count, 1);
  assert.equal(stageByKey(post, "accountCreated").count, 1);
  assert.equal(stageByKey(post, "homepageVisitors").count, 1);
  assert.equal(stageByKey(post, "homepageVisitors").cohortContextOnly, true);
  assert.equal(stageByKey(post, "homepageVisitors").conversionFromPreviousPct, null);
  assert.equal(stageByKey(post, "accountCreated").conversionFromPreviousPct, null);
  assert.equal(stageByKey(pre, "exploreLessonPlansClicked").dataAvailable, false);
  console.log("PASS pre/post cohort filters and context-only pre-signup stages");
}

function testPostCohortNoMisleadingHomepageConversion() {
  const postSignup = new Date(CUTOFF_MS + 1000).toISOString();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, createdAt: postSignup }),
    ev("website_visit", { visitorId: "v2", detail: { view: "home" }, createdAt: postSignup }),
    ev("website_visit", { visitorId: "v3", detail: { view: "home" }, createdAt: postSignup }),
    ev("account_signup_complete", { visitorId: "v1", user: "only@x.com", createdAt: postSignup }),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({
    "only@x.com": { email: "only@x.com", signupAt: postSignup },
  }), () => false, {
    catalogEvents: events,
    cohort: "post_pr853",
  });
  assert.equal(stageByKey(funnel, "homepageVisitors").count, 1);
  assert.equal(stageByKey(funnel, "accountCreated").count, 1);
  assert.equal(stageByKey(funnel, "accountCreated").overallConversionPct, 100);
  assert.equal(stageByKey(funnel, "homepageVisitors").overallConversionPct, null);
  console.log("PASS post cohort does not imply 3 visitors → 1 account step conversion");
}

function testTwoDistinctLessonsWithinFiveSeconds() {
  const now = Date.now();
  const events = [
    ev("account_signup_complete", { visitorId: "v1", user: "two@x.com", ago: 20000 }, now),
    ev("signup_landed_free", { visitorId: "v1", user: "two@x.com", ago: 19900 }, now),
    ev("lesson_plan_view", {
      visitorId: "v1",
      user: "two@x.com",
      ago: 15000,
      detail: { resourceId: "cur-free-a", access: "Free" },
    }, now),
    ev("lesson_plan_view", {
      visitorId: "v1",
      user: "two@x.com",
      ago: 14999,
      detail: { resourceId: "cur-free-b", access: "Free" },
    }, now),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({}), () => false, {
    catalogEvents: events,
  });
  assert.equal(stageByKey(funnel, "twoPlusFreeLessonsOpened").count, 1);
  console.log("PASS two different Free lessons within 5s count as two");
}

function testPaidBeforeSignupNotCounted() {
  const now = Date.now();
  const signupAt = iso(10000, now);
  const paidBefore = iso(20000, now);
  const events = [
    ev("account_signup_complete", { visitorId: "v1", user: "early@x.com", createdAt: signupAt }, now),
  ];
  const users = usersMap({
    "early@x.com": {
      email: "early@x.com",
      signupAt: signupAt,
      firstPaidInvoiceAt: paidBefore,
    },
  });
  const funnel = insights.buildFreeActivationFunnel(events, users, () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "paid").count, 0);
  console.log("PASS paid timestamp before signup is excluded");
}

function testUpgradeBeforeSignupNotCounted() {
  const signupAt = "2026-09-10T12:00:00.000Z";
  const beforeSignup = "2026-09-09T12:00:00.000Z";
  const events = [
    ev("upgrade_prompt_click", {
      visitorId: "v1",
      user: "late@x.com",
      createdAt: beforeSignup,
      detail: { promptId: "x" },
    }),
    ev("account_signup_complete", { visitorId: "v1", user: "late@x.com", createdAt: signupAt }),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({
    "late@x.com": { email: "late@x.com", signupAt: signupAt },
  }), () => false, { catalogEvents: events });
  assert.equal(stageByKey(funnel, "upgradeCtaClicked").count, 0);
  console.log("PASS upgrade before signup not counted");
}

function testHistoricalUnavailable() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 5000 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "old@x.com", ago: 4000 }, now),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, new Map(), () => false, {
    catalogEvents: events,
    rangeKey: "7d",
  });
  assert.equal(stageByKey(funnel, "freeSignupCompleted").dataAvailable, false);
  assert.equal(stageByKey(funnel, "freeSignupCompleted").count, null);
  assert.equal(stageByKey(funnel, "exploreLessonPlansClicked").dataAvailable, false);
  console.log("PASS historical availability");
}

function testNoEmailsInResponse() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 5000 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "secret@provider.com", ago: 4000 }, now),
    ev("signup_landed_free", { visitorId: "v1", user: "secret@provider.com", ago: 3900 }, now),
  ];
  const funnel = insights.buildFreeActivationFunnel(events, usersMap({
    "secret@provider.com": { email: "secret@provider.com", signupAt: iso(4000, now) },
  }), () => false, { catalogEvents: events });
  const blob = JSON.stringify(funnel);
  assert.doesNotMatch(blob, /secret@provider\.com/);
  console.log("PASS no raw emails in funnel payload");
}

function testFreeSignupFunnelUnchanged() {
  const now = Date.now();
  const events = [
    ev("website_visit", { visitorId: "v1", detail: { view: "home" }, ago: 9000 }, now),
    ev("cta_click", { visitorId: "v1", detail: { cta: "start_free", placement: "hero" }, ago: 8000 }, now),
    ev("signup_start", { visitorId: "v1", ago: 7000 }, now),
    ev("signup_form_submit", { visitorId: "v1", user: "free@x.com", ago: 6500 }, now),
    ev("account_signup_complete", { visitorId: "v1", user: "free@x.com", ago: 6000 }, now),
    ev("signup_landed_free", { visitorId: "v1", user: "free@x.com", ago: 5900 }, now),
  ];
  const funnel = insights.buildFreeSignupFunnel(events, () => false, { catalogEvents: events, rangeKey: "7d" });
  assert.equal(funnel.stages.find((s) => s.id === "landedFree").uniqueActors, 1);
  console.log("PASS buildFreeSignupFunnel unchanged");
}

function main() {
  testVisitorToAccountProgression();
  testExploreAndLessons();
  testReturnVisitNextCalendarDay();
  testNewSessionSameDayNotReturn();
  testSameSessionNotReturn();
  testUpgradeAndCheckoutNotPaid();
  testAuthoritativePaid();
  testCohorts();
  testPostCohortNoMisleadingHomepageConversion();
  testTwoDistinctLessonsWithinFiveSeconds();
  testPaidBeforeSignupNotCounted();
  testUpgradeBeforeSignupNotCounted();
  testHistoricalUnavailable();
  testNoEmailsInResponse();
  testFreeSignupFunnelUnchanged();
  console.log("\nAll free-activation-funnel checks passed.");
}

main();
