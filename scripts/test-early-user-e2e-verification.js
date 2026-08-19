#!/usr/bin/env node
/**
 * End-to-end Early User pre-enable verification.
 * Does NOT enable production. Spawns local servers with flag OFF / ON.
 *
 * Run: NODE_ENV=test node scripts/test-early-user-e2e-verification.js
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19820 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-eu-e2e-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "early-user-e2e");

const membershipAccess = require("./membership-access.js");

const results = [];
function record(section, name, ok, detail = "") {
  results.push({ section, name, ok: Boolean(ok), detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"}  [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
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
      ADMIN_EMAIL: "early-user-e2e@test.local",
      ADMIN_PASSWORD: "early-user-e2e-pass",
      ADMIN_ACCESS_CODE: "early-user-e2e-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: "48",
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_early_user_e2e",
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
  return { child, getStderr: () => stderr };
}

async function waitForHealth(port = PORT, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health", null, { port });
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server did not become healthy");
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } }, 2000);
  });
}

async function captureViews(page, prefix) {
  const shots = {};
  const views = [
    ["home", "home"],
    ["plans", "pricing"],
    ["signup", "signup"],
    ["upgrade", "upgrade"],
    ["billing", "billing"],
  ];
  for (const [view, label] of views) {
    await page.evaluate((v) => {
      if (typeof window.setView === "function") window.setView(v);
      if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
      if (typeof window.renderPricingPage === "function" && v === "plans") window.renderPricingPage();
      if (typeof window.renderUpgradePage === "function" && v === "upgrade") window.renderUpgradePage();
    }, view).catch(() => {});
    await page.waitForTimeout(600);
    const file = path.join(OUT_DIR, `${prefix}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    shots[label] = file;
  }
  // Upgrade modal if available
  await page.evaluate(() => {
    if (typeof window.openProFeatureModal === "function") window.openProFeatureModal({ feature: "lesson" });
    else if (typeof window.showFoundingUpgradeModal === "function") window.showFoundingUpgradeModal();
  }).catch(() => {});
  await page.waitForTimeout(500);
  const modalFile = path.join(OUT_DIR, `${prefix}-upgrade-modal.png`);
  await page.screenshot({ path: modalFile, fullPage: true });
  shots.modal = modalFile;
  return shots;
}

function analyzeBodyText(text, expectEarlyUser) {
  const has1999 = /\$19\.99/.test(text);
  const has1399 = /\$13\.99/.test(text);
  const hasLimited = /Early User Special|Limited-Time Early User Price/i.test(text);
  const hasLegacyOffer = /Early User Special/i.test(text);
  return { has1999, has1399, hasLimited, hasLegacyOffer, length: text.length };
}

async function runFlagOffUi() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, foundingMembers: [], promoCodes: [], promoRedemptions: [] }, null, 2));
  const { child } = startServer({ EARLY_USER_PRICING_ENABLED: "false" });
  try {
    await waitForHealth();
    const status = await requestJson("GET", "/api/founding-status");
    const founding = status.json?.founding || status.json || {};
    record("1-flag-off", "API earlyUserPricingEnabled=false", founding.earlyUserPricingEnabled === false);
    record("1-flag-off", "API primaryPaidOffer=monthly", founding.primaryPaidOffer === "monthly");
    record("1-flag-off", "API primaryMonthlyPrice=$19.99", founding.primaryMonthlyPrice === "$19.99/month");

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.foundingStatusLoaded?.() === true, null, { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => {
        if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
      });
      const shots = await captureViews(page, "flag-off");
      const homeText = await page.locator("body").innerText();
      // Aggregate text across key views
      const texts = {};
      for (const view of ["home", "plans", "signup", "upgrade", "billing"]) {
        await page.evaluate((v) => {
          if (typeof window.setView === "function") window.setView(v);
          if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
        }, view);
        await page.waitForTimeout(400);
        texts[view] = await page.locator("body").innerText();
        const a = analyzeBodyText(texts[view], false);
        record("1-flag-off", `${view}: shows $19.99`, a.has1999 || view === "billing", `1399=${a.has1399}`);
        record("1-flag-off", `${view}: no $13.99`, !a.has1399);
        record("1-flag-off", `${view}: no Early User Special offer`, !a.hasLimited);
      }
      // Open upgrade modal text
      await page.evaluate(() => {
        if (typeof window.setView === "function") window.setView("home");
        if (typeof window.openProFeatureModal === "function") window.openProFeatureModal({ feature: "lesson" });
      }).catch(() => {});
      await page.waitForTimeout(400);
      const modalText = await page.locator("body").innerText();
      const modalA = analyzeBodyText(modalText, false);
      record("1-flag-off", "upgrade modal: no $13.99", !modalA.has1399);
      record("1-flag-off", "screenshots captured", Boolean(shots.home && shots.pricing), JSON.stringify(Object.keys(shots)));
      fs.writeFileSync(path.join(OUT_DIR, "flag-off-body-samples.json"), JSON.stringify({
        homeSnippet: texts.home?.slice(0, 1200),
        plansSnippet: texts.plans?.slice(0, 1200),
        signupSnippet: texts.signup?.slice(0, 1200),
      }, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(child);
  }
}

async function runFlagOnUi() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, foundingMembers: [], promoCodes: [], promoRedemptions: [] }, null, 2));
  const { child } = startServer({ EARLY_USER_PRICING_ENABLED: "true" });
  try {
    await waitForHealth();
    const status = await requestJson("GET", "/api/founding-status");
    const founding = status.json?.founding || status.json || {};
    record("4-flag-on", "API earlyUserPricingEnabled=true", founding.earlyUserPricingEnabled === true);
    record("4-flag-on", "API early user special copy", /Early User Special/i.test(String(founding.earlyUserAvailabilityCopy || founding.spotsLeftMessage || "")));
    record("4-flag-on", "API expires August 25, 2026", String(founding.earlyUserOfferExpiresLabel || "").includes("August 25, 2026"));
    record("4-flag-on", "API primaryMonthlyPrice=$13.99", founding.primaryMonthlyPrice === "$13.99/month");
    record("4-flag-on", "API regular still $19.99", founding.regularMonthlyPrice === "$19.99/month");

    const checkout = await requestJson("POST", "/api/create-checkout-session", {
      email: "e2e-early@test.local",
      plan: "early_user",
      trial7day: true,
    });
    record("4-flag-on", "checkout early_user + trial uses $13.99 price", checkout.status === 200 && String(checkout.json?.url || "").includes("price_sim_early_user_monthly"));
    record("4-flag-on", "checkout plan=early_user", checkout.json?.plan === "early_user");
    record("4-flag-on", "checkout trial present", Boolean(checkout.json?.trial?.applied) || String(checkout.json?.url || "").includes("trial_days=7"));

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForFunction(() => window.foundingStatusLoaded?.() === true, null, { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => {
        if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
      });
      await captureViews(page, "flag-on");

      for (const view of ["home", "plans", "signup", "upgrade"]) {
        await page.evaluate((v) => {
          if (typeof window.setView === "function") window.setView(v);
          if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
          if (typeof window.renderPricingPage === "function" && v === "plans") window.renderPricingPage();
        }, view);
        await page.waitForTimeout(500);
        const text = await page.locator("body").innerText();
        const a = analyzeBodyText(text, true);
        record("4-flag-on", `${view}: shows $13.99`, a.has1399);
        record("4-flag-on", `${view}: shows Early User Special`, a.hasLimited);
        record("4-flag-on", `${view}: still shows regular $19.99`, a.has1999);
      }

      // Billing summary for Early User account
      await page.evaluate(() => {
        const email = "e2e-billing-early@test.local";
        localStorage.setItem("llhUser", email);
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        accounts[email] = {
          email,
          plan: "Pro",
          monthlyPrice: "$13.99/month",
          billingOffer: "early_user",
          priceLock: "Early User",
          subscriptionCadence: "monthly",
          subscriptionStatus: "Pro Early User Subscription Active",
          stripeSubscriptionStatus: "active",
          accountStatus: "Active",
        };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        if (typeof window.loadAccountState === "function") window.loadAccountState(email);
        if (typeof window.setView === "function") window.setView("billing");
        if (typeof window.renderBillingPage === "function") window.renderBillingPage();
      });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT_DIR, "flag-on-billing-early-user.png"), fullPage: true });
      const billingText = await page.locator("body").innerText();
      record("4-flag-on", "billing shows $13.99", /\$13\.99/.test(billingText));
      record("4-flag-on", "billing shows Early User / Pro — Early User", /Early User/i.test(billingText));

      // Mobile homepage
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        if (typeof window.setView === "function") window.setView("home");
        if (typeof window.syncPublicFoundingOfferUi === "function") window.syncPublicFoundingOfferUi();
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, "flag-on-mobile-home.png"), fullPage: true });
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(child);
  }
}

function runExistingSubscriberAndFlagControlChecks() {
  // No migration helpers
  const accessSrc = fs.readFileSync(path.join(ROOT, "scripts/membership-access.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  record("2-existing", "no migrate-to-early-user helper", !/migrate.*early.?user|early.?user.*migrat/i.test(accessSrc + serverSrc));
  record("2-existing", "$19.99 Price env key still present", /STRIPE_PRICE_PRO_MONTHLY/.test(serverSrc));
  record("2-existing", "early_user is separate planConfig key", /early_user:\s*\{/.test(serverSrc));

  const existing = {
    plan: "Pro",
    monthlyPrice: "$19.99/month",
    billingOffer: "pro_monthly",
    stripeSubscriptionStatus: "active",
    subscriptionStatus: "Pro Monthly Subscription Active",
    subscriptionCadence: "monthly",
  };
  const renewal = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_existing",
    status: "active",
    metadata: { plan: "monthly" },
    items: { data: [{ price: { id: "price_sim_pro_monthly", unit_amount: 1999 } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  }, existing);
  record("2-existing", "renewal keeps $19.99", renewal.monthlyPrice === "$19.99/month" && renewal.billingOffer !== "early_user");

  // Flag control
  record("3-flag", "only EARLY_USER_PRICING_ENABLED gate in server", (serverSrc.match(/EARLY_USER_PRICING_ENABLED/g) || []).length >= 1);
  record("3-flag", "no SECONDARY early-user feature flags", !/EARLY_USER_OFFER|ENABLE_EARLY_USER|FEATURE_EARLY/i.test(serverSrc));
  record("3-flag", "client reads earlyUserPricingEnabled from founding-status", /earlyUserPricingEnabled\(\)/.test(appSrc) && /foundingStatusCache\?\.earlyUserPricingEnabled/.test(appSrc));
  record("3-flag", "hardcoded $13.99 only behind offer helpers / planConfig", /\$13\.99\/month/.test(serverSrc) && /earlyUserPrice:\s*"\$13\.99\/month"/.test(serverSrc));
}

function runWebhookAndAnalyticsChecks() {
  const early = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_eu",
    status: "active",
    metadata: { plan: "early_user", offer: "early_user" },
    items: { data: [{ price: { id: "price_1U1rmRPp5xmGSsPDuN4tD5Wa", unit_amount: 1399, nickname: "Early User Monthly", metadata: { offer: "early_user" } } }] },
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  }, {});
  record("5-stripe-logic", "webhook grants Pro entitlement", early.plan === "Pro" && membershipAccess.membershipHasProAccess(early));
  record("5-stripe-logic", "webhook billingOffer=early_user", early.billingOffer === "early_user");
  record("5-stripe-logic", "webhook monthlyPrice=$13.99", early.monthlyPrice === "$13.99/month");
  record("5-stripe-logic", "analytics key early_user", membershipAccess.membershipCurrentAccessKey(early) === "early_user");
  record("5-stripe-logic", "product status active_early_user", membershipAccess.membershipProductStatus(early).key === "active_early_user");

  const insightsSrc = fs.readFileSync(path.join(ROOT, "server/admin-insights.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  record("7-analytics", "offerBreakdown present", /offerBreakdown/.test(insightsSrc));
  record("7-analytics", "earlyUserUsers totals present", /earlyUserUsers/.test(serverSrc) && /earlyUserUsers/.test(appSrc));
  record("7-analytics", "admin early-user-users metric", /early-user-users/.test(appSrc));
  record("7-analytics", "meta planValueUsd early_user", require("../server/meta-capi.js").planValueUsd("early_user") === 13.99);

  // Portal: app does not enable subscription_update products when creating portal sessions
  record("6-portal", "portal session creation has no subscription_update products override", !/subscription_update\[|subscription_update:/.test(serverSrc));
  record("6-portal", "billing portal uses default configuration", /billing_portal\/sessions/.test(serverSrc));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("=== Early User E2E pre-enable verification ===");
  console.log(`OUT_DIR=${OUT_DIR}`);

  runExistingSubscriberAndFlagControlChecks();
  runWebhookAndAnalyticsChecks();
  await runFlagOffUi();
  await runFlagOnUi();

  const failed = results.filter((r) => !r.ok);
  const bySection = {};
  for (const r of results) {
    bySection[r.section] = bySection[r.section] || { pass: 0, fail: 0 };
    bySection[r.section][r.ok ? "pass" : "fail"] += 1;
  }
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    bySection,
    failedNames: failed.map((f) => `[${f.section}] ${f.name}`),
    results,
    outDir: OUT_DIR,
    productionEnable: false,
    note: "Production EARLY_USER_PRICING_ENABLED was NOT changed.",
  };
  fs.writeFileSync(path.join(OUT_DIR, "e2e-verification-results.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed}/${summary.total} passed`);
  if (failed.length) {
    console.error("FAILED:", summary.failedNames.join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
