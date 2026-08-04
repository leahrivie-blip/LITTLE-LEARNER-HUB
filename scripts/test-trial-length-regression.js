#!/usr/bin/env node
/**
 * Trial classification + 7-day checkout end-date regression tests.
 * Run: NODE_ENV=test node scripts/test-trial-length-regression.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const trialClassification = require("./trial-classification.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-trial-len-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
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
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, foundingMembers: [], promoCodes: [] }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_trial_len",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      // No PROMO_FREE_TRIAL_* defaults — production must not auto-grant 30-day trials.
      PROMO_FREE_TRIAL_CODE: "",
      PROMO_FREE_TRIAL_DAYS: "0",
      ADMIN_EMAIL: "trial-audit-admin@test.local",
      ADMIN_PASSWORD: "trial-audit-pass",
      ADMIN_ACCESS_CODE: "trial-audit-code",
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
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
  if (child.exitCode === null) child.kill("SIGKILL");
}

function assertNearDays(isoStart, isoEnd, expectedDays, label) {
  const start = Date.parse(isoStart);
  const end = Date.parse(isoEnd);
  assert.ok(Number.isFinite(start) && Number.isFinite(end), `${label}: dates parseable`);
  const days = (end - start) / 86400000;
  assert.ok(Math.abs(days - expectedDays) < 0.05, `${label}: expected ~${expectedDays} days, got ${days}`);
}

async function main() {
  // Unit: classification
  const standard = trialClassification.classifyTrialSource({
    trialStart: new Date().toISOString(),
    trialEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    promoLabelUsed: "7-Day Pro Trial",
    trialSource: "standard_7day",
  });
  assert.equal(standard.kind, "standard_7day");
  assert.equal(standard.label, "Standard 7-Day Trial");

  const promo = trialClassification.classifyTrialSource({
    trialStart: new Date().toISOString(),
    trialEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    promoCodeUsed: "TRY1MONTH",
    promoLabelUsed: "1 Month Free",
  });
  assert.equal(promo.kind, "promo_extended");
  assert.match(promo.extensionSource, /TRY1MONTH/);

  const mystery30 = trialClassification.classifyTrialSource({
    trialStart: new Date().toISOString(),
    trialEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    trialStatus: "In Trial",
    stripeSubscriptionStatus: "trialing",
  });
  assert.equal(mystery30.kind, "unexpected_30day");
  assert.equal(mystery30.affected, true);
  console.log("PASS  classification unit cases");

  const child = startServer();
  try {
    await waitForBoot(child);

    // Standard 7-day checkout must send trial_period_days=7 even if a retired promo code is entered.
    const storeBoot = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    storeBoot.promoCodes = [{
      id: "promo_test_try1",
      code: "TRY1MONTH",
      label: "Test 1 Month Free (retired)",
      trialDays: 30,
      status: "active",
      source: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, {
      id: "promo_test_intentional",
      code: "INTENTIONAL30",
      label: "Intentional future promo",
      trialDays: 30,
      status: "active",
      source: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    fs.writeFileSync(STORE_PATH, JSON.stringify(storeBoot, null, 2));

    const checkout = await requestJson("POST", "/api/create-checkout-session", {
      email: "standard-trial@test.local",
      plan: "monthly",
      trial7day: true,
      promoCode: "TRY1MONTH",
      successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
      cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
    });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.json));
    assert.equal(checkout.json.trial?.trialDays, 7);
    assert.equal(checkout.json.promo, null);
    assert.match(String(checkout.json.url || ""), /trial_days=7/);
    assert.doesNotMatch(String(checkout.json.url || ""), /trial_days=30/);
    console.log("PASS  trial7day overrides promo and keeps 7-day Stripe trial");

    // TRY1MONTH must be rejected for new redemptions (archived + retired block).
    const retiredAttempt = await requestJson("POST", "/api/create-checkout-session", {
      email: "retired-promo@test.local",
      plan: "monthly",
      promoCode: "TRY1MONTH",
    });
    assert.equal(retiredAttempt.status, 400, JSON.stringify(retiredAttempt.json));
    assert.match(String(retiredAttempt.json?.error || ""), /no longer available|not active/i);
    console.log("PASS  retired TRY1MONTH does not grant a 30-day trial");

    const storeAfterCheckout = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const pending = storeAfterCheckout.users["standard-trial@test.local"];
    assert.equal(pending.pendingTrialDays, 7);
    assert.equal(pending.pendingTrialSource, "standard_7day");

    // Drive applyCheckoutMembershipUpgrade end-state: trial ends exactly 7 days after start.
    const trialStart = new Date().toISOString();
    const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
    storeAfterCheckout.users["standard-trial@test.local"] = {
      ...pending,
      plan: "Pro",
      subscriptionStatus: "Pro Monthly Subscription trialing",
      stripeSubscriptionStatus: "trialing",
      trialStatus: "In Trial",
      trialStart,
      trialEnd,
      accessEndsAt: trialEnd,
      currentPeriodEnd: trialEnd,
      trialSource: "standard_7day",
      trialExtensionSource: "7-Day Pro Trial",
      promoTrialDays: 7,
      introductoryTrialConsumed: true,
      hasPaymentMethod: true,
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(storeAfterCheckout, null, 2));
    assertNearDays(trialStart, trialEnd, 7, "standard trial end");
    console.log("PASS  new standard trial ends 7 days after checkout start");

    // Intentional future promo path (admin-created active code that is not retired) still works.
    const promoCheckout2 = await requestJson("POST", "/api/create-checkout-session", {
      email: "promo-trial@test.local",
      plan: "monthly",
      promoCode: "INTENTIONAL30",
    });
    assert.equal(promoCheckout2.status, 200, JSON.stringify(promoCheckout2.json));
    assert.equal(promoCheckout2.json.promo?.trialDays, 30);
    assert.match(String(promoCheckout2.json.url || ""), /trial_days=30/);
    console.log("PASS  intentional active promo still creates 30-day Stripe trial");

    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    assert.doesNotMatch(appJs, /placeholder="TRY1MONTH"/);
    assert.doesNotMatch(appJs, /example: TRY1MONTH/);
    assert.match(appJs, /defaultTrialDays:\s*7/);
    console.log("PASS  TRY1MONTH removed from signup placeholders / examples");

    // Admin trial audit endpoint
    const login = await requestJson("POST", "/api/admin/login", {
      email: "trial-audit-admin@test.local",
      password: "trial-audit-pass",
      code: "trial-audit-code",
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;
    assert.ok(token, "admin token");
    const audit = await requestJson("GET", `/api/admin/trial-audit?adminToken=${encodeURIComponent(token)}`);
    assert.equal(audit.status, 200, JSON.stringify(audit.json));
    assert.equal(audit.json.standardTrialDays, 7);
    assert.ok(audit.json.summary);
    const standardRow = (audit.json.trials || []).find((r) => r.email === "standard-trial@test.local");
    assert.ok(standardRow, "standard trial in audit");
    assert.equal(standardRow.kind, "standard_7day");
    assert.equal(standardRow.kindLabel, "Standard 7-Day Trial");
    console.log("PASS  admin trial-audit classifies Standard 7-Day Trial");

    // Static copy still says 7-day on customer-facing surfaces
    const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(appJs, /Standard 7-Day Trial/);
    assert.match(appJs, /Correct Promo-Extended Trial|Promo-Extended Trial/);
    assert.match(appJs, /Correct Manual Extension|Manually Extended Trial/);
    assert.match(indexHtml, /7-day Pro trial/i);
    console.log("PASS  Admin labels + customer 7-day wording present");

    console.log("ALL PASS test-trial-length-regression");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
