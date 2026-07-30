#!/usr/bin/env node
/**
 * 7-day Pro trial: card required at Checkout, Stripe bills after trial ends.
 *
 * Run: NODE_ENV=test node scripts/test-pro-trial-card-charge.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-trial-card-${crypto.randomBytes(4).toString("hex")}.json`);

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
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, foundingMembers: [] }, null, 2));
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
      STRIPE_SECRET_KEY: "sk_test_simulation_trial_card",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
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

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(serverJs, /payment_method_collection:\s*"always"/);
  assert.match(serverJs, /subscription_data\[trial_period_days\]"\]\s*=\s*"7"/);
  assert.match(serverJs, /subscription_data\[trial_settings\]\[end_behavior\]\[missing_payment_method\]"\]\s*=\s*"cancel"/);
  assert.match(serverJs, /metadata\[promoTrialDays\]"\]\s*=\s*"7"/);
  assert.match(serverJs, /metadata\[trial7day\]"\]\s*=\s*"true"/);
  assert.match(appJs, /trial7day:\s*true/);
  assert.match(appJs, /charged Pro Monthly|charges Pro Monthly|Charged \$19\.99\/month after 7 days/i);
  assert.match(indexHtml, /credit card is required to start the trial/i);
  assert.match(indexHtml, /right after the trial ends/i);
  console.log("PASS  static wiring: card-required trial + post-trial charge copy");

  const child = startServer();
  try {
    await waitForBoot(child);

    const checkout = await requestJson("POST", "/api/create-checkout-session", {
      email: "trial-card@test.local",
      plan: "monthly",
      trial7day: true,
      successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
      cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
    });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.json));
    assert.equal(checkout.json.paymentMethodRequired, true);
    assert.equal(checkout.json.trial?.applied, true);
    assert.equal(checkout.json.trial?.trialDays, 7);
    assert.equal(checkout.json.plan, "monthly");
    const url = String(checkout.json.url || "");
    assert.match(url, /trial_days=7/);
    assert.match(url, /promo_trial_days=7/);
    assert.match(url, /payment_method_collection=always/);
    assert.match(url, /trial_missing_pm=cancel/);
    assert.match(url, /price_sim_pro_monthly/);
    console.log("PASS  create-checkout-session sends 7-day trial + always collects card");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const user = store.users?.["trial-card@test.local"];
    assert.ok(user, "user should be upserted");
    assert.equal(user.pendingTrialDays, 7);
    assert.equal(user.pendingPromoLabel, "7-Day Pro Trial");
    assert.equal(user.pendingPlan, "monthly");
    console.log("PASS  pending trial state stored for webhook/status sync");

    const freshStore = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    freshStore.users["already-trialed@test.local"] = {
      email: "already-trialed@test.local",
      plan: "Free",
      introductoryTrialConsumed: true,
      trialStart: new Date(Date.now() - 10 * 86400000).toISOString(),
      trialEnd: new Date(Date.now() - 3 * 86400000).toISOString(),
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(freshStore, null, 2));

    const reuse = await requestJson("POST", "/api/create-checkout-session", {
      email: "already-trialed@test.local",
      plan: "monthly",
      trial7day: true,
    });
    assert.equal(reuse.status, 409);
    assert.equal(reuse.json?.trialAlreadyUsed, true);
    console.log("PASS  introductory trial cannot be reused after card trial starts");

    // Document expected Stripe post-trial charge behavior (app does not invent a charge).
    assert.match(
      serverJs,
      /invoice\.paid|invoice\.payment_succeeded/,
      "webhook must sync membership when Stripe charges after trial",
    );
    console.log("PASS  invoice.paid webhook present so post-trial charge updates membership");
  } finally {
    await stopServer(child);
  }

  console.log("\nAll pro-trial card-charge checks passed.");
}

main().catch((error) => {
  console.error("FAIL", error.message || error);
  process.exit(1);
});
