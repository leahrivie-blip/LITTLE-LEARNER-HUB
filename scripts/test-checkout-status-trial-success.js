#!/usr/bin/env node
/**
 * Checkout-status entitlement regressions:
 * - payment_status=paid → success
 * - valid no_payment_required trial with verified subscription → success
 * - incomplete / expired / unpaid complete → not success
 * - invalid session id → error
 * - webhook-already-active entitlement → success
 *
 * Run: NODE_ENV=test node scripts/test-checkout-status-trial-success.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5410, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-checkout-status-${crypto.randomBytes(4).toString("hex")}.json`);

/**
 * @param {string} method
 * @param {string} urlPath
 * @param {object|null} [body]
 * @returns {Promise<{status:number, json:any, text:string}>}
 */
function requestJson(method, urlPath, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, foundingMembers: [] }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_checkout_status",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      EARLY_USER_PRICING_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for health");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 250));
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /EARLY_USER_ACQUISITION_CLOSED\s*=\s*true/);
  assert.match(serverJs, /verifiedNoChargeTrial/);
  assert.match(serverJs, /webhookAlreadyActive/);
  assert.match(serverJs, /const paid = paymentConfirmed \|\| verifiedNoChargeTrial \|\| webhookAlreadyActive;/);
  console.log("PASS  static: checkout-status uses verified trial / webhook-active entitlement");

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /EARLY_USER_ACQUISITION_CLOSED\s*=\s*true/);
  assert.match(appJs, /async function startCheckout/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("async function startCheckout"), appJs.indexOf("async function startProTrial")),
    /window\.confirm\(`Continue to secure Stripe checkout/,
    "paid startCheckout must not use redundant window.confirm",
  );
  console.log("PASS  static: Early User acquisition closed + startCheckout confirm removed");

  const child = startServer();
  try {
    await waitForBoot(child);

    const founding = await requestJson("GET", "/api/founding-status");
    assert.equal(founding.status, 200);
    assert.equal(founding.json?.founding?.primaryPaidOffer, "monthly");
    assert.equal(founding.json?.founding?.primaryMonthlyPrice, "$19.99/month");
    assert.equal(founding.json?.founding?.earlyUserPricingEnabled, false);
    console.log("PASS  founding-status: new-customer offer is $19.99 monthly");

    const paid = await requestJson("GET", "/api/checkout-status?session_id=cs_sim_paid_abc123");
    assert.equal(paid.status, 200, `paid status ${paid.status} ${paid.text}`);
    assert.equal(paid.json?.paid, true);
    assert.equal(paid.json?.paymentConfirmed, true);
    assert.equal(paid.json?.paymentStatus, "paid");
    const paidUser = readStore().users?.["paid@checkout-status.test"];
    assert.ok(paidUser, "paid checkout must create user entitlement");
    assert.ok(["Pro", "Founding"].includes(paidUser.plan) || paidUser.stripeSubscriptionStatus === "active");
    console.log("PASS  checkout-status: payment_status=paid succeeds");

    const trial = await requestJson("GET", "/api/checkout-status?session_id=cs_sim_trial_nopay_abc123");
    assert.equal(trial.status, 200, `trial status ${trial.status} ${trial.text}`);
    assert.equal(trial.json?.paid, true, "verified no_payment_required trial must succeed");
    assert.equal(trial.json?.paymentConfirmed, false, "trial must not claim paymentConfirmed");
    assert.equal(trial.json?.paymentStatus, "no_payment_required");
    assert.ok(trial.json?.trial?.applied, "trial payload present");
    const trialUser = readStore().users?.["trial-nopay@checkout-status.test"];
    assert.ok(trialUser, "trial checkout must create user entitlement");
    assert.ok(
      trialUser.stripeSubscriptionStatus === "trialing"
        || trialUser.trialStatus === "In Trial"
        || trialUser.introductoryTrialConsumed === true,
      "trial entitlement fields present",
    );
    console.log("PASS  checkout-status: valid no_payment_required trial succeeds");

    const open = await requestJson("GET", "/api/checkout-status?session_id=cs_sim_open_abc123");
    assert.equal(open.status, 200);
    assert.equal(open.json?.paid, false);
    assert.equal(open.json?.status, "open");
    console.log("PASS  checkout-status: incomplete/open does not succeed");

    const expired = await requestJson("GET", "/api/checkout-status?session_id=cs_sim_expired_abc123");
    assert.equal(expired.status, 200);
    assert.equal(expired.json?.paid, false);
    assert.equal(expired.json?.status, "expired");
    console.log("PASS  checkout-status: expired does not succeed");

    const nosub = await requestJson("GET", "/api/checkout-status?session_id=cs_sim_nopay_nosub_abc123");
    assert.equal(nosub.status, 200);
    assert.equal(nosub.json?.paid, false, "no_payment_required without verified subscription must not succeed");
    console.log("PASS  checkout-status: no_payment_required without subscription fails closed");

    const invalid = await requestJson("GET", "/api/checkout-status?session_id=not_a_session");
    assert.equal(invalid.status, 400);
    console.log("PASS  checkout-status: invalid session id rejected");

    // Webhook-already-active / idempotent: prior trial entitlement must still report paid=true.
    const again = await requestJson("GET", "/api/checkout-status?session_id=cs_sim_trial_nopay_webhook1");
    assert.equal(again.status, 200);
    assert.equal(again.json?.paid, true, "repeat checkout-status after entitlement must still succeed");
    console.log("PASS  checkout-status: webhook-already-active / idempotent entitlement succeeds");

    // Early User acquisition closed: early_user remaps to monthly.
    const remap = await requestJson("POST", "/api/create-checkout-session", {
      email: "new-customer@checkout-status.test",
      plan: "early_user",
    });
    assert.equal(remap.status, 200);
    assert.ok(String(remap.json?.url || "").includes("price_sim_pro_monthly"));
    assert.equal(remap.json?.plan, "monthly");
    console.log("PASS  checkout: new-customer early_user remaps to $19.99 monthly");

    console.log("\nAll checkout-status trial success checks passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
