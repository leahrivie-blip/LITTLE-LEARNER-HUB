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
  assert.match(serverJs, /\/api\/admin\/email-engagement/);
  assert.match(serverJs, /emailEngagement\.maybeSendWelcomeOnSignup/);
  assert.match(serverJs, /publishedAt/);
  assert.match(serverJs, /emailEngagement\.startScheduler/);
  assert.match(appJs, /renderAdminEmailEngagement/);
  assert.match(appJs, /adminEmailFreeCampaignTest/);
  assert.match(appJs, /adminEmailFreeCampaignSend/);
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

  const eng = createEmailEngagement({
    sendEmail: async () => {
      fakeEvents.push("send");
      return { sent: true, configured: true, provider: "test" };
    },
    SITE_URL: "https://www.littlelearnerhub.com",
    htmlEscape: (v) => String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"),
    readStore: () => fakeStore,
    writeStore: (s) => { fakeStore = s; },
    writeStoreAsync: async (s) => { fakeStore = s; },
    isCurriculumLessonPublic: (status) => status === "published" || status === "featured",
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
      siteUrl: "https://www.littlelearnerhub.com",
      htmlEscape: (v) => String(v ?? ""),
    });
    assert.match(welcome.text, /New lesson plans are added regularly/);
    assert.match(welcome.text, /feedback/i);
    const tips = eng.buildOnboardingContent("tips", { firstName: "Ava" }, {
      siteUrl: "https://www.littlelearnerhub.com",
      htmlEscape: (v) => String(v ?? ""),
    });
    assert.match(tips.text, /bug/i);
    assert.match(tips.text, /feedback/i);
    const explore = eng.buildOnboardingContent("explore", { firstName: "Ava" }, {
      siteUrl: "https://www.littlelearnerhub.com",
      htmlEscape: (v) => String(v ?? ""),
    });
    assert.match(explore.text, /coming next/i);
    assert.match(explore.text, /What’s New/);
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
    assert.match(campaignSends[0].html, /Founding Member spots are still available/);
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

    await test("signup profile sync stamps welcome once without provider", async () => {
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
      // Allow fire-and-forget welcome to settle
      await new Promise((r) => setTimeout(r, 200));
      const store = readStoreFile();
      assert.ok(store.users[email].signupAt);
      assert.ok(store.users[email].onboardingEmails?.welcomeSentAt, "welcome should stamp even when unconfigured");

      const second = await request("POST", "/api/account/profile", {
        body: { email, firstName: "Sam", signup: true, lastLogin: true },
      });
      assert.equal(second.status, 200);
      await new Promise((r) => setTimeout(r, 150));
      const store2 = readStoreFile();
      assert.equal(
        store.users[email].onboardingEmails.welcomeSentAt,
        store2.users[email].onboardingEmails.welcomeSentAt,
      );
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
