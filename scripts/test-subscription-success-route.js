#!/usr/bin/env node
/**
 * Dedicated Stripe subscription-success URL for Google Ads conversions.
 *
 * Run: NODE_ENV=test node scripts/test-subscription-success-route.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19920 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-sub-success-${crypto.randomBytes(4).toString("hex")}.json`);
const SITE = `http://127.0.0.1:${PORT}`;

function request(method, urlPath, body) {
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
          resolve({ status: res.statusCode, headers: res.headers, json, text });
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
      SITE_URL: SITE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_subscription_success",
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
      const res = await request("GET", "/api/health");
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

  assert.match(
    serverJs,
    /success_url:\s*body\.successUrl\s*\|\|\s*`\$\{appBaseUrl\(\)\}\\\/subscription-success\?session_id=\{CHECKOUT_SESSION_ID\}`/,
  );
  assert.match(serverJs, /cancel_url:\s*body\.cancelUrl\s*\|\|\s*`\$\{SITE_URL\}\?checkout=cancel`/);
  assert.match(appJs, /successUrl:\s*`\$\{window\.location\.origin\}\/subscription-success\?session_id=\{CHECKOUT_SESSION_ID\}`/);
  assert.match(appJs, /cancelUrl:\s*`\$\{window\.location\.origin\}\$\{window\.location\.pathname\}\?checkout=cancel`/);
  assert.match(appJs, /locationRouteKey\(window\.location\.pathname\) === "\/subscription-success"/);
  assert.match(appJs, /"\/subscription-success":\s*"payment-success"/);
  assert.doesNotMatch(
    appJs,
    /successUrl:\s*`\$\{window\.location\.origin\}\$\{window\.location\.pathname\}\?checkout=success/,
  );
  console.log("PASS  source wiring: Stripe success_url is /subscription-success; cancel_url is not");

  const child = startServer();
  try {
    await waitForBoot(child);

    const page = await request("GET", "/subscription-success");
    assert.equal(page.status, 200, page.text.slice(0, 200));
    assert.match(String(page.headers["content-type"] || ""), /text\/html/);
    assert.match(page.text, /id="view-payment-success"/);
    assert.match(page.text, /<script src="\/app\.js"/);
    console.log("PASS  GET /subscription-success serves the SPA payment-success shell");

    const trailing = await request("GET", "/subscription-success/");
    assert.equal(trailing.status, 200);
    assert.match(trailing.text, /id="view-payment-success"|id="app"|Little Learner Hub/i);
    console.log("PASS  trailing-slash /subscription-success/ still serves the SPA");

    const checkout = await request("POST", "/api/create-checkout-session", {
      email: "new-subscriber@test.local",
      plan: "monthly",
    });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.json));
    const checkoutUrl = String(checkout.json?.url || "");
    const successUrl = new URL(checkoutUrl).searchParams.get("success_url") || "";
    const cancelUrl = new URL(checkoutUrl).searchParams.get("cancel_url") || "";
    assert.match(successUrl, /\/subscription-success\?session_id=\{CHECKOUT_SESSION_ID\}$/);
    assert.doesNotMatch(successUrl, /checkout=success/);
    assert.match(cancelUrl, /[?&]checkout=cancel/);
    assert.doesNotMatch(cancelUrl, /subscription-success/);
    console.log("PASS  default Checkout Session success_url is /subscription-success; cancel_url is not");

    const canceledOverride = await request("POST", "/api/create-checkout-session", {
      email: "cancel-override@test.local",
      plan: "monthly",
      successUrl: `${SITE}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${SITE}/?checkout=cancel`,
    });
    assert.equal(canceledOverride.status, 200, JSON.stringify(canceledOverride.json));
    const overrideUrl = new URL(String(canceledOverride.json?.url || ""));
    assert.doesNotMatch(overrideUrl.searchParams.get("cancel_url") || "", /subscription-success/);
    assert.match(overrideUrl.searchParams.get("success_url") || "", /\/subscription-success/);
    console.log("PASS  canceled checkout URL never targets /subscription-success");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    store.users["already-pro@test.local"] = {
      email: "already-pro@test.local",
      plan: "Pro",
      subscriptionStatus: "Pro Monthly Subscription Active",
      stripeSubscriptionStatus: "active",
      stripeCustomerId: "cus_sim_existing",
      stripeSubscriptionId: "sub_sim_existing",
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));

    const blocked = await request("POST", "/api/create-checkout-session", {
      email: "already-pro@test.local",
      plan: "monthly",
    });
    assert.equal(blocked.status, 409, JSON.stringify(blocked.json));
    assert.equal(blocked.json?.alreadySubscribed, true);
    console.log("PASS  existing subscribers are still blocked from a second checkout");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
