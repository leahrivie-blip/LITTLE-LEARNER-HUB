#!/usr/bin/env node
/**
 * Email engagement system tests (onboarding + weekly What's New).
 * Run: NODE_ENV=test node scripts/test-email-engagement.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4187;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.email-engagement-test-store-${process.pid}.json`);
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-admin-pass";
const ADMIN_ACCESS_CODE = "test-admin-code";

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function request(method, urlPath, { body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

function readStoreFile() {
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const moduleJs = fs.readFileSync(path.join(ROOT, "server", "email-engagement.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(moduleJs, /createEmailEngagement/);
  assert.match(moduleJs, /maybeSendWelcomeOnSignup/);
  assert.match(moduleJs, /runWeeklyWhatsNew/);
  assert.match(moduleJs, /no_new_content/);
  assert.match(moduleJs, /newlyPublishedCurriculum/);
  assert.match(moduleJs, /Send Feedback or Report a Bug/);
  assert.match(moduleJs, /What’s coming next/);
  assert.match(moduleJs, /New lesson plans are added regularly/);
  assert.match(moduleJs, /runPreflightAudit/);
  assert.match(moduleJs, /prepareOneTimeWelcomeUpdate/);
  assert.match(moduleJs, /sendOneTimeWelcomeUpdate/);
  assert.match(moduleJs, /one_time_welcome_update/);
  assert.match(moduleJs, /intentionally NEVER scheduled/);
  assert.match(moduleJs, /willSend: false/);
  assert.match(serverJs, /\/api\/admin\/email-engagement/);
  assert.match(serverJs, /onboardingWelcome\.maybeDeliverOnSignup/);
  assert.match(serverJs, /preflight-audit/);
  assert.match(serverJs, /prepare-one-time/);
  assert.match(serverJs, /preview-one-time/);
  assert.match(serverJs, /send-one-time/);
  assert.match(moduleJs, /previewOneTimeWelcomeUpdate/);
  assert.match(moduleJs, /campaign_already_claimed/);
  assert.match(serverJs, /publishedAt/);
  assert.match(serverJs, /emailEngagement\.startScheduler/);
  assert.match(serverJs, /EMAIL_AUTOMATIONS_ENABLED/);
  assert.match(serverJs, /EXPECTED_EMAIL_FROM_ADDRESS/);
  assert.match(serverJs, /\/api\/admin\/email-diagnostics/);
  assert.match(serverJs, /resolveSupportEmailFrom/);
  assert.match(moduleJs, /automations_disabled/);
  assert.match(moduleJs, /onboardingEnabled: false/);
  assert.match(moduleJs, /buildAudienceReport/);
  assert.match(appJs, /renderAdminEmailEngagement/);
  assert.match(appJs, /adminEmailFreeCampaignTest/);
  assert.match(appJs, /adminEmailFreeCampaignSend/);
  assert.match(appJs, /adminEmailRunPreflightAudit/);
  assert.match(appJs, /adminEmailPrepareOneTime/);
  assert.match(appJs, /adminEmailSendOneTime/);
  assert.match(appJs, /"emails"/);
  assert.match(html, /admin-emails-panel/);
  assert.match(html, /adminEmailEngagementApp/);
  console.log("PASS  email engagement markers present");

  // Unit: skip-if-empty + week key helpers
  const { weekKey, isMonday, createEmailEngagement, defaultEmailEngagementStore } = require("../server/email-engagement.js");
  assert.match(weekKey(new Date("2026-07-13T12:00:00Z")), /^2026-W\d{2}$/);
  assert.equal(typeof isMonday(new Date()), "boolean");

  const fakeEvents = [];
  let fakeStore = {
    users: {
      "new@example.com": {
        email: "new@example.com",
        firstName: "Ava",
        signupAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    siteContent: {
      curriculum: {
        lessonPlans: [],
        activities: [],
        resources: [],
      },
    },
    emailEngagement: defaultEmailEngagementStore(),
  };
  // Unit tests exercise campaign paths with automations explicitly enabled.
  fakeStore.emailEngagement.settings.onboardingEnabled = true;
  fakeStore.emailEngagement.settings.weeklyWhatsNewEnabled = true;

  const campaignDeliveries = new Map();
  const eng = createEmailEngagement({
    sendEmail: async (opts) => {
      fakeEvents.push(opts || "send");
      return { sent: true, configured: true, provider: "test" };
    },
    SITE_URL: "https://littlelearnershubbyleah.com",
    htmlEscape: (v) => String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"),
    readStore: () => fakeStore,
    writeStore: (s) => { fakeStore = s; },
    writeStoreAsync: async (s) => { fakeStore = s; },
    claimEmailCampaignDelivery: async ({ campaignId, email, contentHash }) => {
      const key = `${campaignId}:${String(email || "").trim().toLowerCase()}`;
      if (campaignDeliveries.has(key)) return { claimed: false, delivery: campaignDeliveries.get(key) };
      const delivery = {
        campaign_id: campaignId,
        email: String(email || "").trim().toLowerCase(),
        content_hash: contentHash,
        status: "pending",
        claimed_at: new Date().toISOString(),
      };
      campaignDeliveries.set(key, delivery);
      return { claimed: true, delivery };
    },
    completeEmailCampaignDelivery: async ({ campaignId, email, status, error = "" }) => {
      const key = `${campaignId}:${String(email || "").trim().toLowerCase()}`;
      const delivery = campaignDeliveries.get(key);
      if (delivery) Object.assign(delivery, { status, error, completed_at: new Date().toISOString() });
    },
    unsubscribeUrlForEmail: (email) => `https://littlelearnershubbyleah.com/unsubscribe?email=${encodeURIComponent(email)}`,
    supportEmailTo: () => "leahrivie@gmail.com",
    isCurriculumLessonPublic: (status) => status === "published" || status === "featured",
    areAutomationsEnabled: () => true,
  });

  await test("defaults keep onboarding and weekly off", async () => {
    const defaults = defaultEmailEngagementStore();
    assert.equal(defaults.settings.onboardingEnabled, false);
    assert.equal(defaults.settings.weeklyWhatsNewEnabled, false);
  });

  await test("kill-switch blocks campaign sends", async () => {
    const blockedEng = createEmailEngagement({
      sendEmail: async () => ({ sent: true, configured: true, provider: "test" }),
      SITE_URL: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
      readStore: () => fakeStore,
      writeStore: (s) => { fakeStore = s; },
      writeStoreAsync: async (s) => { fakeStore = s; },
      isCurriculumLessonPublic: () => true,
      areAutomationsEnabled: () => false,
    });
    const welcome = await blockedEng.maybeSendWelcomeOnSignup("new@example.com");
    assert.equal(welcome.reason, "automations_disabled");
    const weekly = await blockedEng.runWeeklyWhatsNew({ force: true });
    assert.equal(weekly.reason, "automations_disabled");
  });

  await test("weekly digest skips when no new lessons", async () => {
    const result = await eng.runWeeklyWhatsNew({ force: true });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "no_new_content");
    assert.equal(fakeEvents.length, 0);
  });

  await test("welcome is once-only", async () => {
    fakeEvents.length = 0;
    const first = await eng.maybeSendWelcomeOnSignup("new@example.com");
    assert.equal(first.sent, true);
    assert.equal(fakeEvents.length, 1);
    const second = await eng.maybeSendWelcomeOnSignup("new@example.com");
    assert.equal(second.sent, false);
    assert.equal(second.reason, "already_sent");
    assert.equal(fakeEvents.length, 1);
    assert.ok(fakeStore.users["new@example.com"].onboardingEmails.welcomeSentAt);
  });

  await test("onboarding drip advances tips then explore once", async () => {
    fakeEvents.length = 0;
    // tips delay satisfied by signupAt ~6 days ago
    const tips = await eng.sendOnboardingStep("new@example.com", "tips");
    assert.equal(tips.sent, true);
    const tipsAgain = await eng.sendOnboardingStep("new@example.com", "tips");
    assert.equal(tipsAgain.reason, "already_sent");
    const explore = await eng.sendOnboardingStep("new@example.com", "explore");
    assert.equal(explore.sent, true);
    const exploreAgain = await eng.sendOnboardingStep("new@example.com", "explore");
    assert.equal(exploreAgain.reason, "already_sent");
  });

  await test("weekly digest sends when lessons exist", async () => {
    fakeEvents.length = 0;
    fakeStore.siteContent.curriculum.lessonPlans = [{
      id: "lesson-1",
      title: "Colors Everywhere",
      age: "Preschool",
      theme: "Colors",
      status: "published",
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    fakeStore.siteContent.curriculum.activities = [{
      id: "act-1",
      lessonPlanId: "lesson-1",
      title: "Color Sort",
      status: "published",
      activityCategory: "STEM/Discovery",
      publishedAt: new Date().toISOString(),
    }];
    fakeStore.siteContent.curriculum.resources = [{
      id: "res-1",
      title: "Color Cards",
      status: "published",
      resourceCategory: "Printables",
      lessonPlanIds: ["lesson-1"],
      publishedAt: new Date().toISOString(),
      fileData: "https://example.com/color.pdf",
    }];
    // Reset weekly stamp
    fakeStore.users["new@example.com"].weeklyWhatsNew = {};
    fakeStore.emailEngagement.settings.lastWeeklyRunAt = "";
    const result = await eng.runWeeklyWhatsNew({ force: true });
    assert.equal(result.sent, 1);
    assert.equal(result.digest.lessons.length, 1);
    assert.equal(result.digest.lessons[0].activityCount, 1);
    assert.equal(result.digest.lessons[0].resourceCount, 1);
    assert.ok(result.digest.lessons[0].url.includes("lesson=lesson-1"));
    assert.equal(result.digest.activities.length, 1);
    assert.equal(result.digest.resources.length, 1);
    assert.equal(fakeEvents.length, 1);
    assert.ok(fakeStore.users["new@example.com"].weeklyWhatsNew.lastSentWeekKey);
  });

  await test("onboarding copy matches designed flow", async () => {
    const welcome = eng.buildOnboardingContent("welcome", { firstName: "Ava" }, {
      siteUrl: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
    });
    assert.match(welcome.text, /New lesson plans are added regularly/);
    assert.match(welcome.text, /feedback/i);
    const tips = eng.buildOnboardingContent("tips", { firstName: "Ava" }, {
      siteUrl: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
    });
    assert.match(tips.text, /bug/i);
    assert.match(tips.text, /feedback/i);
    const explore = eng.buildOnboardingContent("explore", { firstName: "Ava" }, {
      siteUrl: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
    });
    assert.match(explore.text, /coming next/i);
    assert.match(explore.text, /What’s New/);
  });

  await test("preflight audit unlocks one-time send and blocks repeats", async () => {
    fakeEvents.length = 0;
    campaignDeliveries.clear();
    global.__llhOneTimeWelcomeUpdateRunning = false;
    // Use non-probe domains (example.com is treated as test/probe by looksLikeTestEmail).
    fakeStore.users = {
      "one@llhprovider.com": {
        email: "one@llhprovider.com",
        firstName: "One",
        accountStatus: "Active",
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      "two@llhprovider.com": {
        email: "two@llhprovider.com",
        firstName: "Two",
        accountStatus: "Active",
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      "gone@llhprovider.com": {
        email: "gone@llhprovider.com",
        firstName: "Gone",
        accountStatus: "Disabled",
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    };
    fakeStore.messages = [{ id: "msg-1" }, { id: "msg-2" }];
    fakeStore.supportTickets = [{ id: "t1", status: "New", message: "help" }];
    fakeStore.featureRequests = [];
    fakeStore.bugReports = [];
    fakeStore.feedbackItems = [];
    fakeStore.notifications = [];
    fakeStore.emailEngagement = defaultEmailEngagementStore();
    fakeStore.emailEngagement.settings.onboardingEnabled = true;
    fakeStore.emailEngagement.settings.weeklyWhatsNewEnabled = true;

    const blocked = await eng.sendOneTimeWelcomeUpdate({ confirm: true, auditToken: "nope" });
    assert.equal(blocked.reason, "audit_required");

    const audit = await eng.runPreflightAudit({
      store: fakeStore,
      adminEmail: "owner@llhprovider.com",
      nodeEnv: "test",
      allowLocalForTests: true,
    });
    assert.equal(audit.auditPassed, true, JSON.stringify(audit.checks, null, 2));
    assert.equal(audit.counts.totalUsers, 3);
    assert.equal(audit.counts.activeUsers, 2);
    assert.equal(audit.counts.totalMessages, 2);
    assert.equal(audit.counts.emailRecipients, 2);
    assert.ok(audit.auditToken);
    assert.equal(audit.sendUnlocked, true);

    const prepared = await eng.prepareOneTimeWelcomeUpdate({
      store: fakeStore,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(prepared.prepared, true);
    assert.equal(prepared.sent, false);
    assert.equal(prepared.willSend, false);
    assert.equal(prepared.recipients.count, 2);
    assert.match(prepared.subject, /New Teaching Kits Are Here/i);
    assert.match(prepared.textPreview, /one-time product-update email/i);
    assert.match(prepared.textPreview, /Teaching Kits/i);
    assert.equal(fakeEvents.length, 0, "prepare must not send email");

    const unconfirmed = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: false,
    });
    assert.equal(unconfirmed.reason, "confirmation_required");

    const sent = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(sent.skipped, false);
    assert.equal(sent.sent, 2);
    assert.equal(sent.recipients, 2);
    assert.equal(sent.recurring, false);
    assert.equal(fakeEvents.length, 2);
    assert.equal(fakeEvents[0].replyTo, "leahrivie@gmail.com");
    assert.match(String(fakeEvents[0].listUnsubscribeUrl || ""), /unsubscribe/);

    const again = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(again.reason, "already_sent");
    assert.equal(fakeEvents.length, 2);
  });

  await test("Free re-engagement campaign is segmented, compliant, test-first, and once-only", async () => {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    const campaignSends = [];
    const campaignDeliveries = new Map();
    let campaignStore = {
      users: {
        "free@example.com": { email: "free@example.com", plan: "Free", subscriptionStatus: "Free Plan", signupAt: now },
        "pro@example.com": { email: "pro@example.com", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", stripeSubscriptionStatus: "active", signupAt: now },
        "founding@example.com": { email: "founding@example.com", plan: "Founding", foundingMemberActive: true, subscriptionStatus: "Founding Member Subscription Active", stripeSubscriptionStatus: "active", signupAt: now },
        "trial@example.com": { email: "trial@example.com", plan: "Pro", trialStatus: "In Trial", trialEnd: future, stripeSubscriptionStatus: "trialing", signupAt: now },
        "pastdue@example.com": { email: "pastdue@example.com", plan: "Pro", subscriptionStatus: "Past Due", stripeSubscriptionStatus: "past_due", signupAt: now },
        "admin@example.com": { email: "admin@example.com", plan: "Free", subscriptionStatus: "Free Plan", role: "admin", signupAt: now },
        "promo@example.com": { email: "promo@example.com", plan: "Free", subscriptionStatus: "Free Plan", promoRedeemedAt: now, signupAt: now },
        "store-promo@example.com": { email: "store-promo@example.com", plan: "Free", subscriptionStatus: "Free Plan", signupAt: now },
        "historical-founding@example.com": { email: "historical-founding@example.com", plan: "Free", subscriptionStatus: "Subscription Ended", foundingMemberHistorical: true, signupAt: now },
        "manual@example.com": { email: "manual@example.com", plan: "Free", subscriptionStatus: "Free Plan", manualAccessGranted: true, signupAt: now },
        "disabled@example.com": { email: "disabled@example.com", plan: "Free", subscriptionStatus: "Free Plan", accountStatus: "Disabled", signupAt: now },
        "unsubscribed@example.com": { email: "unsubscribed@example.com", plan: "Free", subscriptionStatus: "Free Plan", signupAt: now, emailPrefs: { unsubscribedAt: now } },
        "invalid": { email: "invalid", plan: "Free", subscriptionStatus: "Free Plan", signupAt: now },
        "owner@example.com": { email: "owner@example.com", plan: "Free", subscriptionStatus: "Free Plan", signupAt: now },
        "duplicate-record": { email: "free@example.com", plan: "Free", subscriptionStatus: "Free Plan", signupAt: now },
      },
      promoRedemptions: [{ email: "store-promo@example.com", code: "TRYPRO3", redeemedAt: now }],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const campaign = createEmailEngagement({
      sendEmail: async (opts) => {
        campaignSends.push(opts);
        return { sent: true, configured: true, provider: "test", messageId: `msg_${campaignSends.length}` };
      },
      SITE_URL: "https://little-learner-hub.onrender.com",
      reviewEmail: "owner@example.com",
      unsubscribeUrlForEmail: (email) => `https://little-learner-hub.onrender.com/unsubscribe?email=${encodeURIComponent(email)}&token=signed`,
      postalAddress: "123 Main St, Test City, MI 48000",
      htmlEscape: (v) => String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
      readStore: () => campaignStore,
      readStoreFresh: async () => campaignStore,
      writeStore: (s) => { campaignStore = s; },
      writeStoreAsync: async (s) => { campaignStore = s; },
      claimEmailCampaignDelivery: async ({ campaignId, email, contentHash }) => {
        const key = `${campaignId}:${email}`;
        if (campaignDeliveries.has(key)) return { claimed: false, delivery: campaignDeliveries.get(key) };
        const delivery = { campaign_id: campaignId, email, content_hash: contentHash, status: "pending", error: "" };
        campaignDeliveries.set(key, delivery);
        return { claimed: true, delivery };
      },
      completeEmailCampaignDelivery: async ({ campaignId, email, status, provider = "", messageId = "", error = "" }) => {
        const delivery = campaignDeliveries.get(`${campaignId}:${email}`);
        Object.assign(delivery, { status, provider, message_id: messageId, error });
      },
      listEmailCampaignDeliveries: async (campaignId) => (
        [...campaignDeliveries.values()].filter((delivery) => delivery.campaign_id === campaignId)
      ),
      patchEmailCampaignState: async (campaignId, patch) => {
        campaignStore.emailEngagement.campaigns = campaignStore.emailEngagement.campaigns || {};
        campaignStore.emailEngagement.campaigns[campaignId] = {
          ...(campaignStore.emailEngagement.campaigns[campaignId] || {}),
          ...patch,
        };
        return campaignStore.emailEngagement.campaigns[campaignId];
      },
      isCurriculumLessonPublic: () => true,
    });
    const audience = campaign.freeReengagementAudience(campaignStore);
    assert.deepEqual(audience.eligible.map((entry) => entry.email), ["free@example.com"]);
    assert.deepEqual(audience.invalid, ["invalid"]);
    assert.equal(audience.excluded.admin, 3);
    assert.equal(audience.excluded.promo, 2);
    assert.equal(audience.excluded.unsubscribed, 1);
    assert.equal(audience.excluded.disabled, 1);
    assert.equal(audience.excluded.paidTrialOrPastDue, 5);
    assert.equal(audience.excluded.duplicateEmail, 1);

    const blocked = await campaign.runFreeReengagementCampaign({
      confirmCampaignId: campaign.FREE_REENGAGEMENT_CAMPAIGN_ID,
    });
    assert.equal(blocked.reason, "successful_review_test_required");
    assert.equal(campaignSends.length, 0);

    const testCopy = await campaign.sendFreeReengagementTest();
    assert.equal(testCopy.sent, true);
    assert.equal(testCopy.recipient, "owner@example.com");
    assert.equal(campaignSends[0].subject, "🎉 Little Learner Hub Has Been Updated!");
    assert.match(campaignSends[0].text, /New lesson plans added/);
    assert.match(campaignSends[0].html, /Upgrade to Pro for \$19\.99\/month/);
    assert.match(campaignSends[0].html, /123 Main St/);
    assert.match(campaignSends[0].listUnsubscribeUrl, /token=signed/);

    const awaitingReview = await campaign.runFreeReengagementCampaign({
      confirmCampaignId: campaign.FREE_REENGAGEMENT_CAMPAIGN_ID,
    });
    assert.equal(awaitingReview.reason, "human_review_approval_required");

    const concurrentResults = await Promise.all([
      campaign.runFreeReengagementCampaign({
        confirmCampaignId: campaign.FREE_REENGAGEMENT_CAMPAIGN_ID,
        reviewApproved: true,
      }),
      campaign.runFreeReengagementCampaign({
        confirmCampaignId: campaign.FREE_REENGAGEMENT_CAMPAIGN_ID,
        reviewApproved: true,
      }),
    ]);
    const sent = concurrentResults.find((result) => result.successfulSends === 1);
    const blockedConcurrent = concurrentResults.find((result) => result.reason);
    assert.ok(sent);
    assert.ok(["campaign_already_claimed", "campaign_already_in_progress"].includes(blockedConcurrent.reason));
    assert.equal(sent.totalFreeUsersEmailed, 1);
    assert.equal(sent.successfulSends, 1);
    assert.equal(sent.failedSends, 0);
    assert.equal(campaignSends[1].to, "free@example.com");
    assert.equal(campaignDeliveries.get(`${campaign.FREE_REENGAGEMENT_CAMPAIGN_ID}:free@example.com`).status, "sent");
  });


  // Integration: spawn server without email keys (soft-fail)
  fs.writeFileSync(STORE, JSON.stringify({
    users: {},
    emailEngagement: defaultEmailEngagementStore(),
    siteContent: {
      curriculum: { lessonPlans: [], activities: [], resources: [], updatedAt: "" },
      updatedAt: "",
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      SITE_URL: BASE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      // Automations stay off by default in production; enable for engagement path tests.
      EMAIL_AUTOMATIONS_ENABLED: "true",
      // Explicitly clear email keys for soft-fail assertions
      RESEND_API_KEY: "",
      SENDGRID_API_KEY: "",
      POSTMARK_SERVER_TOKEN: "",
      SUPPORT_EMAIL_FROM: "",
      SUPPORT_EMAIL_PROVIDER: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();

    let adminToken = "";
    await test("admin can login for email engagement", async () => {
      const res = await request("POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      adminToken = res.json.token;
      assert.ok(adminToken);
    });

    await test("signup does not auto-welcome while onboarding store flag is off", async () => {
      const email = "signup-teacher@example.com";
      const first = await request("POST", "/api/account/profile", {
        body: {
          email,
          firstName: "Sam",
          lastName: "Lee",
          signup: true,
          lastLogin: true,
        },
      });
      assert.equal(first.status, 200, JSON.stringify(first.json));
      await new Promise((r) => setTimeout(r, 200));
      const store = readStoreFile();
      assert.ok(store.users[email].signupAt);
      assert.equal(Boolean(store.users[email].onboardingEmails?.welcomeSentAt), false);
    });

    await test("signup stamps free welcome once when provider missing", async () => {
      // Signup uses onboarding-welcome free-welcome (not the drip onboardingEmails stamp).
      const email = "signup-welcome@example.com";
      const first = await request("POST", "/api/account/profile", {
        body: {
          email,
          firstName: "Sam",
          lastName: "Lee",
          signup: true,
          lastLogin: true,
        },
      });
      assert.equal(first.status, 200, JSON.stringify(first.json));
      let store = null;
      let stamp = "";
      for (let i = 0; i < 20; i += 1) {
        store = readStoreFile();
        stamp = store.users[email]?.onboardingWelcome?.freeWelcomeSentAt || "";
        if (stamp) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(stamp, "free welcome should stamp even when email provider is unconfigured");

      const second = await request("POST", "/api/account/profile", {
        body: { email, firstName: "Sam", signup: true, lastLogin: true },
      });
      assert.equal(second.status, 200);
      await new Promise((r) => setTimeout(r, 150));
      const store2 = readStoreFile();
      assert.equal(
        stamp,
        store2.users[email].onboardingWelcome.freeWelcomeSentAt,
      );
      const freeWelcomes = (store2.messages || []).filter(
        (m) => m.toEmail === email && m.channel === "onboarding_welcome" && (m.onboardingSequenceId || "free-welcome") === "free-welcome",
      );
      assert.equal(freeWelcomes.length, 1, "free welcome must not duplicate");
    });

    await test("admin email engagement summary endpoint", async () => {
      const res = await request("GET", `/api/admin/email-engagement?adminToken=${encodeURIComponent(adminToken)}`);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.ok, true);
      assert.ok(res.json.summary);
      assert.ok(Array.isArray(res.json.onboardingSteps));
      assert.equal(res.json.onboardingSteps.length, 3);
      assert.equal(res.json.supportEmail.ready, false);
      assert.equal(res.json.freeReengagement.ready, false);
      assert.equal(res.json.supportEmail.fromEmail, "support@littlelearnershubbyleah.com");
      assert.equal(res.json.automations.enabled, true);
      assert.ok(res.json.audience);
    });

    await test("re-engagement safety blocks test and send when provider is unconfigured", async () => {
      const preview = await request("POST", "/api/admin/email-engagement/free-reengagement-preview", {
        body: { adminToken },
      });
      assert.equal(preview.status, 200, JSON.stringify(preview.json));
      assert.equal(preview.json.safety.emailService.ready, false);
      assert.equal(preview.json.safety.atomicDeliveryReady, false);
      const testCopy = await request("POST", "/api/admin/email-engagement/free-reengagement-test", {
        body: { adminToken },
      });
      assert.equal(testCopy.status, 503, JSON.stringify(testCopy.json));
      const send = await request("POST", "/api/admin/email-engagement/free-reengagement-send", {
        body: { adminToken, confirmCampaignId: "free-reengagement-2026-07" },
      });
      assert.equal(send.status, 503, JSON.stringify(send.json));
      const publicStatus = await request("GET", "/api/email-campaign/free-reengagement-status");
      assert.equal(publicStatus.status, 200);
      assert.equal(publicStatus.json.status, "not_queued");
    });

    await test("signed unsubscribe page and one-click endpoint update marketing preferences", async () => {
      const email = "signup-teacher@example.com";
      const token = crypto.createHmac("sha256", ADMIN_ACCESS_CODE).update(email).digest("hex");
      const query = `email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
      const page = await request("GET", `/unsubscribe?${query}`);
      assert.equal(page.status, 200);
      assert.match(page.json.raw, /Unsubscribe from marketing emails/);
      const result = await request("POST", `/api/email/unsubscribe-one-click?${query}`);
      assert.equal(result.status, 200);
      const updated = readStoreFile().users[email];
      assert.equal(updated.emailPrefs.marketing, false);
      assert.ok(updated.emailPrefs.unsubscribedAt);
    });

    
    await test("admin email diagnostics exposes canonical From", async () => {
      const res = await request("GET", `/api/admin/email-diagnostics?adminToken=${encodeURIComponent(adminToken)}`);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.diagnostics.fromEmail, "support@littlelearnershubbyleah.com");
      assert.equal(res.json.diagnostics.domain, "littlelearnershubbyleah.com");
      assert.equal(res.json.diagnostics.domainMatchesVerifiedTarget, true);
      assert.match(res.json.diagnostics.fromAddress, /Little Learner Hub/);
    });

    await test("admin weekly force run skips empty curriculum", async () => {
      const res = await request("POST", "/api/admin/email-engagement/run-weekly", {
        body: { adminToken, force: true },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.result.reason, "no_new_content");
      assert.equal(res.json.result.skipped, true);
    });

    await test("admin can toggle settings", async () => {
      const res = await request("POST", "/api/admin/email-engagement/settings", {
        body: { adminToken, onboardingEnabled: false, weeklyWhatsNewEnabled: true },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.settings.onboardingEnabled, false);
      // restore
      await request("POST", "/api/admin/email-engagement/settings", {
        body: { adminToken, onboardingEnabled: true, weeklyWhatsNewEnabled: true },
      });
    });

    await test("admin preflight audit and one-time send endpoints", async () => {
      for (const email of ["bulk-a@llhprovider.com", "bulk-b@llhprovider.com"]) {
        const profile = await request("POST", "/api/account/profile", {
          body: {
            email,
            firstName: email.startsWith("bulk-a") ? "BulkA" : "BulkB",
            lastName: "Teacher",
            signup: true,
            lastLogin: true,
          },
        });
        assert.equal(profile.status, 200, JSON.stringify(profile.json));
      }
      await new Promise((r) => setTimeout(r, 200));

      const denied = await request("POST", "/api/admin/email-engagement/send-one-time", {
        body: { adminToken, confirm: true, auditToken: "missing" },
      });
      assert.equal(denied.status, 400, JSON.stringify(denied.json));

      const previewRes = await request("POST", "/api/admin/email-engagement/preview-one-time", {
        body: { adminToken },
      });
      assert.equal(previewRes.status, 200, JSON.stringify(previewRes.json));
      assert.equal(previewRes.json.readOnly, true);
      assert.ok(previewRes.json.preview.eligibleUniqueRecipients >= 2);
      assert.equal(Boolean(previewRes.json.preview.excluded), true);
      assert.equal(JSON.stringify(previewRes.json).includes("@llhprovider.com"), false, "preview must not leak recipient emails");

      const auditRes = await request("POST", "/api/admin/email-engagement/preflight-audit", {
        body: { adminToken },
      });
      assert.equal(auditRes.status, 200, JSON.stringify(auditRes.json));
      assert.equal(auditRes.json.audit.auditPassed, true, JSON.stringify(auditRes.json.audit.checks, null, 2));
      assert.ok(auditRes.json.audit.counts.totalUsers >= 2);
      assert.ok(auditRes.json.audit.auditToken);

      const prepareRes = await request("POST", "/api/admin/email-engagement/prepare-one-time", {
        body: { adminToken },
      });
      assert.equal(prepareRes.status, 200, JSON.stringify(prepareRes.json));
      assert.equal(prepareRes.json.sent, false);
      assert.equal(prepareRes.json.prepared.willSend, false);
      assert.ok(prepareRes.json.prepared.recipients.count >= 2);
      assert.match(prepareRes.json.prepared.subject || "", /New Teaching Kits Are Here/i);

      const sendRes = await request("POST", "/api/admin/email-engagement/send-one-time", {
        body: {
          adminToken,
          confirm: true,
          auditToken: auditRes.json.audit.auditToken,
        },
      });
      // Provider keys are cleared in this suite — zero deliveries must not stamp sentAt.
      assert.equal(sendRes.status, 200, JSON.stringify(sendRes.json));
      assert.ok(sendRes.json.result.recipients >= 2);
      assert.equal(sendRes.json.result.recurring, false);
      assert.equal(sendRes.json.result.reason, "provider_unconfigured");
      assert.equal(sendRes.json.result.sentAt || "", "");
      assert.equal(sendRes.json.ok, false);

      const repeat = await request("POST", "/api/admin/email-engagement/send-one-time", {
        body: {
          adminToken,
          confirm: true,
          auditToken: auditRes.json.audit.auditToken,
        },
      });
      assert.equal(repeat.status, 409, JSON.stringify(repeat.json));
    });

    await test("support ticket email path still works (soft-fail)", async () => {
      const res = await request("POST", "/api/support-ticket", {
        body: {
          email: "parent@example.com",
          name: "Parent",
          message: "Need help with billing.",
          topic: "Billing",
        },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.ok(res.json.ticket || res.json.id || res.json.ok !== false);
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }

  if (process.exitCode) {
    console.error(bootLog.slice(-2000));
    process.exit(process.exitCode);
  }
  console.log("\nAll email engagement tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
