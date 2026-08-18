#!/usr/bin/env node
/**
 * Admin Messages Sent history: read existing campaign evidence only.
 * Does not send PAID_USER_CHECKIN_AUG2026 or THANKYOU6.
 * Run: npm run test:admin-sent-campaign-history
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  ROOT, waitForHealth, startServer, seedStore,
} = require("./lib/messaging-test-harness.js");
const history = require("../server/admin-sent-campaign-history.js");
const paid = require("../server/paid-user-checkin.js");
const thankYou6InApp = require("../server/thankyou6-in-app.js");

const ARTIFACT_DIR = "/opt/cursor/artifacts/admin-sent-campaign-history";
const ADMIN_EMAIL = "admin@test.local";
const REPLY_USER = "paid.reply@providermail.com";
const PAID_COUNT = 21;
const THANKYOU6_COUNT = 25;
const SENT_AT = "2026-08-18T16:05:00.000Z";
const THANKYOU6_EMAIL_SENT_AT = "2026-08-18T14:00:00.000Z";
const THANKYOU6_INAPP_SENT_AT = "2026-08-18T15:30:00.000Z";

let failures = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function adminApi(base, method, urlPath, { token, body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${urlPath}`, { method, headers }, (res) => {
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

function paidEmail(i) {
  return i === 1 ? REPLY_USER : `paid.user${String(i).padStart(2, "0")}@providermail.com`;
}

function buildSeedStore() {
  const users = {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL, plan: "Founding", firstName: "Leah" },
  };
  const notifications = [];
  const receipts = {};
  for (let i = 1; i <= PAID_COUNT; i += 1) {
    const email = paidEmail(i);
    users[email] = {
      email,
      firstName: `Paid${i}`,
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      lastSuccessfulPaymentAt: "2026-07-01T00:00:00.000Z",
    };
    const notificationId = `notif-paid-checkin-${String(i).padStart(2, "0")}`;
    notifications.push({
      id: notificationId,
      email,
      type: "feature_update",
      category: "paid_user_checkin",
      title: paid.TITLE,
      preview: `Hi Paid${i}! ${paid.BODY_CORE}`,
      messageId: "",
      conversationEmail: "",
      refId: paid.CAMPAIGN_ID,
      deepLink: paid.CTA_PATH,
      createdAt: SENT_AT,
      read: false,
      readAt: "",
      pushAttempted: false,
      pushSent: false,
      pushError: "push_disabled_for_campaign",
    });
    receipts[email] = {
      campaignId: paid.CAMPAIGN_ID,
      email,
      userId: email,
      in_app: {
        campaignId: paid.CAMPAIGN_ID,
        channel: "in_app",
        notificationId,
        sentAt: SENT_AT,
      },
    };
  }

  users[REPLY_USER].firstName = "Riley";
  const thankYouReceipts = {};
  const thankYouDeliveries = [];
  const thankYouInAppDeliveries = [];
  const messageIdIndex = {};
  for (let i = 1; i <= THANKYOU6_COUNT; i += 1) {
    const email = `free.thankyou${String(i).padStart(2, "0")}@providermail.com`;
    users[email] = { email, firstName: `Free${i}`, plan: "Free" };
    const notificationId = `notif-thankyou6-${String(i).padStart(2, "0")}`;
    const messageId = `re_ty6_${String(i).padStart(2, "0")}`;
    notifications.push({
      id: notificationId,
      email,
      type: "feature_update",
      category: "thankyou6",
      title: thankYou6InApp.IN_APP_TITLE,
      preview: thankYou6InApp.IN_APP_BODY,
      messageId: "",
      conversationEmail: "",
      refId: history.THANKYOU6_CAMPAIGN_ID,
      deepLink: "/?view=upgrade",
      createdAt: THANKYOU6_INAPP_SENT_AT,
      read: false,
      pushAttempted: false,
      pushSent: false,
    });
    thankYouReceipts[email] = {
      campaignId: history.THANKYOU6_CAMPAIGN_ID,
      email: {
        campaignId: history.THANKYOU6_CAMPAIGN_ID,
        channel: "email",
        messageId,
        sentAt: THANKYOU6_EMAIL_SENT_AT,
        apiAccepted: true,
        deliveryStatus: "accepted",
      },
      messageId,
      sentAt: THANKYOU6_EMAIL_SENT_AT,
      apiAccepted: true,
      deliveryStatus: "accepted",
      in_app: {
        campaignId: history.THANKYOU6_CAMPAIGN_ID,
        channel: "in_app",
        notificationId,
        sentAt: THANKYOU6_INAPP_SENT_AT,
      },
    };
    thankYouDeliveries.push({ email, messageId, sentAt: THANKYOU6_EMAIL_SENT_AT, deliveryStatus: "accepted" });
    thankYouInAppDeliveries.push({ email, notificationId, sentAt: THANKYOU6_INAPP_SENT_AT });
    messageIdIndex[messageId] = email;
  }

  return {
    users,
    notifications,
    messages: [
      {
        id: "msg-user-reply",
        kind: "message",
        audience: "private",
        senderType: "user",
        senderEmail: REPLY_USER,
        senderName: "Riley",
        conversationEmail: REPLY_USER,
        toEmail: "",
        subject: "",
        body: "I like the lesson plans — thank you for checking in.",
        createdAt: "2026-08-18T17:00:00.000Z",
        sentAt: "2026-08-18T17:00:00.000Z",
        status: "sent",
        inReplyToCampaign: paid.CAMPAIGN_ID,
      },
    ],
    inAppCampaigns: {
      [paid.CAMPAIGN_ID]: {
        campaignId: paid.CAMPAIGN_ID,
        dryRunToken: "",
        confirmationToken: "",
        sentAt: SENT_AT,
        recipientCount: PAID_COUNT,
        recipientReceipts: receipts,
        lastPostSendReport: {
          sentAt: SENT_AT,
          attempted: PAID_COUNT,
          successful: PAID_COUNT,
          failed: 0,
          emailsSent: 0,
          webPushSent: 0,
        },
      },
    },
    emailEngagement: {
      settings: {
        freeUserThankYou6: {
          campaignId: history.THANKYOU6_CAMPAIGN_ID,
          sentAt: THANKYOU6_EMAIL_SENT_AT,
          recipientCount: THANKYOU6_COUNT,
          attemptedCount: THANKYOU6_COUNT,
          sentCount: THANKYOU6_COUNT,
          deliveredCount: THANKYOU6_COUNT,
          failedCount: 0,
          deliveries: thankYouDeliveries,
          recipientReceipts: thankYouReceipts,
          messageIdIndex,
          lastPostSendReport: {
            campaign: history.THANKYOU6_CAMPAIGN_ID,
            sentAt: THANKYOU6_EMAIL_SENT_AT,
            totalAttempted: THANKYOU6_COUNT,
            totalDelivered: THANKYOU6_COUNT,
            totalFailed: 0,
          },
          inAppSentAt: THANKYOU6_INAPP_SENT_AT,
          inAppRecipientCount: THANKYOU6_COUNT,
          inAppDeliveries: thankYouInAppDeliveries,
        },
      },
      events: [],
    },
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  await test("unit — paid check-in appears from persisted receipts without sending", () => {
    const store = buildSeedStore();
    const before = history.campaignEvidenceSnapshot(store);
    const campaigns = history.listOwnerSentCampaigns(store);
    const paidItem = campaigns.find((row) => row.campaignId === paid.CAMPAIGN_ID);
    assert.ok(paidItem, "expected paid check-in in sent history");
    assert.equal(paidItem.recipientCount, 21);
    assert.equal(paidItem.successCount, 21);
    assert.equal(paidItem.failureCount, 0);
    assert.equal(paidItem.title, paid.TITLE);
    assert.match(paidItem.body, /I wanted to check in and see how things are going/);
    assert.equal(paidItem.emailSent, false);
    assert.equal(paidItem.webPushSent, false);
    assert.equal(paidItem.emailLabel, "Not sent");
    assert.equal(paidItem.webPushLabel, "Not sent");
    assert.equal(paidItem.ctaLabel, paid.CTA_LABEL);
    assert.equal(paidItem.channels.inApp.successCount, 21);
    assert.equal(paidItem.channels.email, null);
    assert.equal(history.campaignEvidenceSnapshot(store).notificationCount, before.notificationCount);
    assert.equal(history.campaignEvidenceSnapshot(store).paidReceiptCount, before.paidReceiptCount);
    assert.equal(history.campaignEvidenceSnapshot(store).paidJson, before.paidJson);
  });

  await test("unit — dry-run-only THANKYOU6 does not appear as sent", () => {
    const dryOnly = {
      emailEngagement: {
        settings: {
          freeUserThankYou6: {
            campaignId: history.THANKYOU6_CAMPAIGN_ID,
            dryRunToken: "dry-only",
            inAppDryRunToken: "dry-only",
            lastDryRunSummary: { recipientCount: 25, recipientEmails: ["a@b.com"] },
            inAppSentAt: "",
            sentAt: "",
            recipientReceipts: {},
          },
        },
      },
      notifications: [],
    };
    assert.equal(
      history.listOwnerSentCampaigns(dryOnly).some((row) => row.campaignId === history.THANKYOU6_CAMPAIGN_ID),
      false,
    );
  });

  await test("unit — THANKYOU6 email 25 and in-app 25 stay independent and are not mutated", () => {
    const store = buildSeedStore();
    const before = history.campaignEvidenceSnapshot(store);
    const item = history.listOwnerSentCampaigns(store).find((row) => row.campaignId === history.THANKYOU6_CAMPAIGN_ID);
    assert.ok(item, "expected THANKYOU6 in sent history when real send receipts exist");
    assert.equal(item.emailSent, true);
    assert.equal(item.webPushSent, false);
    assert.equal(item.channels.email.successCount, 25);
    assert.equal(item.channels.email.recipientCount, 25);
    assert.equal(item.channels.email.failureCount, 0);
    assert.equal(item.channels.inApp.successCount, 25);
    assert.equal(item.channels.inApp.recipientCount, 25);
    assert.equal(item.channels.inApp.failureCount, 0);
    assert.equal(item.channels.email.successCount, item.channels.inApp.successCount);
    assert.notEqual(item.channels.email.sentAt, item.channels.inApp.sentAt);
    const after = history.campaignEvidenceSnapshot(store);
    assert.equal(after.thankYou6Json, before.thankYou6Json);
    assert.equal(after.thankYou6InAppSentAt, before.thankYou6InAppSentAt);
    assert.equal(after.thankYou6SentAt, before.thankYou6SentAt);
    assert.equal(after.stripeFingerprint, before.stripeFingerprint);
  });

  await test("unit — THANKYOU6 still appears from receipts if campaign sentAt fields are missing", () => {
    const store = buildSeedStore();
    delete store.emailEngagement.settings.freeUserThankYou6.sentAt;
    delete store.emailEngagement.settings.freeUserThankYou6.inAppSentAt;
    store.emailEngagement.settings.freeUserThankYou6.sentCount = 0;
    store.emailEngagement.settings.freeUserThankYou6.inAppRecipientCount = 0;
    const item = history.listOwnerSentCampaigns(store).find((row) => row.campaignId === history.THANKYOU6_CAMPAIGN_ID);
    assert.ok(item, "receipts alone must prove the send");
    assert.equal(item.channels.email.successCount, 25);
    assert.equal(item.channels.inApp.successCount, 25);
  });

  await test("unit — incoming user reply is inferred as Reply to Paid User Check-In", () => {
    const store = buildSeedStore();
    const replyTo = history.inferInboxReplyTo(store, REPLY_USER);
    assert.equal(replyTo?.displayName, "Paid User Check-In");
    assert.equal(replyTo?.campaignId, paid.CAMPAIGN_ID);
  });

  await test("static UI — Inbox/Sent cards, no sideways table", () => {
    const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const css = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");
    assert.match(app, /admin-messages-inbox-sent-toggle/);
    assert.match(app, /admin-sent-campaign-card/);
    assert.match(app, /No replies yet/);
    assert.match(app, /data-admin-sent-back/);
    assert.doesNotMatch(app, /<table[^>]*admin-sent/);
    assert.match(css, /\.admin-sent-campaign-card/);
    assert.match(css, /\.admin-sent-recipient-card/);
    assert.match(css, /@media \(max-width: 720px\)/);
  });

  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  const STORE = path.join(ROOT, "server", `.admin-sent-history-${process.pid}.json`);
  const seeded = buildSeedStore();
  seedStore(STORE, seeded.users);
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
  Object.assign(raw, seeded);
  fs.writeFileSync(STORE, JSON.stringify(raw, null, 2));

  const { child: server } = startServer({
    port: PORT,
    storeFile: STORE,
    extraEnv: {
      ADMIN_EMAIL,
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      DATABASE_PROVIDER: "local-json",
      PRODUCTION_DATABASE_URL: "",
    },
  });

  let token = "";
  try {
    await waitForHealth(BASE);
    const login = await adminApi(BASE, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    token = login.json.token;

    await test("API — unauthorized users cannot read owner sent history", async () => {
      const anon = await adminApi(BASE, "GET", "/api/admin/messages/sent-history");
      assert.equal(anon.status, 401);
      const member = await new Promise((resolve, reject) => {
        const req = http.request(`${BASE}/api/admin/messages/sent-history`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer test:${REPLY_USER}`,
            "X-LLH-User-Email": REPLY_USER,
          },
        }, (res) => {
          let rawBody = "";
          res.on("data", (chunk) => { rawBody += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, raw: rawBody }));
        });
        req.on("error", reject);
        req.end();
      });
      assert.equal(member.status, 401);
    });

    await test("API — Sent history reads paid check-in without writing notifications or receipts", async () => {
      const before = JSON.parse(fs.readFileSync(STORE, "utf8"));
      const beforeSnap = history.campaignEvidenceSnapshot(before);
      const res = await adminApi(BASE, "GET", "/api/admin/messages/sent-history", { token });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.mutated, false);
      const paidItem = (res.json.campaigns || []).find((row) => row.campaignId === paid.CAMPAIGN_ID);
      assert.ok(paidItem, `campaigns=${JSON.stringify(res.json.campaigns)}`);
      assert.equal(paidItem.recipientCount, 21);
      assert.equal(paidItem.successCount, 21);
      assert.equal(paidItem.failureCount, 0);
      assert.equal(paidItem.title, paid.TITLE);
      assert.match(paidItem.body, /I wanted to check in and see how things are going/);
      assert.equal(paidItem.emailLabel, "Not sent");
      assert.equal(paidItem.webPushLabel, "Not sent");
      const thankyou = (res.json.campaigns || []).find((row) => row.campaignId === history.THANKYOU6_CAMPAIGN_ID);
      assert.ok(thankyou, "expected THANKYOU6 history from persisted send receipts");
      assert.equal(thankyou.channels.email.successCount, 25);
      assert.equal(thankyou.channels.inApp.successCount, 25);
      assert.equal(thankyou.channels.email.failureCount, 0);
      assert.equal(thankyou.channels.inApp.failureCount, 0);
      const after = JSON.parse(fs.readFileSync(STORE, "utf8"));
      const afterSnap = history.campaignEvidenceSnapshot(after);
      assert.equal(afterSnap.notificationCount, beforeSnap.notificationCount);
      assert.equal(afterSnap.paidReceiptCount, beforeSnap.paidReceiptCount);
      assert.equal(afterSnap.thankYou6ReceiptCount, beforeSnap.thankYou6ReceiptCount);
      assert.equal(afterSnap.paidJson, beforeSnap.paidJson);
      assert.equal(afterSnap.thankYou6Json, beforeSnap.thankYou6Json);
      assert.equal(
        (after.notifications || []).filter((n) => n.refId === paid.CAMPAIGN_ID).length,
        PAID_COUNT,
      );
    });

    await test("API — Inbox still shows user replies and not campaign broadcasts", async () => {
      const inbox = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=new", { token });
      assert.equal(inbox.status, 200, JSON.stringify(inbox.json));
      const emails = (inbox.json.conversations || []).map((row) => row.userEmail);
      assert.ok(emails.includes(REPLY_USER), `expected reply in inbox: ${JSON.stringify(emails)}`);
      const replyRow = (inbox.json.conversations || []).find((row) => row.userEmail === REPLY_USER);
      assert.equal(replyRow.replyToCampaignLabel, "Paid User Check-In");
      assert.ok(!(inbox.json.conversations || []).some((row) => String(row.userEmail || "").startsWith("free.thankyou")));
      const sent = await adminApi(BASE, "GET", "/api/admin/messages/sent", { token });
      assert.equal(sent.status, 200);
      assert.ok(!(sent.json.messages || []).some((m) => String(m.refId || "") === paid.CAMPAIGN_ID));
    });

    await test("API — second Sent load still creates zero notifications/receipts", async () => {
      const before = history.campaignEvidenceSnapshot(JSON.parse(fs.readFileSync(STORE, "utf8")));
      await adminApi(BASE, "GET", "/api/admin/messages/sent-history", { token });
      await adminApi(BASE, "GET", `/api/admin/messages/sent-history?campaignId=${encodeURIComponent(paid.CAMPAIGN_ID)}`, { token });
      const after = history.campaignEvidenceSnapshot(JSON.parse(fs.readFileSync(STORE, "utf8")));
      assert.equal(after.notificationCount, before.notificationCount);
      assert.equal(after.paidReceiptCount, before.paidReceiptCount);
      assert.equal(after.thankYou6Json, before.thankYou6Json);
      assert.equal(after.stripeFingerprint, before.stripeFingerprint);
    });

    await test("UI mobile — Inbox/Sent cards and paid check-in detail", async () => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      await page.goto(`${BASE}/?view=admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(
        () => typeof window.setView === "function" && typeof window.setAdminSectionTab === "function",
        null,
        { timeout: 30000 },
      );
      const loginError = await page.evaluate(async ({ apiBase, ownerEmail, ownerPassword, ownerCode }) => {
        const res = await fetch(`${apiBase}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email: ownerEmail, password: ownerPassword, code: ownerCode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return data.error || `Login failed (${res.status})`;
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminSession", JSON.stringify({
          token: data.token,
          email: data.email || ownerEmail,
          mode: data.mode || "server",
          trustedDevice: true,
        }));
        if (typeof window.setView === "function") window.setView("admin");
        if (typeof window.renderAdminDashboard === "function") window.renderAdminDashboard();
        if (typeof window.setAdminSectionTab === "function") window.setAdminSectionTab("messages-sent");
        return "";
      }, { apiBase: BASE, ownerEmail: ADMIN_EMAIL, ownerPassword: "test-password", ownerCode: "test-code" });
      assert.equal(loginError, "", loginError);
      try {
        await page.waitForSelector(".admin-sent-campaign-card", { timeout: 25000 });
      } catch (error) {
        const html = await page.locator("#adminMessagesApp").innerHTML().catch(() => "");
        throw new Error(`${error.message}\npageErrors=${pageErrors.join(" | ")}\nadminMessagesApp=${html.slice(0, 1200)}`);
      }
      const paidCard = page.locator(".admin-sent-campaign-card", { hasText: "Paid User Check-In" });
      const thankyouCard = page.locator(".admin-sent-campaign-card", { hasText: "THANKYOU6" });
      const paidText = await paidCard.innerText();
      const thankyouText = await thankyouCard.innerText();
      assert.match(paidText, /21 delivered/);
      assert.match(thankyouText, /Email \+ In-app/);
      assert.match(thankyouText, /Email/);
      assert.match(thankyouText, /In-app/);
      assert.equal((thankyouText.match(/25 delivered/g) || []).length, 2);
      const tableCount = await page.locator(".admin-sent-campaign-list table, .admin-sent-campaign-detail table").count();
      assert.equal(tableCount, 0);
      await page.locator(".admin-sent-campaign-card").first().click();
      await page.waitForSelector(".admin-sent-campaign-detail", { timeout: 15000 });
      const detail = await page.locator(".admin-sent-campaign-detail").innerText();
      assert.match(detail, /PAID_USER_CHECKIN_AUG2026/);
      assert.match(detail, /How are you liking Little Learner Hub/);
      assert.match(detail, /21/);
      assert.match(detail, /Not sent/);
      const overflow = await page.evaluate(() => {
        const detailEl = document.querySelector(".admin-sent-campaign-detail");
        if (!detailEl) return true;
        return detailEl.scrollWidth > window.innerWidth + 8;
      });
      assert.equal(overflow, false, "sent detail should not require sideways scroll");
      await page.locator("[data-admin-sent-back]").click();
      await page.waitForSelector(".admin-sent-campaign-card", { timeout: 10000 });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "mobile-sent-history.png"), fullPage: true });
      await browser.close();
    });
  } finally {
    try { server.kill("SIGKILL"); } catch {}
    try { fs.unlinkSync(STORE); } catch {}
    try { fs.unlinkSync(STORE.replace(/\.json$/, ".admin-sessions.json")); } catch {}
    try { fs.unlinkSync(`${STORE.replace(/\.json$/, "")}.admin-sessions.json`); } catch {}
  }

  if (failures) {
    console.error(`\n${failures} admin sent-history test(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll admin sent-history tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
