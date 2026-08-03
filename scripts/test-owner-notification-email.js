#!/usr/bin/env node
/**
 * Phase 1 owner/admin notification email tests.
 * Pure renderer tests + guardrails that customer email shell / triggers stay intact.
 *
 * Run: NODE_ENV=test node scripts/test-owner-notification-email.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const owner = require("../server/owner-notification-email.js");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = process.env.OWNER_EMAIL_ARTIFACT_DIR
  || "/opt/cursor/artifacts/owner-email-previews";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

function sampleUser(overrides = {}) {
  return {
    email: "provider@example.com",
    name: "Jordan Lee",
    firstName: "Jordan",
    lastName: "Lee",
    plan: "Free",
    accountType: "home_daycare",
    role: "owner",
    programName: "Sunshine Home Daycare",
    signupAt: "2026-08-03T20:42:00.000Z",
    createdAt: "2026-08-03T20:42:00.000Z",
    lastLoginAt: "",
    lastSeenAt: "",
    attribution: {
      source: "tiktok",
      campaign: "summer-launch",
      medium: "paid_social",
      referrer: "https://www.tiktok.com/@llh",
      landingPage: "/?utm_source=tiktok",
      firstSeenAt: "2026-08-03T20:40:00.000Z",
    },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    featureUsage: {},
    ...overrides,
  };
}

function storeWith(user) {
  return { users: { [user.email]: user } };
}

function render(eventType, { user, extras, fields, message, topic, env, email } = {}) {
  const member = user || sampleUser();
  return owner.buildOwnerNotification({
    ownerEventType: eventType,
    email: email !== undefined ? email : member.email,
    name: member.name,
    topic: topic || "",
    title: topic || "",
    message: message || "",
    createdAt: "2026-08-03T20:42:00.000Z",
    fields: fields || [],
    extras: extras || {},
    store: storeWith(member),
    siteUrl: "https://littlelearnershubbyleah.com",
    env: env || { NODE_ENV: "production" },
    refId: "ref-123",
  });
}

function assertMobileSafe(html) {
  assert.match(html, /viewport/i);
  assert.match(html, /max-width:\s*640px/i);
  assert.match(html, /width:\s*100%/i);
  assert.doesNotMatch(html, /position:\s*fixed/i);
}

function assertPlainText(payload) {
  assert.ok(payload.text);
  assert.match(payload.text, /Little Learner Hub/);
  assert.match(payload.text, /Environment:/);
  assert.doesNotMatch(payload.text, /<html/i);
}

test("New Free Member email rendering", () => {
  const payload = render("admin_new_signup");
  assert.match(payload.subject, /^🎉 New Free Member:/);
  assert.match(payload.html, /Member Summary/);
  assert.match(payload.html, /Marketing Attribution/);
  assert.match(payload.html, /Engagement Snapshot/);
  assert.match(payload.html, /AI Owner Insight/);
  assert.match(payload.html, /TikTok/);
  assert.match(payload.html, /View User/);
  assert.match(payload.html, /Open User Journey/);
  assert.match(payload.html, /Open Marketing Funnel/);
  assert.match(payload.html, /Production/);
  assert.match(payload.text, /A new member created a Free account/);
  assertPlainText(payload);
  assertMobileSafe(payload.html);
});

test("Trial Started rendering", () => {
  const user = sampleUser({
    plan: "Pro",
    subscriptionStatus: "Trialing",
    trialStart: "2026-08-03T20:42:00.000Z",
    trialEnd: "2026-08-10T20:42:00.000Z",
    featureUsage: { lesson_plan_view: 3, calendar_lesson_assigned: 1 },
  });
  const payload = render("admin_new_trial", { user });
  assert.match(payload.subject, /^⭐ Trial Started:/);
  assert.match(payload.html, /7-day Pro trial/);
  assert.match(payload.html, /Trial end/);
  assert.match(payload.html, /Open Billing/);
  assert.match(payload.meta.insight, /opened several lessons/i);
});

test("Pro Monthly rendering", () => {
  const user = sampleUser({
    plan: "Pro",
    subscriptionCadence: "monthly",
    monthlyPrice: "$19.99/month",
    subscriptionStatus: "Active",
    currentPeriodEnd: "2026-09-03T20:42:00.000Z",
  });
  const payload = render("admin_new_pro", {
    user,
    extras: { plan: "Pro Monthly", billingFrequency: "monthly", amount: "$19.99/month" },
  });
  assert.match(payload.subject, /^💜 New Pro Member:/);
  assert.match(payload.html, /Billing frequency/);
  assert.match(payload.html, /\$19\.99\/month/);
  assert.match(payload.html, /Open Billing/);
  assert.doesNotMatch(payload.html, /card number|cvv|payment method id/i);
});

test("Pro Annual rendering", () => {
  const user = sampleUser({
    plan: "Pro",
    subscriptionCadence: "annual",
    monthlyPrice: "$199/year",
  });
  const payload = render("admin_new_annual", {
    user,
    extras: { plan: "Pro Annual", billingFrequency: "annual", amount: "$199/year" },
  });
  assert.match(payload.subject, /^💜 New Pro Member:/);
  assert.match(payload.html, /annual/i);
  assert.match(payload.html, /\$199\/year/);
});

test("Founding rendering", () => {
  const user = sampleUser({
    plan: "Founding",
    foundingMemberActive: true,
    foundingMemberNumber: 12,
    monthlyPrice: "$9.99/month",
    priceLock: "Lifetime",
  });
  const payload = render("admin_new_founding", { user });
  assert.match(payload.subject, /^💜 New Founding Member:/);
  assert.match(payload.html, /Founding/);
  assert.match(payload.html, /\$9\.99\/month/);
});

test("Subscription Ended rendering", () => {
  const user = sampleUser({
    plan: "Free",
    previousPlan: "Pro",
    subscriptionStatus: "Canceled",
    accessEndsAt: "2026-08-03T20:42:00.000Z",
    subscriptionStartedAt: "2026-02-01T00:00:00.000Z",
    lastLoginAt: "2026-07-20T12:00:00.000Z",
    lastSeenAt: "2026-07-01T12:00:00.000Z",
    featureUsage: { lesson_plan_view: 8 },
  });
  const payload = render("admin_subscription_canceled", { user });
  assert.match(payload.subject, /^❌ Subscription Ended:/);
  assert.match(payload.html, /Previous plan/);
  assert.match(payload.html, /Membership length/);
  assert.match(payload.meta.insight, /inactive after previously using/i);
});

test("Payment Failed rendering", () => {
  const user = sampleUser({
    plan: "Free",
    previousPlan: "Pro",
    subscriptionStatus: "Billing Review Required — Access Locked",
    monthlyPrice: "$19.99/month",
    nextPaymentRetryAt: "2026-08-05T12:00:00.000Z",
  });
  const payload = render("admin_payment_failed", {
    user,
    extras: { invoiceId: "in_123", amount: "$19.99", retryAt: "2026-08-05T12:00:00.000Z" },
  });
  assert.match(payload.subject, /^⚠️ Payment Failed:/);
  assert.match(payload.html, /Invoice ID/);
  assert.match(payload.html, /Open Billing/);
  assert.match(payload.html, /Member Summary/);
});

test("Critical billing mismatch rendering — unmatched", () => {
  const payload = owner.buildOwnerNotification({
    ownerEventType: "admin_paid_access_not_restored",
    email: "",
    message: "customer=cus_x · invoice=in_y",
    extras: {
      mismatchKind: "unmatched",
      invoiceId: "in_y",
      mismatch: "No local account for paid invoice",
    },
    siteUrl: "https://littlelearnershubbyleah.com",
    env: { NODE_ENV: "production" },
    store: { users: {} },
  });
  assert.match(payload.subject, /Paid Customer Not Matched/);
  assert.match(payload.html, /Open Admin Reconciliation/);
  assert.match(payload.html, /Exact mismatch/);
  assert.match(payload.html, /Recommended admin action/);
  assert.match(payload.html, /#b42318/);
});

test("Critical billing mismatch rendering — not restored", () => {
  const user = sampleUser({ plan: "Free" });
  const payload = render("admin_paid_access_not_restored", {
    user,
    extras: {
      subscriptionId: "sub_123",
      mismatch: 'Stripe status "active" vs local Free',
    },
  });
  assert.match(payload.subject, /Paid Access Not Restored/);
  assert.match(payload.html, /Local account match status/);
});

test("Support request rendering preserves reply-to path data", () => {
  const payload = render("support_request", {
    topic: "Billing help",
    message: "I need help with my invoice.",
    fields: [["Device/Browser", "Mobile Safari"]],
  });
  assert.match(payload.subject, /^📩 New Support Request: Billing help/);
  assert.match(payload.html, /Open Support Request/);
  assert.match(payload.html, /Reply to Member/);
  assert.match(payload.html, /mailto:provider%40example\.com/);
  assert.match(payload.html, /I need help with my invoice/);
});

test("Feature request rendering", () => {
  const payload = render("feature_request", {
    topic: "More infant songs",
    message: "Please add more circle-time songs for infants.",
    fields: [["Category", "Curriculum"], ["Age Group", "Infant"]],
  });
  assert.match(payload.subject, /^💡 New Feature Request:/);
  assert.match(payload.html, /Open Feature Requests/);
  assert.match(payload.html, /Age group/);
});

test("Bug report rendering hides private screenshot URL", () => {
  const payload = render("bug_report", {
    topic: "Calendar crash",
    message: "The calendar blanked out on save.",
    extras: {
      category: "Broken Feature",
      screenshotUrl: "https://private-storage.example/secret-token/file.png",
      deviceInfo: "iPhone",
      browserInfo: "Safari",
    },
  });
  assert.match(payload.subject, /^🐞 New Bug Report:/);
  assert.match(payload.html, /Open Bug Report/);
  assert.match(payload.html, /Screenshot/);
  assert.doesNotMatch(payload.html, /private-storage\.example/);
  assert.doesNotMatch(payload.html, /secret-token/);
});

test("Feedback rendering", () => {
  const payload = render("feedback", {
    topic: "Apple Orchard Investigators",
    message: "Loved this lesson with my toddlers.",
    extras: {
      stars: "5 / 5",
      sentiment: "positive",
      feedbackType: "Lesson Plan Feedback",
      lessonOrActivity: "apple-orchard",
    },
  });
  assert.match(payload.subject, /^⭐ New Feedback:/);
  assert.match(payload.html, /Star rating/);
  assert.match(payload.html, /Open Feedback/);
});

test("Member message rendering uses preview only", () => {
  const payload = render("member_message", {
    message: "Can you help me set up my week?",
    extras: { programName: "Sunshine Home Daycare", createdAt: "2026-08-03T20:42:00.000Z" },
  });
  assert.match(payload.subject, /^💬 New Member Message:/);
  assert.match(payload.html, /Open Conversation/);
  assert.match(payload.html, /Message Preview|Can you help me set up my week/);
});

test("Missing optional values never create empty rows", () => {
  const user = sampleUser({
    attribution: {},
    userAgent: "",
    programName: "",
    featureUsage: {},
  });
  delete user.programName;
  const payload = render("admin_new_signup", { user });
  assert.doesNotMatch(payload.html, /<td[^>]*>\s*<\/td>/);
  assert.doesNotMatch(payload.html, /Traffic source<\/td>\s*<td[^>]*>\s*<\/td>/);
  assert.match(payload.html, /No activity yet/);
  assert.match(payload.meta.insight, /Not enough activity yet/);
});

test("Long names and messages are clamped safely", () => {
  const longName = `Provider ${"A".repeat(300)}`;
  const longMessage = "x".repeat(5000);
  const user = sampleUser({ name: longName });
  const payload = render("support_request", {
    user,
    topic: "Help",
    message: longMessage,
  });
  assert.ok(payload.subject.length <= 500);
  assert.match(payload.html, /xxxx/);
  assert.ok(payload.html.length < 200000);
});

test("Mobile-safe HTML", () => {
  assertMobileSafe(render("admin_new_signup").html);
  assertMobileSafe(render("admin_payment_failed").html);
  assertMobileSafe(render("admin_paid_access_not_restored", {
    extras: { mismatchKind: "unmatched" },
    email: "",
  }).html);
});

test("Plain-text fallback", () => {
  const payload = render("admin_new_pro");
  assertPlainText(payload);
  assert.match(payload.text, /View User:/);
});

test("Correct environment label", () => {
  assert.equal(owner.resolveEnvironmentLabel({ NODE_ENV: "production" }), "Production");
  assert.equal(owner.resolveEnvironmentLabel({ NODE_ENV: "test" }), "Test");
  assert.equal(owner.resolveEnvironmentLabel({ NODE_ENV: "development" }), "Test");
  const prod = render("admin_new_signup", { env: { NODE_ENV: "production" } });
  const testEnv = render("admin_new_signup", { env: { NODE_ENV: "test" } });
  assert.match(prod.html, />Production</);
  assert.match(testEnv.html, />Test</);
});

test("Correct action links use secure admin routes", () => {
  const payload = render("admin_new_signup");
  assert.match(payload.meta.primaryAction.url, /view=admin/);
  assert.match(payload.meta.primaryAction.url, /adminPanel=users/);
  assert.match(payload.meta.primaryAction.url, /adminFocusEmail=provider%40example\.com/);
  payload.meta.secondaryActions.forEach((action) => {
    assert.ok(action.url.includes("view=admin") || action.url.startsWith("mailto:"));
  });
});

test("Source label normalization", () => {
  assert.equal(owner.normalizeSourceLabel("tiktok"), "TikTok");
  assert.equal(owner.normalizeSourceLabel("facebook"), "Facebook");
  assert.equal(owner.normalizeSourceLabel("google"), "Google");
  assert.equal(owner.normalizeSourceLabel("organic"), "Organic");
  assert.equal(owner.normalizeSourceLabel("direct"), "Direct");
  assert.equal(owner.normalizeSourceLabel(""), "");
});

test("No customer transactional shell reuse", () => {
  const payload = render("admin_new_signup");
  assert.doesNotMatch(payload.html, /Choose a New Password|Verify Email Address/);
  const indexJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(indexJs, /ownerNotificationEmail\.buildOwnerNotification/);
  assert.match(indexJs, /function transactionalEmailShell/);
  // Customer shell still exists for auth emails and is not used inside notifyAdmin.
  const notifyStart = indexJs.indexOf("async function notifyAdmin");
  const notifyEnd = indexJs.indexOf("async function notifySupportTicket");
  const notifyBody = indexJs.slice(notifyStart, notifyEnd);
  assert.doesNotMatch(notifyBody, /transactionalEmailShell/);
});

test("No trigger sendEmail flag changes for cancel-at-period-end / renewals", () => {
  const indexJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const cancelingIdx = indexJs.indexOf('type: "admin_subscription_canceling"');
  const renewedIdx = indexJs.indexOf('type: "admin_subscription_renewed"');
  const signupIdx = indexJs.indexOf('type: "admin_new_signup"');
  const payFailIdx = indexJs.indexOf('type: "admin_payment_failed"');
  assert.ok(cancelingIdx > 0);
  assert.ok(renewedIdx > 0);
  assert.ok(signupIdx > 0);
  assert.ok(payFailIdx > 0);
  assert.match(indexJs.slice(cancelingIdx, cancelingIdx + 500), /sendEmail:\s*false/);
  assert.match(indexJs.slice(renewedIdx, renewedIdx + 500), /sendEmail:\s*false/);
  assert.match(indexJs.slice(signupIdx, signupIdx + 500), /sendEmail:\s*true/);
  assert.match(indexJs.slice(payFailIdx, payFailIdx + 800), /sendEmail:\s*true/);
});

test("Customer billing lifecycle email module unchanged contract", () => {
  const billing = fs.readFileSync(path.join(ROOT, "server/billing-lifecycle-email.js"), "utf8");
  assert.match(billing, /Payment Issue With Your Little Learner Hub Subscription/);
  assert.match(billing, /Update Billing/);
});

test("Known duplicate feedback/support path still documented in app.js", () => {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /Needs Improvement \/ Suggest also land in the support ticket inbox/);
});

// Generate desktop + mobile preview artifacts for PR review.
test("Generate desktop and mobile preview artifacts", () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const scenarios = [
    ["01-new-free-member", "admin_new_signup", {}],
    ["02-trial-started", "admin_new_trial", {
      user: sampleUser({
        plan: "Pro",
        subscriptionStatus: "Trialing",
        trialEnd: "2026-08-10T20:42:00.000Z",
        featureUsage: { lesson_plan_view: 3, calendar_lesson_assigned: 1 },
      }),
    }],
    ["03-pro-monthly", "admin_new_pro", {
      user: sampleUser({ plan: "Pro", subscriptionCadence: "monthly", monthlyPrice: "$19.99/month" }),
      extras: { plan: "Pro Monthly", billingFrequency: "monthly", amount: "$19.99/month" },
    }],
    ["04-pro-annual", "admin_new_annual", {
      user: sampleUser({ plan: "Pro", subscriptionCadence: "annual", monthlyPrice: "$199/year" }),
      extras: { plan: "Pro Annual", billingFrequency: "annual", amount: "$199/year" },
    }],
    ["05-founding", "admin_new_founding", {
      user: sampleUser({ plan: "Founding", foundingMemberActive: true, monthlyPrice: "$9.99/month", foundingMemberNumber: 12 }),
    }],
    ["06-subscription-ended", "admin_subscription_canceled", {
      user: sampleUser({
        plan: "Free",
        previousPlan: "Pro",
        subscriptionStatus: "Canceled",
        accessEndsAt: "2026-08-03T20:42:00.000Z",
        subscriptionStartedAt: "2026-02-01T00:00:00.000Z",
        featureUsage: { lesson_plan_view: 8 },
        lastSeenAt: "2026-07-01T12:00:00.000Z",
      }),
    }],
    ["07-payment-failed", "admin_payment_failed", {
      user: sampleUser({ plan: "Free", previousPlan: "Pro", subscriptionStatus: "Billing Review Required — Access Locked" }),
      extras: { invoiceId: "in_123", amount: "$19.99" },
    }],
    ["08-critical-unmatched", "admin_paid_access_not_restored", {
      email: "",
      extras: { mismatchKind: "unmatched", invoiceId: "in_y", mismatch: "No local account" },
    }],
    ["09-support-request", "support_request", { topic: "Billing help", message: "Need help with my invoice." }],
    ["10-feature-request", "feature_request", { topic: "More infant songs", message: "Add songs.", fields: [["Category", "Curriculum"], ["Age Group", "Infant"]] }],
    ["11-bug-report", "bug_report", { topic: "Calendar crash", message: "Blank screen.", extras: { category: "Broken Feature", screenshotUrl: "https://private/secret.png" } }],
    ["12-feedback", "feedback", { topic: "Apple Orchard", message: "Loved it.", extras: { stars: "5 / 5", sentiment: "positive" } }],
    ["13-member-message", "member_message", { message: "Can you help me set up my week?" }],
  ];

  const indexRows = [];
  for (const [slug, eventType, opts] of scenarios) {
    const payload = render(eventType, opts);
    const desktopPath = path.join(ARTIFACT_DIR, `${slug}-desktop.html`);
    const mobilePath = path.join(ARTIFACT_DIR, `${slug}-mobile.html`);
    const desktopWrap = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${slug} desktop</title>
      <style>body{margin:0;background:#ddd;font-family:sans-serif} .frame{width:680px;margin:20px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.15)}</style>
      </head><body><p style="text-align:center">Desktop · ${payload.subject}</p><div class="frame">${payload.html}</div></body></html>`;
    const mobileWrap = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${slug} mobile</title>
      <style>body{margin:0;background:#ddd;font-family:sans-serif} .phone{width:390px;margin:20px auto;background:#fff;border:10px solid #222;border-radius:28px;overflow:hidden;min-height:700px}</style>
      </head><body><p style="text-align:center">Mobile · ${payload.subject}</p><div class="phone">${payload.html}</div></body></html>`;
    fs.writeFileSync(desktopPath, desktopWrap);
    fs.writeFileSync(mobilePath, mobileWrap);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${slug}.txt`), payload.text);
    indexRows.push(`<li><strong>${slug}</strong> — ${payload.subject}<br>
      <a href="${slug}-desktop.html">Desktop</a> · <a href="${slug}-mobile.html">Mobile</a> · <a href="${slug}.txt">Plain text</a></li>`);
  }
  fs.writeFileSync(path.join(ARTIFACT_DIR, "index.html"), `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Owner email previews</title></head>
    <body style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px">
    <h1>Phase 1 Owner Notification Email Previews</h1>
    <ol>${indexRows.join("\n")}</ol>
    </body></html>`);
  assert.ok(fs.existsSync(path.join(ARTIFACT_DIR, "index.html")));
});

console.log("");
console.log(`Owner notification email tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
