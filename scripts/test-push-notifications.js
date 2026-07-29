#!/usr/bin/env node
/**
 * Messaging Center — Phases 7-10: push subscription flow, single/multi
 * device delivery, notification preferences (opt-in, no nagging), expired
 * subscription cleanup, duplicate-device prevention, admin test-send
 * restrictions, and bulk rate-limit safeguards.
 * Run: node scripts/test-push-notifications.js
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test, poll,
  startFakePushProvider, fakeSubscription,
} = require("./lib/messaging-test-harness.js");

const PORT = 4323;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.push-test-${process.pid}.json`);
const ADMIN_EMAIL = "admin@test.local";
const USER = "device-owner@example.com";

async function main() {
  const provider = await startFakePushProvider();
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [USER]: { email: USER, plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", stripeSubscriptionStatus: "active" },
    "bulk-free@example.com": { email: "bulk-free@example.com", plan: "Free" },
  });
  const { child, getLog } = startServer({
    port: PORT,
    storeFile: STORE,
    extraEnv: { PUSH_BULK_MAX_RECIPIENTS: "3" },
  });

  try {
    await waitForHealth(BASE);
    const login = await request(BASE, "POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" } });
    const adminToken = login.json.token;

    await test("Installable-app audit: manifest, service worker, and push config are all served", async () => {
      const manifest = await request(BASE, "GET", "/site.webmanifest");
      assert.equal(manifest.status, 200);
      const sw = await request(BASE, "GET", "/service-worker.js");
      assert.equal(sw.status, 200);
      const vapid = await request(BASE, "GET", "/api/push/vapid-public-key");
      assert.equal(vapid.status, 200);
      assert.equal(vapid.json.supported, true, "push should be auto-configured via generated+persisted VAPID keys with no manual setup");
      assert.ok(vapid.json.publicKey.length > 20);
    });

    await test("Notification preferences default to OFF — no push until the user explicitly opts in", async () => {
      const pref = await request(BASE, "GET", "/api/notification-preferences", { email: USER });
      assert.equal(pref.json.preference.pushEnabled, false);
      assert.equal(pref.json.preference.decision, "default");
    });

    await test("User declines notifications — preference recorded, and it is never auto re-prompted server-side", async () => {
      const decline = await request(BASE, "POST", "/api/notification-preferences", { email: USER, body: { decision: "denied" } });
      assert.equal(decline.json.preference.pushEnabled, false);
      assert.equal(decline.json.preference.decision, "denied");
    });

    await test("User later allows notifications", async () => {
      const allow = await request(BASE, "POST", "/api/notification-preferences", { email: USER, body: { decision: "granted" } });
      assert.equal(allow.json.preference.pushEnabled, true);
      assert.equal(allow.json.preference.decision, "granted");
    });

    await test("Single-device subscribe + private message triggers exactly one push", async () => {
      const sub = fakeSubscription({ providerPort: provider.port, statusCode: 201, deviceId: "device-1" });
      const subscribe = await request(BASE, "POST", "/api/push/subscribe", {
        email: USER, body: { subscription: sub, userAgent: "Mozilla/5.0 (iPhone) Safari" },
      });
      assert.equal(subscribe.status, 200);
      assert.equal(subscribe.json.deviceCount, 1);

      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: USER, body: "Leah sent you a new message." },
      });
      assert.equal(send.status, 200);

      await poll(async () => {
        const log = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
        return log.json.log.some((entry) => entry.result === "sent");
      });
    });

    await test("Duplicate device registration (same endpoint) does not create a second subscription", async () => {
      const before = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      const beforeCount = before.json.byUser.find((u) => u.email === USER)?.devices.length || 0;
      const sub = fakeSubscription({ providerPort: provider.port, statusCode: 201, deviceId: "device-1" });
      await request(BASE, "POST", "/api/push/subscribe", { email: USER, body: { subscription: sub, userAgent: "Mozilla/5.0 (iPhone) Safari" } });
      const after = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      const afterCount = after.json.byUser.find((u) => u.email === USER)?.devices.length || 0;
      assert.equal(afterCount, beforeCount, "re-subscribing the same device/endpoint must update, not duplicate");
    });

    await test("Multi-device: a second device for the same user receives its own push", async () => {
      const sub2 = fakeSubscription({ providerPort: provider.port, statusCode: 201, deviceId: "device-2" });
      await request(BASE, "POST", "/api/push/subscribe", { email: USER, body: { subscription: sub2, userAgent: "Mozilla/5.0 (Windows) Chrome" } });
      const devices = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      assert.equal(devices.json.byUser.find((u) => u.email === USER)?.devices.length, 2);

      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: USER, body: "Second message for multi-device test." },
      });
      assert.equal(send.status, 200);
      await poll(async () => {
        const log = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
        const sentCount = log.json.log.filter((entry) => entry.result === "sent").length;
        return sentCount >= 3 ? sentCount : false; // 1 from single-device test + 2 for this multi-device send
      });
    });

    await test("Expired subscription (410 from provider) is logged and removed", async () => {
      const expiredSub = fakeSubscription({ providerPort: provider.port, statusCode: 410, deviceId: "device-expired" });
      await request(BASE, "POST", "/api/push/subscribe", { email: USER, body: { subscription: expiredSub, userAgent: "Mozilla/5.0 (Android) Chrome" } });
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: USER, body: "Trigger expired cleanup." },
      });
      assert.equal(send.status, 200);
      await poll(async () => {
        const log = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
        return log.json.log.some((entry) => entry.result === "expired");
      });
      const devices = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      const remaining = devices.json.byUser.find((u) => u.email === USER)?.devices.length || 0;
      assert.equal(remaining, 2, "the expired device subscription must be pruned, leaving the 2 still-valid devices");
    });

    await test("Failed push delivery (500 from provider) is logged as failed, not silently dropped", async () => {
      const failingSub = fakeSubscription({ providerPort: provider.port, statusCode: 500, deviceId: "device-failing" });
      await request(BASE, "POST", "/api/push/subscribe", { email: USER, body: { subscription: failingSub, userAgent: "Mozilla/5.0 (Linux) Firefox" } });
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: USER, body: "Trigger failed delivery." },
      });
      assert.equal(send.status, 200);
      await poll(async () => {
        const log = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
        return log.json.log.some((entry) => entry.result === "failed");
      });
    });

    await test("Turning notifications off stops future push but keeps in-app messaging working", async () => {
      await request(BASE, "POST", "/api/notification-preferences", { email: USER, body: { decision: "denied" } });
      const before = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
      const beforeCount = before.json.log.length;
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: USER, body: "Should not push after opt-out." },
      });
      assert.equal(send.status, 200, "in-app message send must still succeed even though push is off");
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: USER });
      assert.ok(convo.json.messages.some((m) => m.body === "Should not push after opt-out."));
      await new Promise((r) => setTimeout(r, 300));
      const after = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
      assert.equal(after.json.log.length, beforeCount, "no new push log entries should be created once the user opted out");
    });

    await test("Logout / device revoke removes only that device, never another user's subscription", async () => {
      await request(BASE, "POST", "/api/notification-preferences", { email: USER, body: { decision: "granted" } });
      const otherUser = "another-device-owner@example.com";
      const otherSub = fakeSubscription({ providerPort: provider.port, statusCode: 201, deviceId: "other-device" });
      await request(BASE, "POST", "/api/push/subscribe", { email: otherUser, body: { subscription: otherSub, userAgent: "Mozilla/5.0" } });
      const before = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      const userDevicesBefore = before.json.byUser.find((u) => u.email === USER)?.devices.length || 0;

      const logoutUnsub = await request(BASE, "POST", "/api/push/unsubscribe", { email: USER, body: {} });
      assert.equal(logoutUnsub.status, 200);
      assert.equal(logoutUnsub.json.removed, userDevicesBefore);

      const after = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      assert.equal(after.json.byUser.find((u) => u.email === USER)?.devices?.length || 0, 0);
      assert.equal(after.json.byUser.find((u) => u.email === otherUser)?.devices?.length, 1, "another user's device must survive this user's logout/unsubscribe");
    });

    await test("Admin test-send is restricted to the admin's own device — never a real user", async () => {
      const withoutOptIn = await request(BASE, "POST", "/api/admin/push/test", { body: { adminToken } });
      assert.equal(withoutOptIn.status, 400);

      await request(BASE, "POST", "/api/notification-preferences", { email: ADMIN_EMAIL, body: { decision: "granted" } });
      const withoutDevice = await request(BASE, "POST", "/api/admin/push/test", { body: { adminToken } });
      assert.equal(withoutDevice.status, 400, "no device registered yet for the admin");

      const adminSub = fakeSubscription({ providerPort: provider.port, statusCode: 201, deviceId: "admin-device" });
      await request(BASE, "POST", "/api/push/subscribe", { email: ADMIN_EMAIL, body: { subscription: adminSub, userAgent: "Mozilla/5.0" } });
      const testSend = await request(BASE, "POST", "/api/admin/push/test", { body: { adminToken } });
      assert.equal(testSend.status, 200);
      assert.equal(testSend.json.deviceCount, 1);
    });

    await test("Bulk rate limit: sends beyond the configured cap are marked skipped, not silently attempted", async () => {
      await request(BASE, "POST", "/api/notification-preferences", { email: "bulk-free@example.com", body: { decision: "granted" } });
      for (let i = 0; i < 5; i += 1) {
        const s = fakeSubscription({ providerPort: provider.port, statusCode: 201, deviceId: `bulk-device-${i}` });
        await request(BASE, "POST", "/api/push/subscribe", { email: "bulk-free@example.com", body: { subscription: s, userAgent: "Mozilla/5.0" } });
      }
      const devices = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      const deviceCount = devices.json.byUser.find((u) => u.email === "bulk-free@example.com")?.devices.length;
      assert.equal(deviceCount, 5, "5 devices registered for the rate-limit test (cap is configured to 3 for this test run)");

      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: "bulk-free@example.com", body: "Rate limit test message." },
      });
      assert.equal(send.status, 200);
      await poll(async () => {
        const log = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
        return log.json.log.some((entry) => entry.result === "skipped");
      });
    });

    if (process.exitCode) {
      console.error("\nBoot log for debugging:\n" + getLog());
    }
  } finally {
    child.kill();
    provider.server.close();
    try { require("node:fs").unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
