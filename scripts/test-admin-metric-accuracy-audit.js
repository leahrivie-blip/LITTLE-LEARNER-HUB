#!/usr/bin/env node
/**
 * Targeted admin metric accuracy tests for advisor/funnel wording,
 * unique-actor math, unknown vs zero, activity, and membership state.
 * Run: npm run test:admin-metric-accuracy-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const insights = require("../server/admin-insights.js");
const revenue = require("../server/analytics-revenue.js");
const membership = require("./membership-access.js");
const testAccountGuard = require("../server/test-account-guard.js");

const ROOT = path.join(__dirname, "..");
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

function visitorEvents(count, { startedSignup = 0, completedSignup = 0, prefix = "v" } = {}) {
  const events = [];
  const users = {};
  for (let i = 0; i < count; i += 1) {
    const visitorId = `${prefix}${i}`;
    events.push({
      name: "website_visit",
      visitorId,
      sessionId: `s-${visitorId}`,
      createdAt: iso(2000 + i),
      path: "/",
    });
    if (i < startedSignup) {
      events.push({
        name: "signup_start",
        visitorId,
        sessionId: `s-${visitorId}`,
        createdAt: iso(1500 + i),
        detail: { source: "auth_modal" },
      });
    }
    if (i < completedSignup) {
      const email = `${prefix}${i}@provider.com`;
      events.push({
        name: "account_signup_complete",
        visitorId,
        sessionId: `s-${visitorId}`,
        user: email,
        createdAt: iso(1000 + i),
      });
      users[email] = {
        email,
        signupAt: iso(1000 + i),
        createdAt: iso(1000 + i),
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        metaStartTrialAt: iso(900 + i),
        trialStart: iso(900 + i),
        metaPurchaseAt: iso(800 + i),
        firstPaidInvoiceAt: iso(800 + i),
      };
      events.push({
        name: "checkout_success",
        visitorId,
        user: email,
        createdAt: iso(800 + i),
        detail: { plan: "monthly" },
      });
    }
  }
  return { events, users };
}

function funnelFor(store, range = "7d") {
  return insights.buildInsights(store, { hub: "marketing-funnel", range });
}

function advisorFor(store, range = "7d", extras = {}) {
  return insights.buildInsights(store, { hub: "advisor", range, ...extras });
}

function stageCount(funnel, id) {
  return funnel.data.stages.find((s) => s.id === id)?.count;
}

// ---------------------------------------------------------------------------
// Unique visitor + signup-start deduplication
// ---------------------------------------------------------------------------
{
  const { events, users } = visitorEvents(3, { startedSignup: 1, completedSignup: 1 });
  events.push(
    { name: "website_visit", visitorId: "v0", sessionId: "s-v0-refresh", createdAt: iso(1800), path: "/" },
    { name: "signup_start", visitorId: "v0", sessionId: "s-v0-refresh", createdAt: iso(1400), detail: { source: "auth_modal" } },
    { name: "cta_click", visitorId: "v0", sessionId: "s-v0", createdAt: iso(1600), detail: { cta: "start_free" } },
  );
  const funnel = funnelFor({ users, analyticsEvents: events, featureRequests: [] });
  assert.equal(stageCount(funnel, "visitors"), 3, "repeat website_visit does not create extra visitors");
  assert.equal(stageCount(funnel, "signupStarts"), 1, "signup_start + Start Free CTA still one actor");
  assert.equal(stageCount(funnel, "signupCompletions"), 1, "signup completions are unique emails");
  console.log("PASS unique visitor and signup-start deduplication");
}

// ---------------------------------------------------------------------------
// Funnel conversion denominators + visitor→started signup wording
// ---------------------------------------------------------------------------
{
  const { events, users } = visitorEvents(40, { startedSignup: 3, completedSignup: 3 });
  const store = { users, analyticsEvents: events, featureRequests: [] };
  const funnel = funnelFor(store, "7d");
  const advisor = advisorFor(store, "7d");
  const edge = (funnel.data.advisorTransitions || []).find((t) => t.from === "visitors" && t.to === "signupStarts");
  assert.ok(edge, "visitor → started signup edge exists");
  assert.equal(edge.fromCount, 40);
  assert.equal(edge.toCount, 3);
  assert.equal(edge.dropOffCount, 37);
  assert.equal(edge.conversionRate, 7.5);
  assert.equal(edge.advisorLabel, "Visitor → Started signup");

  const narrative = insights.describeAdvisorFunnelOpportunity(edge, "7d");
  assert.equal(narrative.evidence.startingPopulation, 40);
  assert.equal(narrative.evidence.resultingPopulation, 3);
  assert.equal(narrative.evidence.lost, 37);
  assert.equal(narrative.evidence.conversionRate, 7.5);
  assert.match(narrative.detail, /Starting population: 40 unique visitors/);
  assert.match(narrative.detail, /Resulting population: 3 started signup/);
  assert.match(narrative.detail, /37 of 40 visitors did not start signup/);
  assert.match(narrative.detail, /Conversion: 7\.5%/);
  assert.match(narrative.detail, /Time window: Last 7 days/);
  assert.match(narrative.detail, /never entered the signup flow/);
  assert.doesNotMatch(narrative.detail, /dropped out of signup/i);
  assert.doesNotMatch(narrative.title, /Visitor → Signup started/);

  const rec = (advisor.data.recommendations || []).find((r) => /Started signup/i.test(r.title));
  assert.ok(rec, "advisor rec uses Started signup wording");
  assert.match(rec.detail, /37 of 40 visitors did not start signup/);
  assert.doesNotMatch(`${rec.title} ${rec.detail}`, /dropped out of signup/i);
  assert.equal(rec.evidence.startingPopulation, 40);
  assert.equal(rec.evidence.lost, 37);
  assert.equal(rec.evidence.timeWindow, "Last 7 days");

  const banner = funnel.data.worstDropOff?.narrative?.evidence;
  assert.equal(banner.lostSentence, "37 of 40 visitors did not start signup");
  assert.equal(banner.conversionSentence, "7.5% started signup");
  console.log("PASS funnel denominators and visitor→started signup wording");
}

// ---------------------------------------------------------------------------
// Zero denominator + unknown vs measured zero
// ---------------------------------------------------------------------------
{
  const empty = insights.describeAdvisorFunnelOpportunity({
    from: "visitors",
    to: "signupStarts",
    fromCount: 0,
    toCount: 0,
    advisorLabel: "Visitor → Started signup",
  }, "today");
  assert.equal(empty.available, false);
  assert.equal(empty.evidence.conversionRate, null);
  assert.match(empty.detail, /Insufficient data/);
  assert.notEqual(empty.evidence.conversionRateLabel, "0%");
  assert.notEqual(empty.evidence.conversionRateLabel, 0);

  const measuredZero = insights.buildTransitionRow(
    { id: "visitors", label: "Visitors", count: 10 },
    { id: "signupStarts", label: "Started signup", count: 0 },
  );
  assert.equal(measuredZero.dropOffCount, 10);
  assert.equal(measuredZero.conversionRate, 0);
  assert.equal(measuredZero.conversionRateLabel, "0.0%");

  const noDenom = insights.buildTransitionRow(
    { id: "visitors", label: "Visitors", count: 0 },
    { id: "signupStarts", label: "Started signup", count: 0 },
  );
  assert.equal(noDenom.dropOffRateLabel, "Insufficient data");
  assert.equal(insights.rate(1, 0), "Insufficient data");
  console.log("PASS zero denominator vs measured zero");
}

// ---------------------------------------------------------------------------
// Time-window boundaries — same window for numerator and denominator
// ---------------------------------------------------------------------------
{
  const store = {
    users: {},
    featureRequests: [],
    analyticsEvents: [
      { name: "website_visit", visitorId: "old", sessionId: "old", createdAt: iso(20 * 86400000), path: "/" },
      { name: "website_visit", visitorId: "new", sessionId: "new", createdAt: iso(2 * 86400000), path: "/" },
      { name: "signup_start", visitorId: "new", sessionId: "new", createdAt: iso(2 * 86400000 - 1000) },
    ],
  };
  const seven = funnelFor(store, "7d");
  const thirty = funnelFor(store, "30d");
  assert.equal(stageCount(seven, "visitors"), 1);
  assert.equal(stageCount(seven, "signupStarts"), 1);
  assert.equal(stageCount(thirty, "visitors"), 2);
  const sevenEdge = seven.data.advisorTransitions.find((t) => t.from === "visitors");
  assert.equal(sevenEdge.fromCount, 1);
  assert.equal(sevenEdge.toCount, 1);
  console.log("PASS time-window boundaries stay aligned");
}

// ---------------------------------------------------------------------------
// Test/admin exclusion + lesson unique views
// ---------------------------------------------------------------------------
{
  const store = {
    users: {
      "qa@example.com": { email: "qa@example.com", plan: "Pro", signupAt: iso(1000) },
      "real@provider.com": { email: "real@provider.com", plan: "Free", signupAt: iso(1000) },
    },
    featureRequests: [],
    analyticsEvents: [
      { name: "website_visit", visitorId: "qa", user: "qa@example.com", createdAt: iso(500), path: "/" },
      { name: "website_visit", visitorId: "real", user: "real@provider.com", createdAt: iso(500), path: "/" },
      { name: "lesson_plan_view", visitorId: "real", user: "real@provider.com", createdAt: iso(400), detail: { title: "Farm Animals", lessonId: "cur-lp-preschool-farm-animals" } },
      { name: "lesson_plan_view", visitorId: "real", user: "real@provider.com", createdAt: iso(300), detail: { title: "Farm Animals", lessonId: "cur-lp-preschool-farm-animals" } },
      { name: "lesson_plan_view", visitorId: "other", user: "other@provider.com", createdAt: iso(200), detail: { title: "Farm Animals" } },
    ],
  };
  const funnel = funnelFor(store, "7d");
  assert.equal(stageCount(funnel, "visitors"), 1, "test emails excluded from funnel visitors");
  const evidence = insights.summarizeLessonViewEvidence(store.analyticsEvents, "Farm Animals");
  assert.equal(evidence.views, 3);
  assert.equal(evidence.uniqueViewers, 2);
  assert.equal(evidence.upgradeAssociationMeasured, false);
  const advisor = advisorFor(store, "7d");
  const farm = (advisor.data.recommendations || []).find((r) => /Farm Animals/.test(r.title));
  assert.ok(farm, "Farm Animals content rec uses real view counts");
  assert.match(farm.detail, /3 lesson-view events/);
  assert.match(farm.detail, /2 unique viewers/);
  assert.match(farm.detail, /does not mean the lesson causes upgrades/);
  assert.doesNotMatch(farm.detail, /before upgrading/);
  console.log("PASS test-account exclusion and lesson unique views");
}

// ---------------------------------------------------------------------------
// Inactive / trial advisor rules
// ---------------------------------------------------------------------------
{
  assert.equal(insights.isInactivePaidMemberForAdvisor({
    email: "gone@provider.com",
    plan: "Pro",
    lastSeenAt: iso(20 * 86400000),
  }), true);
  assert.equal(insights.isInactivePaidMemberForAdvisor({
    email: "never@provider.com",
    plan: "Pro",
  }), false, "missing activity timestamps are incomplete, not inactive");
  assert.equal(insights.isInactivePaidMemberForAdvisor({
    email: "test@example.com",
    plan: "Pro",
    lastSeenAt: iso(20 * 86400000),
  }), false, "test emails excluded from inactive Pro rec");

  const future = new Date(now + 24 * 3600000).toISOString();
  assert.equal(insights.isTrialEndingSoonForAdvisor({
    email: "trial@provider.com",
    trialEnd: future,
  }), true);
  assert.equal(insights.isTrialEndingSoonForAdvisor({
    email: "paid-trial@provider.com",
    trialEnd: future,
    firstPaidInvoiceAt: iso(1000),
  }), false, "already-paid trial is not a conversion opportunity");
  assert.equal(insights.isTrialEndingSoonForAdvisor({
    email: "qa@example.com",
    trialEnd: future,
  }), false);
  console.log("PASS inactive and trial advisor thresholds");
}

// ---------------------------------------------------------------------------
// Membership: Free / paid / trial / cancel-at-period-end / historical
// ---------------------------------------------------------------------------
{
  const freeUser = { email: "free@provider.com", plan: "Free", accountStatus: "Active" };
  assert.equal(membership.membershipCurrentAccessKey(freeUser), "free");
  assert.equal(membership.membershipHasProAccess(freeUser), false);

  const trialUser = {
    email: "trial@provider.com",
    plan: "Pro",
    stripeSubscriptionStatus: "trialing",
    trialEnd: new Date(now + 5 * 86400000).toISOString(),
  };
  assert.equal(membership.membershipHasProAccess(trialUser), true);
  assert.equal(membership.membershipCurrentAccessKey(trialUser), "trial");

  const paidUser = {
    email: "paid@provider.com",
    plan: "Pro",
    stripeSubscriptionStatus: "active",
    currentPeriodEnd: new Date(now + 20 * 86400000).toISOString(),
  };
  assert.equal(membership.membershipCurrentAccessKey(paidUser), "pro");

  const founding = {
    email: "found@provider.com",
    plan: "Founding",
    foundingMemberActive: true,
    stripeSubscriptionStatus: "active",
  };
  assert.equal(membership.membershipCurrentAccessKey(founding), "founding");
  assert.equal(membership.membershipHasProAccess(founding), true);

  const early = {
    email: "early@provider.com",
    plan: "Pro",
    billingOffer: "early_user",
    priceLock: "Early User",
    stripeSubscriptionStatus: "active",
  };
  assert.equal(membership.membershipCurrentAccessKey(early), "early_user");

  const canceling = {
    email: "cancel@provider.com",
    plan: "Pro",
    stripeSubscriptionStatus: "active",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: new Date(now + 10 * 86400000).toISOString(),
  };
  assert.equal(membership.membershipHasProAccess(canceling), true);
  assert.equal(membership.membershipStatusDisplay(canceling), "Cancels at Period End");
  assert.equal(membership.membershipCurrentAccessKey(canceling), "pro");

  const expired = {
    email: "ended@provider.com",
    plan: "Free",
    stripeSubscriptionStatus: "canceled",
    subscriptionStatus: "Subscription Ended",
    firstPaidInvoiceAt: iso(40 * 86400000),
  };
  assert.equal(membership.membershipHasProAccess(expired), false);
  assert.equal(membership.membershipCurrentAccessKey(expired), "free");

  const pastDue = {
    email: "due@provider.com",
    plan: "Pro",
    stripeSubscriptionStatus: "past_due",
    subscriptionStatus: "Billing Review Required",
    lastFailedPaymentAt: iso(1000),
  };
  assert.equal(membership.membershipHasProAccess(pastDue), false);
  assert.equal(membership.membershipCurrentAccessKey(pastDue), "past_due");
  console.log("PASS membership current vs historical classification");
}

// ---------------------------------------------------------------------------
// Revenue: failed/cancel excluded; twins not double-counted; list-price only
// ---------------------------------------------------------------------------
{
  const createdAt = iso(5000);
  const items = revenue.collectRevenueItems(
    [{ name: "checkout_success", user: "payer@provider.com", createdAt, detail: { monthlyPrice: 19.99 } }],
    [
      { type: "checkout_success", email: "payer@provider.com", createdAt, amount: 19.99 },
      { type: "payment_failed", email: "payer@provider.com", createdAt: iso(4000), amount: 19.99 },
      { type: "subscription_canceled", email: "payer@provider.com", createdAt: iso(3000), amount: 0 },
    ],
  );
  assert.equal(items.length, 1, "failed and cancel rows are not revenue");
  assert.equal(revenue.sumRevenueAmount(items), 19.99);

  const discounted = revenue.sumRevenueAmount([
    { amount: 13.99, detail: { monthlyPrice: 13.99 } },
  ]);
  const standard = revenue.sumRevenueAmount([
    { amount: 19.99, detail: { monthlyPrice: 19.99 } },
  ]);
  assert.equal(discounted, 13.99);
  assert.equal(standard, 19.99);
  assert.notEqual(discounted, standard, "Early User list price does not overwrite standard Pro amounts");
  console.log("PASS revenue exclusion and discount isolation");
}

// ---------------------------------------------------------------------------
// Attribution snapshot must show sample size; Insights vs Owner channels documented
// ---------------------------------------------------------------------------
{
  const advisor = advisorFor({
    users: {
      "src@provider.com": {
        email: "src@provider.com",
        signupAt: iso(1000),
        createdAt: iso(1000),
        attribution: { source: "Direct" },
      },
    },
    featureRequests: [],
    analyticsEvents: [
      { name: "website_visit", visitorId: "d1", createdAt: iso(2000), path: "/", attribution: { source: "Direct" } },
      { name: "account_signup_complete", user: "src@provider.com", visitorId: "d1", createdAt: iso(1000) },
    ],
  }, "7d", {
    marketing: {
      performance: {
        conversionBySource: [
          { source: "Direct", visitors: 4, signups: 1, paid: 0 },
          { source: "Facebook", visitors: 2, signups: 0, paid: 0 },
        ],
      },
    },
  });
  const sourceRec = (advisor.data.recommendations || []).find((r) => /double down on Direct/.test(r.title));
  assert.ok(sourceRec, "Direct source rec includes sample size");
  assert.match(sourceRec.detail, /Sample size is small \(4 visitors\)/);
  assert.match(sourceRec.detail, /not causal/);
  assert.equal(sourceRec.evidence.sampleSizeSmall, true);
  console.log("PASS marketing attribution sample-size wording");
}

// ---------------------------------------------------------------------------
// UI wiring: advisor evidence + no "people dropped out of signup"
// ---------------------------------------------------------------------------
{
  const ui = fs.readFileSync(path.join(ROOT, "admin-insights.js"), "utf8");
  assert.match(ui, /renderAdvisorEvidence/);
  assert.match(ui, /did not continue/);
  assert.match(ui, /Views \(events\)/);
  assert.doesNotMatch(ui, /drop-off \(\$\{esc\(data\.worstDropOff\.dropOffCount\)\} people\)/);
  assert.equal(testAccountGuard.shouldExcludeFromCustomerAnalytics("qa@example.com"), true);
  console.log("PASS advisor UI honesty wiring");
}

console.log("PASS admin-metric-accuracy-audit");
