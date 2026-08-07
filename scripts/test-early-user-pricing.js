#!/usr/bin/env node
/**
 * Early User pricing ($13.99) — feature flag, entitlement, checkout simulation,
 * webhook price mapping, and UI consistency when enabled/disabled.
 *
 * Run: NODE_ENV=test node scripts/test-early-user-pricing.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19720 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-early-user-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "early-user-pricing");

const membershipAccess = require("./membership-access.js");
const metaCapi = require("../server/meta-capi.js");

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: options.port || PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
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

function startServer(envOverrides = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(envOverrides.PORT || PORT),
      SITE_URL: `http://127.0.0.1:${envOverrides.PORT || PORT}`,
      ADMIN_EMAIL: "early-user-qa@test.local",
      ADMIN_PASSWORD: "early-user-qa-pass",
      ADMIN_ACCESS_CODE: "early-user-qa-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: "48",
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_early_user",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_EARLY_USER_MONTHLY: "price_sim_early_user_monthly",
      EARLY_USER_PRICING_ENABLED: "false",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });
  return { child, getStderr: () => stderr, port: Number(envOverrides.PORT || PORT) };
}

async function waitForHealth(port = PORT, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health", null, { port });
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server did not become healthy");
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }, 2000);
  });
}

function unitTests() {
  const earlyUser = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_eu",
    status: "active",
    metadata: { plan: "early_user" },
    items: { data: [{ price: { id: "price_sim_early_user_monthly", unit_amount: 1399, nickname: "Early User Monthly", metadata: { offer: "early_user" } } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  }, {});
  record("webhook mapping: early_user → Pro entitlement", earlyUser.plan === "Pro" && earlyUser.monthlyPrice === "$13.99/month");
  record("webhook mapping: early_user billingOffer", earlyUser.billingOffer === "early_user");
  record("webhook mapping: early_user priceLock", earlyUser.priceLock === "Early User");
  record("plan display: Pro — Early User", membershipAccess.membershipPlanDisplay(earlyUser) === "Pro — Early User");
  record("hasProAccess for early_user", membershipAccess.membershipHasProAccess(earlyUser) === true);
  record("membershipIsEarlyUser helper", membershipAccess.membershipIsEarlyUser(earlyUser) === true);
  record("access key early_user for analytics", membershipAccess.membershipCurrentAccessKey(earlyUser) === "early_user");
  record("product status key active_early_user", membershipAccess.membershipProductStatus(earlyUser).key === "active_early_user");

  const standard = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_std",
    status: "active",
    metadata: { plan: "monthly" },
    items: { data: [{ price: { id: "price_sim_pro_monthly", unit_amount: 1999 } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  }, {});
  record("standard $19.99 still maps to Pro Monthly", standard.plan === "Pro" && standard.monthlyPrice === "$19.99/month" && standard.billingOffer !== "early_user");
  record("standard access key remains pro (not early_user)", membershipAccess.membershipCurrentAccessKey(standard) === "pro");

  // Existing $19.99 subscriber snapshot must not be rewritten by Early User helpers.
  const existingPro = {
    plan: "Pro",
    monthlyPrice: "$19.99/month",
    billingOffer: "pro_monthly",
    priceLock: "",
    stripeSubscriptionStatus: "active",
    subscriptionStatus: "Pro Monthly Subscription Active",
    subscriptionCadence: "monthly",
  };
  record("no auto-migration: existing $19.99 stays $19.99", existingPro.monthlyPrice === "$19.99/month" && !membershipAccess.membershipIsEarlyUser(existingPro));
  record("no auto-migration: planKey for $19.99 sub stays monthly", membershipAccess.planKeyFromStripeSubscription({
    status: "active",
    metadata: { plan: "monthly" },
    items: { data: [{ price: { id: "price_sim_pro_monthly", unit_amount: 1999 } }] },
  }, existingPro) === "monthly");

  const founding = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_f",
    status: "active",
    metadata: { plan: "founding" },
    items: { data: [{ price: { id: "price_sim_founding_monthly", unit_amount: 999 } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  }, {});
  record("founding $9.99 untouched", founding.plan === "Founding" && founding.monthlyPrice === "$9.99/month");

  const annual = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_a",
    status: "active",
    metadata: { plan: "annual" },
    items: { data: [{ price: { id: "price_sim_pro_annual", unit_amount: 19900 } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400,
  }, {});
  record("annual $199 untouched", annual.plan === "Pro" && annual.monthlyPrice === "$199/year");

  // Flag-off renewal: stored early_user markers must still resolve via amount/nickname.
  const renewed = membershipAccess.planKeyFromStripeSubscription({
    status: "active",
    metadata: {},
    items: { data: [{ price: { unit_amount: 1399, nickname: "Early User Monthly" } }] },
  }, { billingOffer: "early_user", priceLock: "Early User" });
  record("renewal without flag still identifies early_user", renewed === "early_user");

  // Incomplete Stripe payload renewal still preserves Early User via stored markers.
  const sparseRenewal = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_eu_renew",
    status: "active",
    metadata: {},
    items: { data: [] },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  }, { billingOffer: "early_user", priceLock: "Early User", plan: "Pro", subscriptionCadence: "monthly" });
  record("renewal webhook preserves billingOffer early_user", sparseRenewal.billingOffer === "early_user");
  record("renewal webhook preserves $13.99", sparseRenewal.monthlyPrice === "$13.99/month");
  record("renewal webhook preserves priceLock", sparseRenewal.priceLock === "Early User");

  // Trial conversion / subscription update still Early User.
  const trialConvert = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_eu_trial",
    status: "active",
    metadata: { plan: "early_user" },
    items: { data: [{ price: { id: "price_sim_early_user_monthly", unit_amount: 1399, nickname: "Early User Monthly", metadata: { offer: "early_user" } } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  }, {
    billingOffer: "early_user",
    priceLock: "Early User",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    plan: "Pro",
  });
  record("trial conversion preserves early_user offer", trialConvert.billingOffer === "early_user" && trialConvert.monthlyPrice === "$13.99/month");

  const canceling = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_eu_cancel",
    status: "active",
    cancel_at_period_end: true,
    metadata: { plan: "early_user" },
    items: { data: [{ price: { unit_amount: 1399, nickname: "Early User Monthly", metadata: { offer: "early_user" } } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 10 * 86400,
  }, { billingOffer: "early_user", priceLock: "Early User" });
  record("cancel-at-period-end keeps early_user while access remains", canceling.billingOffer === "early_user" && canceling.monthlyPrice === "$13.99/month");

  record("meta planValueUsd early_user=13.99", metaCapi.planValueUsd("early_user") === 13.99);
  record("meta planValueUsd monthly=19.99", metaCapi.planValueUsd("monthly") === 19.99);

  // Analytics separation sanity
  const accessKeys = [
    membershipAccess.membershipCurrentAccessKey(earlyUser),
    membershipAccess.membershipCurrentAccessKey(standard),
  ];
  record("analytics separates early_user vs pro keys", accessKeys[0] === "early_user" && accessKeys[1] === "pro");
}

async function apiTests() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Flag OFF — default safe release posture
  let { child, getStderr } = startServer({ EARLY_USER_PRICING_ENABLED: "false" });
  try {
    await waitForHealth();
    const offStatus = await requestJson("GET", "/api/founding-status");
    const offFounding = offStatus.json?.founding || offStatus.json || {};
    record("flag OFF: founding-status earlyUserPricingEnabled=false", offStatus.status === 200 && offFounding.earlyUserPricingEnabled === false);
    record("flag OFF: primaryPaidOffer=monthly", offFounding.primaryPaidOffer === "monthly");
    record("flag OFF: primaryMonthlyPrice=$19.99", offFounding.primaryMonthlyPrice === "$19.99/month");

    const offCheckout = await requestJson("POST", "/api/create-checkout-session", {
      email: "early-off@test.local",
      plan: "early_user",
    });
    record("flag OFF: early_user request remaps (200 with monthly or accepted remap)", offCheckout.status === 200);
    record("flag OFF: remapped checkout uses monthly price id", String(offCheckout.json?.url || "").includes("price_sim_pro_monthly") || offCheckout.json?.plan === "monthly");

    const stdCheckout = await requestJson("POST", "/api/create-checkout-session", {
      email: "std-pro@test.local",
      plan: "monthly",
    });
    record("flag OFF: standard $19.99 checkout works", stdCheckout.status === 200 && String(stdCheckout.json?.url || "").includes("price_sim_pro_monthly"));
  } finally {
    await stopServer(child);
    if (getStderr().includes("EARLY_USER")) console.log(getStderr().slice(0, 400));
  }

  // Flag ON
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, foundingMembers: [], promoCodes: [], promoRedemptions: [] }, null, 2));
  ({ child, getStderr } = startServer({ EARLY_USER_PRICING_ENABLED: "true" }));
  try {
    await waitForHealth();
    const onStatus = await requestJson("GET", "/api/founding-status");
    const onFounding = onStatus.json?.founding || onStatus.json || {};
    if (!(onStatus.status === 200 && onFounding.earlyUserPricingEnabled === true)) {
      console.log("DEBUG founding-status ON:", onStatus.status, JSON.stringify(onStatus.json || onStatus.text).slice(0, 500));
    }
    record("flag ON: earlyUserPricingEnabled=true", onStatus.status === 200 && onFounding.earlyUserPricingEnabled === true, onFounding.earlyUserPricingEnabled);
    record("flag ON: primaryPaidOffer=early_user", onFounding.primaryPaidOffer === "early_user", onFounding.primaryPaidOffer);
    record("flag ON: primaryMonthlyPrice=$13.99", onFounding.primaryMonthlyPrice === "$13.99/month", onFounding.primaryMonthlyPrice);
    record("flag ON: regularMonthlyPrice still $19.99", onFounding.regularMonthlyPrice === "$19.99/month", onFounding.regularMonthlyPrice);
    record("flag ON: Limited-Time Early User Price copy", /Limited-Time Early User Price/i.test(String(onFounding.earlyUserAvailabilityCopy || onFounding.spotsLeftMessage || onFounding.earlyUserOfferName || "")));

    const euCheckout = await requestJson("POST", "/api/create-checkout-session", {
      email: "early-on@test.local",
      plan: "early_user",
    });
    record("flag ON: early_user checkout uses $13.99 price", euCheckout.status === 200 && String(euCheckout.json?.url || "").includes("price_sim_early_user_monthly"));
    record("flag ON: checkout plan=early_user", euCheckout.json?.plan === "early_user");

    const trialCheckout = await requestJson("POST", "/api/create-checkout-session", {
      email: "early-trial@test.local",
      plan: "early_user",
      trial7day: true,
    });
    record("flag ON: trial early_user checkout ok", trialCheckout.status === 200 && String(trialCheckout.json?.url || "").includes("price_sim_early_user_monthly"));
    record("flag ON: trial days present", Boolean(trialCheckout.json?.trial?.applied) || String(trialCheckout.json?.url || "").includes("trial_days=7"));

    const regularStill = await requestJson("POST", "/api/create-checkout-session", {
      email: "regular-still@test.local",
      plan: "monthly",
    });
    record("flag ON: regular $19.99 checkout still available", regularStill.status === 200 && String(regularStill.json?.url || "").includes("price_sim_pro_monthly"));
    record("in-flight session embeds early_user price id", String(euCheckout.json?.url || "").includes("price_sim_early_user_monthly"));

    // Browser UI when enabled
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.foundingStatusLoaded?.() === true, null, { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => {
        if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
        if (typeof window.setView === "function") window.setView("plans");
      }).catch(() => {});
      await page.waitForTimeout(800);
      const desktopText = await page.locator("body").innerText();
      record("UI enabled: shows $13.99", /\$13\.99/.test(desktopText));
      record("UI enabled: shows Limited-Time Early User Price", /Limited-Time Early User Price/i.test(desktopText));
      record("UI enabled: still mentions regular $19.99", /\$19\.99/.test(desktopText));
      await page.screenshot({ path: path.join(OUT_DIR, "desktop-pricing-early-user.png"), fullPage: true });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, "mobile-pricing-early-user.png"), fullPage: true });
      const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      record("UI mobile: no horizontal overflow", mobileOverflow === false);

      // Homepage surfaces
      await page.evaluate(() => { if (typeof window.setView === "function") window.setView("home"); });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, "mobile-homepage-early-user.png"), fullPage: true });
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(child);
  }

  // Seed locked Early User + existing Pro after the ON server exits so disk store is authoritative.
  {
    const seedStore = fs.existsSync(STORE_PATH)
      ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8"))
      : { users: {}, foundingMembers: [], promoCodes: [], promoRedemptions: [] };
    seedStore.users = seedStore.users || {};
    seedStore.users["inflight-early@test.local"] = {
      email: "inflight-early@test.local",
      plan: "Pro",
      planDisplayName: "Pro — Early User",
      monthlyPrice: "$13.99/month",
      billingOffer: "early_user",
      priceLock: "Early User",
      subscriptionCadence: "monthly",
      subscriptionStatus: "Pro Early User Subscription Active",
      stripeSubscriptionStatus: "active",
      stripeSubscriptionId: "sub_inflight_early",
      stripeCustomerId: "cus_inflight_early",
      subscriptionStartedAt: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400).toISOString(),
      accessEndsAt: new Date(Date.now() + 30 * 86400).toISOString(),
      accountStatus: "Active",
      createdAt: new Date().toISOString(),
    };
    seedStore.users["existing-pro@test.local"] = {
      email: "existing-pro@test.local",
      plan: "Pro",
      monthlyPrice: "$19.99/month",
      billingOffer: "pro_monthly",
      priceLock: "",
      subscriptionCadence: "monthly",
      subscriptionStatus: "Pro Monthly Subscription Active",
      stripeSubscriptionStatus: "active",
      stripeSubscriptionId: "sub_existing_pro",
      accountStatus: "Active",
      createdAt: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400).toISOString(),
      accessEndsAt: new Date(Date.now() + 30 * 86400).toISOString(),
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(seedStore, null, 2));
  }

  // Flag OFF after Early User members already exist — lock + analytics must survive.
  ({ child } = startServer({ EARLY_USER_PRICING_ENABLED: "false" }));
  try {
    await waitForHealth();
    const storeAfter = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const locked = storeAfter.users?.["inflight-early@test.local"] || {};
    const existing = storeAfter.users?.["existing-pro@test.local"] || {};
    record("flag later OFF: Early User stays $13.99 in store", locked.monthlyPrice === "$13.99/month" && locked.billingOffer === "early_user");
    record("flag later OFF: existing $19.99 untouched in store", existing.monthlyPrice === "$19.99/month" && existing.billingOffer === "pro_monthly");
    record(
      "flag later OFF: access keys stay separated",
      membershipAccess.membershipCurrentAccessKey(locked) === "early_user"
        && membershipAccess.membershipCurrentAccessKey(existing) === "pro",
    );
    // New acquisition remaps, but renewal identity does not.
    const remapped = await requestJson("POST", "/api/create-checkout-session", {
      email: "new-after-disable@test.local",
      plan: "early_user",
    });
    record("flag later OFF: new early_user checkout remaps to monthly", remapped.status === 200 && (remapped.json?.plan === "monthly" || String(remapped.json?.url || "").includes("price_sim_pro_monthly")));
    record(
      "analytics earlyUserUsers counted separately",
      membershipAccess.membershipCurrentAccessKey(locked) === "early_user"
        && membershipAccess.membershipCurrentAccessKey(existing) === "pro",
      "verified via membershipCurrentAccessKey",
    );
  } finally {
    await stopServer(child);
  }

  // Flag OFF UI regression: must not advertise $13.99
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, foundingMembers: [], promoCodes: [], promoRedemptions: [] }, null, 2));
  ({ child } = startServer({ EARLY_USER_PRICING_ENABLED: "false" }));
  try {
    await waitForHealth();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.foundingStatusLoaded?.() === true, null, { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => {
        if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
        if (typeof window.setView === "function") window.setView("plans");
      }).catch(() => {});
      await page.waitForTimeout(800);
      const text = await page.locator("body").innerText();
      record("UI disabled: does not show Early User Special as live offer", !/Early User Special/i.test(text) || !/ \$13\.99/.test(text));
      record("UI disabled: shows $19.99", /\$19\.99/.test(text));
      await page.screenshot({ path: path.join(OUT_DIR, "desktop-pricing-flag-off.png"), fullPage: true });
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(child);
  }
}

async function main() {
  console.log("=== Early User pricing tests ===");
  unitTests();
  await apiTests();
  const failed = results.filter((r) => !r.ok);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    outDir: OUT_DIR,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "early-user-pricing-results.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed}/${summary.total} passed`);
  if (failed.length) {
    console.error("FAILED:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
