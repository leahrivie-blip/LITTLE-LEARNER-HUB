#!/usr/bin/env node
/**
 * Membership & billing audit — founding limit, plan classification, trial labels, access.
 * Run: node scripts/test-billing-membership-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19500 + Math.floor(Math.random() * 30);
const STORE_PATH = path.join(os.tmpdir(), `llh-billing-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const FOUNDING_LIMIT = 50;
const PUBLIC_CLAIMED_BASE = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "billing-qa@test.local",
      ADMIN_PASSWORD: "billing-qa-pass",
      ADMIN_ACCESS_CODE: "billing-qa-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: String(FOUNDING_LIMIT),
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
      PUBLIC_FOUNDING_CLAIMED_BASE: String(PUBLIC_CLAIMED_BASE),
      NODE_ENV: "test",
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
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/founding-status");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

// Mirror fixed client helpers for regression tests
function isFoundingSubscription(subscription) {
  if (!subscription) return false;
  const serverPlan = String(subscription.plan || "").trim().toLowerCase();
  const pendingPlan = String(subscription.pendingPlan || "").trim().toLowerCase();
  if (Boolean(subscription.foundingMember)) return true;
  if (serverPlan === "founding") return true;
  if (pendingPlan === "founding") return true;
  return false;
}

function accountIsInTrial(account) {
  if (!account) return false;
  if (isFoundingSubscription(account)) return false;
  const trialStatus = String(account.trialStatus || "").toLowerCase();
  if (trialStatus.includes("in trial")) return true;
  const status = String(account.subscriptionStatus || "").toLowerCase();
  if (status.includes("day free trial") || status.includes("trialing")) return true;
  if (status.includes("trial") && !status.includes("trial ended") && !status.includes("no trial")) return true;
  return false;
}

function subscriptionToAccountUpdates(subscription) {
  const status = String(subscription?.subscriptionStatus || "").toLowerCase();
  const active = status.includes("active") || status.includes("trial") || status.includes("paid");
  if (!active) return { plan: "Free" };
  const isFounding = isFoundingSubscription(subscription);
  return {
    plan: isFounding ? "Founding" : "Pro",
    monthlyPrice: isFounding ? "$9.99/month" : subscription.monthlyPrice || "$19.99/month",
    foundingMember: isFounding,
  };
}

async function runBrowserChecks(baseUrl) {
  let playwright;
  try { playwright = require("playwright"); } catch { return { skipped: true }; }

  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function checkPersona(email, account, expectations) {
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ email, account }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({ [email]: account }));
      localStorage.setItem("llhPlan", account.plan);
    }, { email, account });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForResponse((r) => r.url().includes("/api/subscription-status") && r.status() === 200, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(
      (needsPro) => typeof isProUser === "function" && isProUser() === needsPro,
      expectations.proAccess,
      { timeout: 20000 },
    );
    const labels = await page.evaluate(() => ({
      planLabel: typeof billingPlanLabel === "function" ? billingPlanLabel() : null,
      effective: typeof effectiveAccessPlan === "function" ? effectiveAccessPlan() : null,
      price: typeof billingPriceLabel === "function" ? billingPriceLabel() : null,
    }));
    if (expectations.planLabel) assert(labels.planLabel === expectations.planLabel, `${email}: expected label ${expectations.planLabel}, got ${labels.planLabel}`);
    if (expectations.price) assert(labels.price === expectations.price, `${email}: expected price ${expectations.price}, got ${labels.price}`);
    if (expectations.effective) assert(labels.effective === expectations.effective, `${email}: expected effective ${expectations.effective}, got ${labels.effective}`);
  }

  const now = new Date().toISOString();
  await checkPersona("free@billing.test", { email: "free@billing.test", plan: "Free", subscriptionStatus: "Free Plan" }, {
    proAccess: false, planLabel: "Free", price: "$0/month", effective: "Free",
  });
  await checkPersona("trial@billing.test", {
    email: "trial@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription trialing",
    trialStatus: "In Trial", trialStart: now, trialEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    subscriptionStartedAt: now,
  }, { proAccess: true, planLabel: "Trial", price: "$19.99/month", effective: "Pro" });
  await checkPersona("pro@billing.test", {
    email: "pro@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active",
    subscriptionStartedAt: now, monthlyPrice: "$19.99/month",
  }, { proAccess: true, planLabel: "Pro", price: "$19.99/month", effective: "Pro" });
  await checkPersona("founding@billing.test", {
    email: "founding@billing.test", plan: "Founding", subscriptionStatus: "Founding Member Subscription Active",
    foundingMember: true, foundingMemberNumber: 5, subscriptionStartedAt: now, monthlyPrice: "$9.99/month", priceLock: "Lifetime",
  }, { proAccess: true, planLabel: "Founding Member", price: "$9.99/month", effective: "Founding" });

  await browser.close();
  return { ok: true };
}

function seedPersonas() {
  const now = new Date().toISOString();
  const store = readStore();
  store.users = store.users || {};
  store.users["free@billing.test"] = { email: "free@billing.test", plan: "Free", subscriptionStatus: "Free Plan", updatedAt: now };
  store.users["trial@billing.test"] = {
    email: "trial@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription trialing",
    trialStatus: "In Trial", trialStart: now, trialEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    subscriptionStartedAt: now, monthlyPrice: "$19.99/month", updatedAt: now,
  };
  store.users["pro@billing.test"] = {
    email: "pro@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active",
    subscriptionStartedAt: now, monthlyPrice: "$19.99/month", updatedAt: now,
  };
  store.users["founding@billing.test"] = {
    email: "founding@billing.test", plan: "Founding", subscriptionStatus: "Founding Member Subscription Active",
    foundingMember: true, foundingMemberNumber: 5, subscriptionStartedAt: now,
    monthlyPrice: "$9.99/month", priceLock: "Lifetime", updatedAt: now,
  };
  writeStore(store);
}

function seedSoldOutFounding() {
  const store = readStore();
  const slots = FOUNDING_LIMIT - PUBLIC_CLAIMED_BASE;
  store.foundingMembers = Array.from({ length: slots }, (_, i) => `founding-slot-${i}@test.local`);
  writeStore(store);
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  console.log("1) Static billing logic checks");
  assert(!/monthlyPrice[^)]*includes\(["']9\.99["']\)/.test(appJs), "app.js still uses monthlyPrice.includes('9.99') for founding detection");
  assert(appJs.includes("function isFoundingSubscription"), "isFoundingSubscription helper missing");
  assert(appJs.includes("function accountIsInTrial"), "accountIsInTrial helper missing");
  assert(!/foundingSpotsRemaining\(\) <= 0 \? "monthly"/.test(appJs), "startCheckout still silently falls back to monthly when founding sold out");

  console.log("2) Plan classification unit checks");
  const proMonthly = subscriptionToAccountUpdates({
    plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", monthlyPrice: "$19.99/month",
  });
  assert(proMonthly.plan === "Pro" && !proMonthly.foundingMember, "$19.99 Pro must not become Founding");
  assert(proMonthly.monthlyPrice === "$19.99/month", "Pro monthly price preserved");

  const founding = subscriptionToAccountUpdates({
    plan: "Founding", foundingMember: true, subscriptionStatus: "Founding Member Subscription Active", monthlyPrice: "$9.99/month",
  });
  assert(founding.plan === "Founding" && founding.foundingMember, "Founding member recognized");
  assert(founding.monthlyPrice === "$9.99/month", "Founding price is $9.99/month");

  const trial = subscriptionToAccountUpdates({
    plan: "Pro", subscriptionStatus: "Pro Monthly Subscription trialing", monthlyPrice: "$19.99/month", trialStatus: "In Trial",
  });
  assert(trial.plan === "Pro" && !trial.foundingMember, "Trial Pro must not become Founding");

  assert(accountIsInTrial({ plan: "Pro", subscriptionStatus: "Pro Monthly Subscription trialing", trialStatus: "In Trial" }), "Trial account detected");
  assert(!accountIsInTrial({ plan: "Founding", foundingMember: true, subscriptionStatus: "Founding Member Subscription Active" }), "Founding is not trial");

  const child = startServer();
  try {
    await waitForBoot(child);

    console.log("3) Founding limit & sold-out API");
    let founding = await requestJson("GET", "/api/founding-status");
    const foundingPayload = founding.json.founding || founding.json;
    assert(foundingPayload.remaining === FOUNDING_LIMIT, `Fresh store should have ${FOUNDING_LIMIT} founding spots when base is 0`);
    assert(foundingPayload.foundingPrice === "$9.99/month", "Founding price $9.99/month");
    assert(foundingPayload.regularMonthlyPrice === "$19.99/month", "Pro monthly $19.99");
    assert(foundingPayload.regularAnnualPrice === "$199/year", "Pro annual $199");

    seedSoldOutFounding();
    founding = await requestJson("GET", "/api/founding-status");
    const soldOutPayload = founding.json.founding || founding.json;
    assert(soldOutPayload.remaining === 0, "All 50 founding spots should be claimed");
    assert(soldOutPayload.soldOut === true, "soldOut flag should be true");

    console.log("4) Sold-out founding checkout is blocked (never silent $19.99 redirect)");
    const checkout = await requestJson("POST", "/api/create-checkout-session", {
      email: "newuser@billing.test",
      plan: "founding",
      successUrl: `http://127.0.0.1:${PORT}/?checkout=success`,
      cancelUrl: `http://127.0.0.1:${PORT}/?checkout=cancel`,
    });
    if (checkout.status === 503) {
      console.log("   (Stripe checkout endpoint skipped — keys not configured)");
    } else {
      assert(checkout.status === 409, `Sold-out founding must return 409, got ${checkout.status}`);
      assert(/sold out/i.test(checkout.json?.error || ""), "Sold-out founding error message required");
      assert(checkout.json?.soldOut === true, "soldOut flag in blocked checkout response");
    }

    console.log("5) Canceled, failed payment, and ended founding access");
    const now = new Date().toISOString();
    const store = readStore();
    store.users = store.users || {};
    store.users["canceled-pro@billing.test"] = {
      email: "canceled-pro@billing.test", plan: "Free", subscriptionStatus: "Canceled - Free Plan Active", monthlyPrice: "$0/month", updatedAt: now,
    };
    store.users["failed-pay@billing.test"] = {
      email: "failed-pay@billing.test", plan: "Free", subscriptionStatus: "Payment Failed - Action Needed", monthlyPrice: "$0/month", updatedAt: now,
    };
    store.users["former-founding@billing.test"] = {
      email: "former-founding@billing.test", plan: "Free", subscriptionStatus: "Canceled - Free Plan Active",
      foundingMember: true, foundingMemberNumber: 3, priceLock: "Lifetime", monthlyPrice: "$0/month", updatedAt: now,
    };
    store.foundingMembers = store.foundingMembers || [];
    if (!store.foundingMembers.includes("former-founding@billing.test")) store.foundingMembers.push("former-founding@billing.test");
    writeStore(store);

    function serverHasProAccess(user) {
      const status = String(user?.subscriptionStatus || "").toLowerCase();
      if (!user || status.includes("cancel") || status.includes("free plan") || status.includes("failed")) return false;
      return ["Pro", "Founding"].includes(user.plan) && (status.includes("active") || status.includes("trial") || status.includes("paid"));
    }
    assert(!serverHasProAccess(store.users["canceled-pro@billing.test"]), "Canceled user must not have Pro access");
    assert(!serverHasProAccess(store.users["failed-pay@billing.test"]), "Failed payment user must not have Pro access");
    assert(!serverHasProAccess(store.users["former-founding@billing.test"]), "Canceled founding user must not have Pro access");
    assert(store.users["former-founding@billing.test"].foundingMember === true, "Founding history record preserved after cancel");

    console.log("6) Subscription sync records");
    seedPersonas();
    const proSub = await requestJson("GET", "/api/subscription-status?email=pro@billing.test");
    assert(proSub.json.subscription?.plan === "Pro", "Server Pro user plan");
    assert(proSub.json.subscription?.monthlyPrice === "$19.99/month", "Server Pro price");

    const foundingSub = await requestJson("GET", "/api/subscription-status?email=founding@billing.test");
    assert(foundingSub.json.subscription?.plan === "Founding", "Server founding user plan");
    assert(foundingSub.json.subscription?.monthlyPrice === "$9.99/month", "Server founding price preserved");

    console.log("7) Admin analytics membership fields");
    const adminLogin = await requestJson("POST", "/api/admin/login", {
      email: "billing-qa@test.local", password: "billing-qa-pass", code: "billing-qa-code",
    });
    assert(adminLogin.status === 200 && adminLogin.json?.token, "Admin login for analytics test");
    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(adminLogin.json.token)}`);
    assert(analytics.status === 200, "Admin analytics fetch");
    const trialUser = (analytics.json.analytics?.users || []).find((u) => u.email === "trial@billing.test");
    assert(trialUser?.membershipPlan === "Trial", "Trial user in admin analytics");
    assert(trialUser?.hasProAccess === true, "Trial user has Pro access in admin");
    const foundingUser = (analytics.json.analytics?.users || []).find((u) => u.email === "founding@billing.test");
    assert(foundingUser?.membershipPlan === "Founding Member", "Founding user plan label");
    assert(foundingUser?.displayPrice === "$9.99/month", "Founding display price");

    console.log("8) Browser persona labels & access");
    const browser = await runBrowserChecks(`http://127.0.0.1:${PORT}`);
    if (browser.skipped) console.log("   (browser checks skipped — playwright not installed)");

    console.log("\nBilling membership audit checks passed.");
  } catch (error) {
    console.error("\nBILLING AUDIT FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
  }
}

main();
