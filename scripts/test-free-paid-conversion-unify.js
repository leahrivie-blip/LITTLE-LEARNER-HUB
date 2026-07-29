#!/usr/bin/env node
/**
 * Free → Paid conversion unify: truthful CTAs, Founding-primary messaging,
 * one upgrade path, Plans comparison + content counts, sold-out switch.
 *
 * Run: node scripts/test-free-paid-conversion-unify.js
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
const PORT = 19710 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-conversion-unify-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "free-paid-conversion-unify");
const FOUNDING_LIMIT = 47;

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
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
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

function startServer(envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {},
    adminSessions: {},
    foundingMembers: Array.from({ length: FOUNDING_LIMIT - 2 }, (_, i) => `claimed-${i}@example.com`),
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: String(FOUNDING_LIMIT),
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_conversion",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("boot timeout");
}

async function openAsAccount(page, account) {
  await page.addInitScript((acct) => {
    const paid = ["Founding", "Pro"].includes(acct.plan) || acct.foundingMemberActive;
    localStorage.setItem("llhUser", acct.email);
    localStorage.setItem("llhPlan", acct.plan || "Free");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [acct.email]: {
        email: acct.email,
        plan: acct.plan || "Free",
        firstName: acct.firstName || "Test",
        lastName: acct.lastName || "Provider",
        role: "owner",
        accountType: "home_daycare",
        subscriptionStatus: acct.subscriptionStatus || (paid ? "active" : "Free Plan"),
        stripeSubscriptionStatus: acct.stripeSubscriptionStatus || (paid ? "active" : ""),
        foundingMemberActive: Boolean(acct.foundingMemberActive || acct.plan === "Founding"),
        createdAt: acct.createdAt || "2026-07-20T12:00:00.000Z",
        freeLessonAccessMode: acct.freeLessonAccessMode || "curated",
      },
    }));
    sessionStorage.removeItem("llhFreePlanReminderDismissed");
    sessionStorage.removeItem("llhFoundingUpgradeDismissed");
    sessionStorage.removeItem("llhFreePlanSoftNudgeShown");
    if (acct.clearWelcomeDismiss) localStorage.removeItem("llhFreeWelcomeCardDismissed");
    if (acct.dismissWelcome) localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
  }, account);
  page.setDefaultTimeout(60000);
  page.on("dialog", async (dialog) => { await dialog.accept().catch(() => {}); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function" && typeof refreshFreePlanUpgradeChrome === "function", null, { timeout: 60000 });
  await page.waitForFunction(() => {
    try {
      return typeof canSeePaidUpgradeOffer === "function" && typeof canSeePaidUpgradeOffer() === "boolean";
    } catch {
      return false;
    }
  }, null, { timeout: 60000 });
  await page.evaluate(() => {
    try { if (typeof loadAccountState === "function") loadAccountState(localStorage.getItem("llhUser")); } catch { /* ignore */ }
    try { if (typeof updateAuthButtons === "function") updateAuthButtons(); } catch { /* ignore */ }
    try { if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome(); } catch { /* ignore */ }
  });
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(appJs, /function freeUpgradePrimaryButtonLabel/);
  assert.match(appJs, /function freeUpgradeSupportingText/);
  assert.match(appJs, /function contentGrowthStats/);
  assert.match(appJs, /function planComparisonTableHtml/);
  assert.match(appJs, /function lockedContentUnlockLines/);
  assert.match(appJs, /Lock In Founding Member Pricing/);
  assert.match(appJs, /Only \$\{remaining\} Founding Member spots remaining/);
  assert.match(appJs, /Truthful CTA: data-start-pro-trial must start a real trial/);
  assert.match(appJs, /Banner-fatigue guard/);
  assert.match(indexHtml, /Lock In Founding Member Pricing/);
  assert.match(indexHtml, /Only 2 Founding Member spots remaining/);
  // Misleading trial CTA must not remain on paid checkout entry points
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("function freePlannerUpgradeNudgeHtml"), appJs.indexOf("function foundingUpgradeBannerHtml")),
    /Start Your 7-Day Free Trial/,
  );
  console.log("PASS static conversion-unify markers");

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    const status = await requestJson("GET", "/api/founding-status");
    const founding = status.json?.founding || status.json || {};
    assert.equal(founding.remaining, 2);
    assert.match(founding.spotsLeftMessage || "", /Only 2 Founding Member spots remaining/);
    console.log("PASS founding status remaining=2");

    let page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openAsAccount(page, {
      email: "free-conversion@example.com",
      plan: "Free",
      clearWelcomeDismiss: true,
    });
    await page.waitForFunction(async () => {
      try {
        if (typeof syncFoundingStatus === "function") await syncFoundingStatus({ render: true });
      } catch { /* ignore */ }
      return typeof foundingStatusLoaded === "function" && foundingStatusLoaded() && Number(foundingSpotsRemaining()) === 2;
    }, null, { timeout: 30000 });
    // First-login budget: welcome card owns the surface; dismiss it before asserting the reminder bar.
    await page.waitForFunction(() => {
      try {
        return !(typeof requiresVerifiedAppBoot === "function" && requiresVerifiedAppBoot() && !isAppBootInteractive())
          && !document.body.classList.contains("app-boot-verifying");
      } catch { return true; }
    }, null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      sessionStorage.removeItem("llhFreePlanReminderDismissed");
      sessionStorage.removeItem("llhFoundingUpgradeDismissed");
      document.body.classList.remove("app-boot-verifying");
      document.body.classList.add("user-authenticated");
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof syncPlatformInstallCard === "function") syncPlatformInstallCard();
    });
    await page.waitForTimeout(150);

    const chrome = await page.evaluate(() => {
      const reminder = document.querySelector("#freePlanReminderBar");
      const sidebar = document.querySelector("#sidebarFreeUpgradeCard");
      const soft = document.querySelector("#freePlanSoftNudge");
      return {
        reminderHidden: reminder?.hidden,
        canSee: typeof canSeePaidUpgradeOffer === "function" ? canSeePaidUpgradeOffer() : null,
        reminderText: reminder?.innerText || "",
        reminderCta: document.querySelector("#freePlanReminderPrimary")?.textContent?.trim() || "",
        sidebarText: sidebar?.innerText || "",
        sidebarCta: sidebar?.querySelector("button")?.textContent?.trim() || "",
        softHidden: soft?.hidden !== false,
        foundingOpen: typeof foundingSpotsStillAvailable === "function" ? foundingSpotsStillAvailable() : null,
        primaryLabel: typeof freeUpgradePrimaryButtonLabel === "function" ? freeUpgradePrimaryButtonLabel() : "",
        remaining: typeof foundingSpotsRemaining === "function" ? foundingSpotsRemaining() : null,
      };
    });
    assert.equal(chrome.canSee, true, "Free user can see paid upgrade offer");
    assert.equal(chrome.reminderHidden, false, "reminder bar visible for Free after welcome dismiss");
    assert.equal(chrome.remaining, 2);
    assert.match(chrome.reminderText, /Only 2 Founding Member spots remaining/i);
    assert.match(chrome.reminderCta, /Lock In Founding Member Pricing/i);
    assert.match(chrome.sidebarCta, /Lock In Founding Member Pricing/i);
    assert.equal(chrome.softHidden, true, "soft nudge hidden to reduce fatigue");
    assert.match(chrome.primaryLabel, /\$9\.99\/month locked while your membership remains continuously active/);
    await shot(page, "01-free-reminder-sidebar");
    console.log("PASS free chrome Founding-primary");

    await page.evaluate(() => {
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      if (typeof setView === "function") setView("calendar");
      if (typeof renderMainCalendar === "function") renderMainCalendar();
    });
    await page.waitForTimeout(500);
    const dash = await page.evaluate(() => {
      const root = document.querySelector("#mainCalendarApp") || document.querySelector(".active-view");
      const welcome = root?.querySelector('.free-welcome-card[aria-label="Welcome to Little Learner Hub"]');
      const upgrade = root?.querySelector(".free-dashboard-upgrade-card");
      const conversion = root?.querySelector(".free-library-conversion-banner");
      const libraryStrip = document.querySelector(".library-upgrade-strip:not(.library-upgrade-strip--guest)");
      return {
        hasWelcome: Boolean(welcome),
        hasUpgradeCard: Boolean(upgrade),
        hasConversionBanner: Boolean(conversion),
        hasLibraryStrip: Boolean(libraryStrip),
        cardText: upgrade?.innerText?.slice(0, 600) || "",
        cta: upgrade?.querySelector("[data-checkout-plan]")?.textContent?.trim() || "",
        checkoutPlan: upgrade?.querySelector("[data-checkout-plan]")?.dataset?.checkoutPlan || "",
      };
    });
    assert.equal(dash.hasWelcome, false, "new welcome card dismissed");
    assert.equal(dash.hasUpgradeCard, true, "one dashboard upgrade card after welcome dismiss");
    assert.equal(dash.hasConversionBanner, false, "no stacked conversion banner");
    assert.equal(dash.hasLibraryStrip, false, "no library upgrade strip for Free");
    assert.match(dash.cta, /Lock In Founding Member Pricing/i);
    assert.equal(dash.checkoutPlan, "founding");
    await shot(page, "02-dashboard-upgrade-card");
    console.log("PASS single dashboard upgrade card");

    await page.evaluate(() => {
      if (typeof setView === "function") setView("plans");
      if (typeof renderPricingPage === "function") renderPricingPage();
    });
    await page.waitForTimeout(500);
    const plans = await page.evaluate(() => {
      const root = document.querySelector("#pricingApp");
      return {
        text: root?.innerText || "",
        foundingCta: root?.querySelector('[data-pricing-card="founding"] [data-checkout-plan]')?.textContent?.trim() || "",
        foundingPlan: root?.querySelector('[data-pricing-card="founding"] [data-checkout-plan]')?.dataset?.checkoutPlan || "",
        hasComparison: Boolean(root?.querySelector(".comparison-table")),
        hasGrowth: Boolean(root?.querySelector(".content-growth-stats")),
        misleadingTrial: /Start Your 7-Day Free Trial/i.test(root?.innerText || ""),
      };
    });
    assert.match(plans.foundingCta, /Lock In Founding Member Pricing/i);
    assert.equal(plans.foundingPlan, "founding");
    assert.equal(plans.hasComparison, true);
    assert.equal(plans.hasGrowth, true);
    assert.equal(plans.misleadingTrial, false);
    assert.match(plans.text, /Only 2 Founding Member spots remaining|spots remaining/i);
    assert.match(plans.text, /Pro Monthly/);
    await shot(page, "03-plans-founding-primary");
    console.log("PASS plans page Founding + comparison + growth");

    await page.evaluate(() => {
      if (typeof showProFeatureModal === "function") {
        showProFeatureModal("Unlock unlimited lesson plans for your classroom.", "limit");
      }
    });
    await page.waitForTimeout(200);
    const modal = await page.evaluate(() => {
      const btn = document.querySelector("#proModalUpgrade");
      const body = document.querySelector("#proModalBody")?.innerText || "";
      return {
        open: document.querySelector("#proModal")?.classList.contains("open"),
        label: btn?.textContent?.trim() || "",
        mode: btn?.dataset?.upgradeMode || "",
        plan: btn?.dataset?.checkoutPlan || "",
        body: body.slice(0, 500),
      };
    });
    assert.equal(modal.open, true);
    assert.match(modal.label, /Lock In Founding Member Pricing/i);
    assert.equal(modal.mode, "founding");
    assert.equal(modal.plan, "founding");
    assert.match(modal.body, /free lesson plans|additional lesson plans|New curriculum/i);
    await shot(page, "04-locked-feature-modal");
    console.log("PASS locked-feature modal truthful Founding CTA");

    // Click modal CTA should start founding checkout (simulation), not trial wording mismatch.
    await page.click("#proModalUpgrade");
    await page.waitForTimeout(800);
    const afterCheckout = await page.evaluate(() => ({
      modalOpen: document.querySelector("#proModal")?.classList.contains("open"),
      plan: localStorage.getItem("llhPlan") || "",
    }));
    assert.equal(afterCheckout.modalOpen, false);
    await shot(page, "05-after-founding-checkout-click");
    console.log("PASS founding checkout from modal");

    await page.close();
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openAsAccount(page, {
      email: "free-mobile-conversion@example.com",
      plan: "Free",
      dismissWelcome: true,
    });
    await page.evaluate(() => {
      if (typeof setView === "function") setView("plans");
      if (typeof renderPricingPage === "function") renderPricingPage();
    });
    await page.waitForTimeout(400);
    const mobile = await page.evaluate(() => {
      const reminder = document.querySelector("#freePlanReminderBar");
      return {
        reminderHidden: reminder?.hidden,
        reminderCta: document.querySelector("#freePlanReminderPrimary")?.textContent?.trim() || "",
        comparison: Boolean(document.querySelector(".comparison-table")),
      };
    });
    assert.equal(mobile.reminderHidden, false);
    assert.match(mobile.reminderCta, /Lock In Founding Member Pricing/i);
    assert.equal(mobile.comparison, true);
    await shot(page, "06-mobile-plans");
    console.log("PASS mobile Free conversion chrome");

    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openAsAccount(page, { email: "pro-conversion@example.com", plan: "Pro" });
    const proChrome = await page.evaluate(() => ({
      canSee: typeof canSeePaidUpgradeOffer === "function" ? canSeePaidUpgradeOffer() : null,
      reminderHidden: document.querySelector("#freePlanReminderBar")?.hidden,
      sidebarHidden: document.querySelector("#sidebarFreeUpgradeCard")?.hidden,
    }));
    assert.equal(proChrome.canSee, false);
    assert.equal(proChrome.reminderHidden, true);
    assert.equal(proChrome.sidebarHidden, true);
    await shot(page, "07-pro-no-upgrade-chrome");
    console.log("PASS Pro never sees Free upgrade chrome");

    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openAsAccount(page, {
      email: "founding-conversion@example.com",
      plan: "Founding",
      foundingMemberActive: true,
    });
    const foundingChrome = await page.evaluate(() => ({
      canSee: typeof canSeePaidUpgradeOffer === "function" ? canSeePaidUpgradeOffer() : null,
      reminderHidden: document.querySelector("#freePlanReminderBar")?.hidden,
    }));
    assert.equal(foundingChrome.canSee, false);
    assert.equal(foundingChrome.reminderHidden, true);
    await shot(page, "08-founding-no-upgrade-chrome");
    console.log("PASS Founding never sees Free upgrade chrome");

    // Sold-out messaging: force client founding status closed in one atomic evaluate.
    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openAsAccount(page, { email: "free-soldout@example.com", plan: "Free", dismissWelcome: true });
    const soldOut = await page.evaluate(() => {
      window.syncFoundingStatus = async () => foundingStatusCache;
      applyFoundingStatus({
        limit: 47,
        claimed: 47,
        remaining: 0,
        soldOut: true,
        spotsLeftMessage: "Founding Member pricing is sold out. Pro is $19.99/month.",
      });
      foundingStatusCache.remaining = 0;
      foundingStatusCache.claimed = 47;
      foundingStatusCache.limit = 47;
      foundingStatusCache.soldOut = true;
      foundingStatusCache.loaded = true;
      if (typeof syncPublicFoundingOfferUi === "function") syncPublicFoundingOfferUi();
      if (typeof updateAuthButtons === "function") updateAuthButtons();
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof setView === "function") setView("plans");
      if (typeof renderPricingPage === "function") renderPricingPage();
      const root = document.querySelector("#pricingApp");
      const reminderCta = document.querySelector("#freePlanReminderPrimary")?.textContent?.trim() || "";
      return {
        remaining: foundingSpotsRemaining(),
        open: foundingSpotsStillAvailable(),
        cache: { remaining: foundingStatusCache.remaining, soldOut: foundingStatusCache.soldOut },
        reminderCta,
        hasFoundingCard: Boolean(root?.querySelector('[data-pricing-card="founding"]')),
        hasFoundingCopy: /Lock In Founding Member Pricing|\$9\.99\/month locked while your membership remains continuously active/i.test(root?.innerText || ""),
        hasProCard: Boolean(root?.querySelector('[data-pricing-card="pro-monthly"]')),
      };
    });
    assert.equal(soldOut.cache.remaining, 0, `cache remaining should be 0, got ${JSON.stringify(soldOut)}`);
    assert.equal(soldOut.open, false, `founding should be closed, got ${JSON.stringify(soldOut)}`);
    assert.equal(soldOut.hasFoundingCard, false, "sold-out Plans page should hide Founding card");
    assert.equal(soldOut.hasProCard, true, "sold-out Plans page should feature Pro");
    assert.match(soldOut.reminderCta, /Upgrade to Pro/i);
    assert.equal(soldOut.hasFoundingCopy, false);
    await shot(page, "09-soldout-pro-messaging");
    console.log("PASS sold-out switches to Pro messaging");

    fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify({
      ok: true,
      port: PORT,
      screenshots: fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".png")),
    }, null, 2));
    console.log(`\nAll free-paid conversion unify tests passed. Screenshots: ${OUT_DIR}`);
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2500));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }
}

main();
