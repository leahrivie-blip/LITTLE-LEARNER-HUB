#!/usr/bin/env node
/**
 * 1-month free promo + Founding reservation + cancellation flow QA.
 * Run: node scripts/test-promo-1month-free.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const membershipAccess = require("./membership-access.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19610 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-promo1m-${crypto.randomBytes(4).toString("hex")}.json`);
const FOUNDING_LIMIT = 50;

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...(options.headers || {}),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(extraEnv = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "promo-qa@test.local",
      ADMIN_PASSWORD: "promo-qa-pass",
      ADMIN_ACCESS_CODE: "promo-qa-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: String(FOUNDING_LIMIT),
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
      PROMO_FREE_TRIAL_CODE: "FREEMONTH",
      PROMO_FREE_TRIAL_DAYS: "30",
      NODE_ENV: "test",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${child.__output()}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not boot:\n${child.__output()}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function readStoreFile() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeStoreFile(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

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

async function main() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    foundingMembers: [],
    foundingReservations: [],
    promoCodes: [],
    promoRedemptions: [],
    adminSessions: {},
    billingEvents: [],
    membershipAudit: [],
  }, null, 2));

  let child = startServer();
  try {
    await waitForBoot(child);

    await test("TRY1MONTH is retired and rejected for new signups", async () => {
      const res = await requestJson("POST", "/api/validate-promo-code", {
        code: "TRY1MONTH",
        email: "new-user@example.com",
      });
      assert.equal(res.status, 400, JSON.stringify(res.json));
      assert.equal(res.json.valid, false);
      assert.match(String(res.json.error || ""), /no longer available|not active/i);
    });

    await test("FREEMONTH validates as 30-day free promo with card + founding lock", async () => {
      const res = await requestJson("POST", "/api/validate-promo-code", {
        code: "FREEMONTH",
        email: "creator@example.com",
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.valid, true);
      assert.equal(res.json.trialDays, 30);
      assert.equal(res.json.paymentMethodRequired, true);
      assert.equal(res.json.locksFoundingPrice, true);
      assert.match(String(res.json.message || ""), /Founding|\$9\.99|card/i);
    });

    await test("Admin can create custom influencer promo codes", async () => {
      const login = await requestJson("POST", "/api/admin/login", {
        email: "promo-qa@test.local",
        password: "promo-qa-pass",
        code: "promo-qa-code",
      });
      assert.equal(login.status, 200);
      const token = login.json.token;
      const save = await requestJson("POST", "/api/admin/promo-codes", {
        adminToken: token,
        code: "INFLUENCER30",
        trialDays: 30,
        label: "Creator 1 Month Free",
        maxRedemptions: 25,
        status: "active",
        notes: "Partner code",
      });
      assert.equal(save.status, 200, JSON.stringify(save.json));
      const list = await requestJson("GET", `/api/admin/promo-codes?adminToken=${token}`);
      assert.equal(list.json.envPromo?.code, "FREEMONTH");
      assert.ok((list.json.promoCodes || []).some((p) => p.code === "INFLUENCER30" && p.trialDays === 30));
      const disable = await requestJson("POST", "/api/admin/promo-codes", {
        adminToken: token,
        code: "INFLUENCER30",
        trialDays: 30,
        status: "disabled",
      });
      assert.equal(disable.status, 200);
      const bad = await requestJson("POST", "/api/validate-promo-code", {
        code: "INFLUENCER30",
        email: "someone@example.com",
      });
      assert.equal(bad.status, 400);
    });

    await test("Promo signup reserves Founding spot and stores promo on user", async () => {
      // Simulate successful checkout upgrade without live Stripe.
      child.kill();
      await new Promise((r) => setTimeout(r, 300));

      const store = readStoreFile();
      store.promoCodes = store.promoCodes || [];
      if (!store.promoCodes.some((p) => p.code === "FREEMONTH")) {
        store.promoCodes.push({
          id: "promo_try1month_default",
          code: "FREEMONTH",
          trialDays: 30,
          status: "active",
          label: "1 Month Free",
        });
      }
      writeStoreFile(store);

      child = startServer();
      await waitForBoot(child);

      // Use internal apply path via founding reservation helpers through cancel API setup:
      // Seed a founding trial user as if checkout completed.
      const seeded = readStoreFile();
      const email = "promo-founding@example.com";
      const trialEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      seeded.foundingMembers = [email];
      seeded.foundingReservations = [{
        email,
        status: "held",
        promoCode: "FREEMONTH",
        reservedAt: new Date().toISOString(),
        expiresAt: "",
        releasableUntilFirstPayment: true,
      }];
      seeded.users[email] = {
        email,
        plan: "Founding",
        subscriptionStatus: "Founding Member Subscription Trialing",
        stripeSubscriptionStatus: "trialing",
        trialStatus: "In Trial",
        trialStart: new Date().toISOString(),
        trialEnd,
        accessEndsAt: trialEnd,
        currentPeriodEnd: trialEnd,
        cancelAtPeriodEnd: false,
        foundingMember: true,
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        foundingMemberNumber: 1,
        foundingSpotReleasable: true,
        monthlyPrice: "$9.99/month",
        priceLock: "Lifetime",
        promoCodeUsed: "FREEMONTH",
        promoLabelUsed: "1 Month Free",
        promoRedeemedAt: new Date().toISOString(),
        promoRedemptions: [{ code: "FREEMONTH", trialDays: 30, redeemedAt: new Date().toISOString() }],
        stripeSubscriptionId: "sub_promo_test_1",
        hasPaymentMethod: true,
      };
      seeded.promoRedemptions = [{
        email,
        code: "FREEMONTH",
        trialDays: 30,
        redeemedAt: new Date().toISOString(),
      }];
      writeStoreFile(seeded);

      // Restart to load seeded store.
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      child = startServer();
      await waitForBoot(child);

      const founding = await requestJson("GET", "/api/founding-status");
      assert.equal(founding.json.founding.remaining, FOUNDING_LIMIT - 1);

      const status = await requestJson("GET", `/api/subscription-status?email=${encodeURIComponent(email)}`);
      assert.equal(status.status, 200);
      assert.equal(status.json.hasProAccess ?? status.json.subscription?.hasProAccess, true);
      assert.ok(membershipAccess.membershipHasProAccess(seeded.users[email]));
    });

    await test("Cancel during free month: no charge label, access until trial end, Founding spot released", async () => {
      const email = "promo-founding@example.com";
      const before = readStoreFile();
      assert.ok(before.foundingMembers.includes(email));

      const cancel = await requestJson("POST", "/api/cancel-subscription", { email }, {
        headers: { Authorization: `Bearer test:${email}`, "X-LLH-User-Email": email },
      });
      assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
      assert.equal(cancel.json.inFreeMonth, true);
      assert.equal(cancel.json.foundingSpotReleased, true);
      assert.equal(cancel.json.subscription.cancelAtPeriodEnd, true);
      assert.match(String(cancel.json.subscription.subscriptionStatus || ""), /Canceled — Access Ends/);
      assert.match(String(cancel.json.subscription.subscriptionStatus || ""), /Trial — no future charge|no future charge/i);
      assert.equal(cancel.json.subscription.hasProAccess, true);

      const after = readStoreFile();
      assert.ok(!after.foundingMembers.includes(email), "Founding spot must be released on free-month cancel");
      assert.equal(after.users[email].foundingMemberNumber, null);
      assert.ok(after.users[email].foundingSpotReleasedAt);
      assert.equal(after.users[email].promoCodeUsed, "FREEMONTH");

      const founding = await requestJson("GET", "/api/founding-status");
      assert.equal(founding.json.founding.remaining, FOUNDING_LIMIT);
    });

    await test("Cancel after first paid cycle keeps Founding historical spot", async () => {
      const email = "paid-founding@example.com";
      const store = readStoreFile();
      const periodEnd = new Date(Date.now() + 20 * 86400000).toISOString();
      store.foundingMembers = [...new Set([...(store.foundingMembers || []), email])];
      store.users[email] = {
        email,
        plan: "Founding",
        subscriptionStatus: "Founding Member Subscription Active",
        stripeSubscriptionStatus: "active",
        accessEndsAt: periodEnd,
        currentPeriodEnd: periodEnd,
        foundingMember: true,
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        foundingMemberNumber: 2,
        foundingSpotReleasable: false,
        firstPaidInvoiceAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        lastSuccessfulPaymentAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        monthlyPrice: "$9.99/month",
        priceLock: "Lifetime",
        promoCodeUsed: "FREEMONTH",
        stripeSubscriptionId: "sub_paid_founding",
      };
      writeStoreFile(store);
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      child = startServer();
      await waitForBoot(child);

      const cancel = await requestJson("POST", "/api/cancel-subscription", { email }, {
        headers: { Authorization: `Bearer test:${email}`, "X-LLH-User-Email": email },
      });
      assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
      assert.equal(cancel.json.foundingSpotReleased, false);
      assert.equal(cancel.json.inFreeMonth, false);
      assert.match(String(cancel.json.subscription.subscriptionStatus || ""), /Canceled — Access Ends/);

      const after = readStoreFile();
      assert.ok(after.foundingMembers.includes(email), "Paid founding cancel must keep the numbered spot");
      assert.equal(after.users[email].foundingMemberNumber, 2);
      assert.equal(after.users[email].foundingMemberHistorical, true);
    });

    await test("Sold-out founding forces regular pricing for promo validation messaging", async () => {
      const store = readStoreFile();
      store.foundingMembers = Array.from({ length: FOUNDING_LIMIT }, (_, i) => `slot${i}@test.local`);
      writeStoreFile(store);
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      child = startServer();
      await waitForBoot(child);

      const res = await requestJson("POST", "/api/validate-promo-code", {
        code: "FREEMONTH",
        email: "newcomer@example.com",
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.locksFoundingPrice, false);
      assert.match(String(res.json.message || ""), /sold out|regular/i);
    });

    await test("Static UI: cancel only via Billing & Subscription, not Account/home", async () => {
      const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
      const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
      assert.doesNotMatch(indexHtml, /id="accountCancelButton"/);
      assert.match(appJs, /Billing &amp; Subscription|Billing & Subscription/);
      assert.match(appJs, /llh-billing-cancel-panel|Manage Subscription/);
      assert.match(appJs, /data-cancel-step/);
      assert.match(appJs, /Yes, cancel my subscription/);
      assert.match(appJs, /permanently lose your \$9\.99/);
      assert.match(appJs, /You will not be charged/);
      assert.match(appJs, /Works for new and existing accounts/i);
      assert.match(appJs, /promoCodePanel\(\{[\s\S]*context:\s*"billing"/);
      assert.match(appJs, /promoCodePanel\(\{[\s\S]*context:\s*"signup"/);
      assert.match(appJs, /syncCheckoutPromoCodeFromInput/);
      assert.match(appJs, /data-view="upgrade"/);
      assert.match(appJs, /payment method is required|card is required/i);
      assert.doesNotMatch(appJs, /placeholder="TRY1MONTH"/);
      assert.doesNotMatch(appJs, /example: TRY1MONTH/);
      assert.doesNotMatch(appJs, /accountCancelButton/);
    });

    await test("Cancellation email helper covers free-month + founding wording", async () => {
      const emailLib = require("./../server/billing-lifecycle-email.js");
      const freeMonth = emailLib.cancellationEmailContent(
        { firstName: "Ada", accessEndsAt: new Date(Date.now() + 86400000).toISOString() },
        { inFreeMonth: true, foundingReleased: true, wasFounding: true },
      );
      assert.match(freeMonth.subject, /Cancellation/i);
      assert.match(freeMonth.text, /will not be charged/i);
      assert.match(freeMonth.text, /released back into inventory/i);

      const paid = emailLib.cancellationEmailContent(
        { firstName: "Bea", accessEndsAt: new Date(Date.now() + 86400000).toISOString() },
        { inFreeMonth: false, foundingReleased: false, wasFounding: true },
      );
      assert.match(paid.text, /permanently lose/i);
      assert.match(paid.text, /\$9\.99/);
    });

    if (process.exitCode) {
      console.error("\nServer log:\n" + child.__output());
    } else {
      console.log("\n✅ Promo 1-month free + cancellation audit PASSED.");
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
