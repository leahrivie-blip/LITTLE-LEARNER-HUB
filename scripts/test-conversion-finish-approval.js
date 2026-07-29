#!/usr/bin/env node
/**
 * Conversion finish approval gates (no merge/deploy):
 * - continuous-active pricing language (no "for life")
 * - founding limit leaves exactly 2 spots from live claimed baseline
 * - collections loading suppression
 * - first-login overlay budget
 * - guest homepage + Free upgrade + sold-out + mobile
 * - Stripe planConfig price mapping ($9.99 founding / $19.99 pro)
 *
 * Run: node scripts/test-conversion-finish-approval.js
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
const PORT = 19770 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-conversion-finish-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "conversion-finish-approval");
const LIVE_CLAIMED = 45; // read from production founding-status before this run
const FOUNDING_LIMIT = LIVE_CLAIMED + 2; // exactly 2 spots remaining

function requestJson(method, urlPath, body, port = PORT) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
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

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {},
    adminSessions: {},
    foundingMembers: Array.from({ length: LIVE_CLAIMED }, (_, i) => `claimed-${i}@example.com`),
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
      STRIPE_SECRET_KEY: "sk_test_simulation_finish",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
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

async function openAs(page, account = {}) {
  await page.addInitScript((acct) => {
    if (!acct.email) return;
    const paid = ["Founding", "Pro"].includes(acct.plan) || acct.foundingMemberActive;
    localStorage.setItem("llhUser", acct.email);
    localStorage.setItem("llhPlan", acct.plan || "Free");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [acct.email]: {
        email: acct.email,
        plan: acct.plan || "Free",
        firstName: "Test",
        lastName: "Provider",
        role: "owner",
        accountType: "home_daycare",
        subscriptionStatus: paid ? "active" : "Free Plan",
        stripeSubscriptionStatus: paid ? "active" : "",
        foundingMemberActive: Boolean(acct.foundingMemberActive || acct.plan === "Founding"),
        createdAt: "2026-07-20T12:00:00.000Z",
        freeLessonAccessMode: "curated",
      },
    }));
    sessionStorage.removeItem("llhFreePlanReminderDismissed");
    sessionStorage.removeItem("llhFoundingUpgradeDismissed");
    if (acct.dismissWelcome) localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
    else localStorage.removeItem("llhFreeWelcomeCardDismissed");
  }, account);
  page.on("dialog", async (dialog) => { await dialog.accept().catch(() => {}); });
  page.setDefaultTimeout(60000);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
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
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const renderYaml = fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8");

  assert.doesNotMatch(appJs, /\$9\.99\/month for life/i);
  assert.doesNotMatch(indexHtml, /\$9\.99\/month for life/i);
  assert.match(appJs, /\$9\.99\/month locked while your membership remains continuously active/);
  assert.match(serverJs, /FOUNDING_CLOSEOUT_LIMIT = 47/);
  assert.match(renderYaml, /FOUNDING_MEMBER_LIMIT[\s\S]*value:\s*"47"/);
  assert.match(appJs, /const foundingMemberLimit = 47/);
  assert.match(appJs, /Collections loading|libraryLoading && !stats\.totalCollections/);
  assert.match(appJs, /welcomeActive/);
  assert.match(appJs, /body\.app-boot-verifying/);
  assert.match(serverJs, /priceEnv: "STRIPE_PRICE_FOUNDING_MONTHLY"/);
  assert.match(serverJs, /amount: "\$9\.99\/month"/);
  assert.match(serverJs, /priceEnv: "STRIPE_PRICE_PRO_MONTHLY"/);
  assert.match(serverJs, /amount: "\$19\.99\/month"/);
  console.log("PASS static finish markers + Stripe planConfig mapping");

  // Live recount confirmation (read-only)
  const live = await new Promise((resolve, reject) => {
    http.get("https://littlelearnershubbyleah.com/api/founding-status", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
  const founding = live.founding || live;
  console.log("LIVE founding status:", JSON.stringify(founding));
  assert.equal(Number(founding.claimed), LIVE_CLAIMED, `expected live claimed ${LIVE_CLAIMED}`);
  assert.equal(FOUNDING_LIMIT, LIVE_CLAIMED + 2);

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    const status = await requestJson("GET", "/api/founding-status");
    const localFounding = status.json?.founding || status.json || {};
    assert.equal(localFounding.claimed, LIVE_CLAIMED);
    assert.equal(localFounding.limit, FOUNDING_LIMIT);
    assert.equal(localFounding.remaining, 2);
    assert.match(localFounding.spotsLeftMessage || "", /Only 2 Founding Member spots remaining/);
    console.log("PASS local founding limit leaves exactly 2 spots", localFounding);

    const readiness = await requestJson("GET", "/api/stripe-readiness");
    assert.equal(readiness.json?.stripe?.prices?.founding, "price_sim_founding_monthly");
    assert.equal(readiness.json?.stripe?.prices?.monthly, "price_sim_pro_monthly");
    console.log("PASS checkout plan keys map founding→STRIPE_PRICE_FOUNDING_MONTHLY and monthly→STRIPE_PRICE_PRO_MONTHLY");

    let page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // Guest homepage founding urgency
    await openAs(page, {});
    await page.waitForFunction(async () => {
      try { if (typeof syncFoundingStatus === "function") await syncFoundingStatus({ render: true }); } catch { /* ignore */ }
      return typeof foundingStatusLoaded === "function" && foundingStatusLoaded();
    }, null, { timeout: 30000 });
    await page.evaluate(() => {
      if (typeof syncPublicFoundingOfferUi === "function") syncPublicFoundingOfferUi();
    });
    const guest = await page.evaluate(() => {
      const announce = document.querySelector("#llhFoundingAnnounceBanner")?.innerText || "";
      const hero = document.querySelector(".llh-hero-support")?.innerText || "";
      const pricing = document.querySelector("#homePricing, .llh-founding-card")?.innerText || "";
      return {
        remaining: foundingSpotsRemaining(),
        announce,
        hero,
        pricing,
        forLife: /for life/i.test(`${announce}\n${hero}\n${pricing}`),
      };
    });
    assert.equal(guest.remaining, 2);
    assert.match(`${guest.announce}\n${guest.hero}\n${guest.pricing}`, /Only 2 Founding Member spots remaining|2 spots/i);
    assert.equal(guest.forLife, false);
    await shot(page, "01-guest-homepage-founding");
    console.log("PASS guest homepage Founding count");

    // Signed-in Free first-login overlay budget
    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openAs(page, { email: "finish-free@example.com", plan: "Free" });
    await page.waitForFunction(() => typeof canSeePaidUpgradeOffer === "function", null, { timeout: 30000 });
    const firstLogin = await page.evaluate(() => {
      document.body.classList.add("app-boot-verifying");
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof syncPlatformInstallCard === "function") syncPlatformInstallCard();
      const reminderDuringBoot = !document.querySelector("#freePlanReminderBar")?.hidden;
      const installDuringBoot = Boolean(document.querySelector("#platformInstallCardHost")?.innerHTML?.trim());
      document.body.classList.remove("app-boot-verifying");
      localStorage.removeItem("llhFreeWelcomeCardDismissed");
      sessionStorage.removeItem("llhFreePlanReminderDismissed");
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof setView === "function") setView("calendar");
      if (typeof renderMainCalendar === "function") renderMainCalendar();
      if (typeof syncPlatformInstallCard === "function") syncPlatformInstallCard();
      const welcome = Boolean(document.querySelector(".free-welcome-card"));
      const reminderWithWelcome = !document.querySelector("#freePlanReminderBar")?.hidden;
      const installWithWelcome = Boolean(document.querySelector("#platformInstallCardHost")?.innerHTML?.trim()
        || document.querySelector(".dashboard-install-card, .platform-install-card"));
      return {
        reminderDuringBoot,
        installDuringBoot,
        welcome,
        reminderWithWelcome,
        installWithWelcome,
      };
    });
    assert.equal(firstLogin.reminderDuringBoot, false, "reminder hidden during boot verification");
    assert.equal(firstLogin.installDuringBoot, false, "install card hidden during boot verification");
    assert.equal(firstLogin.welcome, true, "welcome card shows on first login");
    assert.equal(firstLogin.reminderWithWelcome, false, "reminder hidden while welcome card owns surface");
    assert.equal(firstLogin.installWithWelcome, false, "install card hidden while welcome/reminder budget active");
    await shot(page, "02-first-login-welcome-no-stack");
    console.log("PASS first-login overlay budget");

    // After welcome dismiss: reminder can show, install still suppressed
    await page.evaluate(() => {
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      sessionStorage.removeItem("llhFreePlanReminderDismissed");
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof renderMainCalendar === "function") renderMainCalendar();
      if (typeof syncPlatformInstallCard === "function") syncPlatformInstallCard();
    });
    const afterWelcome = await page.evaluate(() => ({
      reminder: !document.querySelector("#freePlanReminderBar")?.hidden,
      install: Boolean(document.querySelector("#platformInstallCardHost")?.innerHTML?.trim()),
      upgradeCard: Boolean(document.querySelector(".free-dashboard-upgrade-card, .free-welcome-card")),
      cta: document.querySelector("#freePlanReminderPrimary")?.textContent?.trim() || "",
      label: typeof freeUpgradePrimaryButtonLabel === "function" ? freeUpgradePrimaryButtonLabel() : "",
    }));
    assert.equal(afterWelcome.reminder, true);
    assert.equal(afterWelcome.install, false);
    assert.match(afterWelcome.cta + afterWelcome.label, /Lock In Founding Member Pricing/i);
    assert.match(afterWelcome.label, /locked while your membership remains continuously active/i);
    await shot(page, "03-free-reminder-after-welcome");
    console.log("PASS Free upgrade flow after welcome");

    // Plans + collections loading suppression + checkout selection
    await page.evaluate(() => {
      curriculumLibraryLoading = true;
      if (typeof setView === "function") setView("plans");
      if (typeof renderPricingPage === "function") renderPricingPage();
    });
    const plansLoading = await page.evaluate(() => {
      const root = document.querySelector("#pricingApp");
      const collections = [...(root?.querySelectorAll(".content-growth-stat") || [])]
        .map((n) => n.innerText)
        .find((t) => /collection/i.test(t)) || "";
      return {
        collections,
        foundingPlan: root?.querySelector('[data-pricing-card="founding"] [data-checkout-plan]')?.dataset?.checkoutPlan || "",
        foundingCta: root?.querySelector('[data-pricing-card="founding"] [data-checkout-plan]')?.textContent?.trim() || "",
        forLife: /for life/i.test(root?.innerText || ""),
        zeroCollections: /(?:^|\n)0\nCurriculum collections/i.test(root?.innerText || ""),
      };
    });
    assert.equal(plansLoading.foundingPlan, "founding");
    assert.match(plansLoading.foundingCta, /Lock In Founding Member Pricing/i);
    assert.equal(plansLoading.forLife, false);
    assert.equal(plansLoading.zeroCollections, false);
    assert.match(plansLoading.collections, /—|loading|Collections loading/i);
    await shot(page, "04-plans-collections-loading");
    console.log("PASS Plans checkout selection + collections loading suppressed");

    await page.evaluate(() => {
      curriculumLibraryLoading = false;
      if (typeof renderPricingPage === "function") renderPricingPage();
    });
    await shot(page, "05-plans-founding-primary");

    // Checkout click founding
    page.once("dialog", async (dialog) => { await dialog.accept().catch(() => {}); });
    await page.click('[data-pricing-card="founding"] [data-checkout-plan="founding"]');
    await page.waitForTimeout(700);
    await shot(page, "06-founding-checkout-click");
    console.log("PASS founding checkout selection");

    // Sold-out transition
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
      foundingStatusCache.soldOut = true;
      foundingStatusCache.loaded = true;
      if (typeof syncPublicFoundingOfferUi === "function") syncPublicFoundingOfferUi();
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof updateAuthButtons === "function") updateAuthButtons();
      if (typeof renderPricingPage === "function") renderPricingPage();
      const root = document.querySelector("#pricingApp");
      return {
        remaining: foundingSpotsRemaining(),
        open: foundingSpotsStillAvailable(),
        hasFoundingCard: Boolean(root?.querySelector('[data-pricing-card="founding"]')),
        hasProCard: Boolean(root?.querySelector('[data-pricing-card="pro-monthly"]')),
        forLife: /for life/i.test(root?.innerText || ""),
        reminderCta: document.querySelector("#freePlanReminderPrimary")?.textContent?.trim() || "",
      };
    });
    assert.equal(soldOut.remaining, 0);
    assert.equal(soldOut.open, false);
    assert.equal(soldOut.hasFoundingCard, false);
    assert.equal(soldOut.hasProCard, true);
    assert.equal(soldOut.forLife, false);
    assert.match(soldOut.reminderCta, /Upgrade to Pro/i);
    await shot(page, "07-soldout-pro-messaging");
    console.log("PASS sold-out transition");

    // Mobile layout
    await page.close();
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openAs(page, { email: "finish-mobile@example.com", plan: "Free", dismissWelcome: true });
    await page.waitForFunction(async () => {
      try { if (typeof syncFoundingStatus === "function") await syncFoundingStatus({ render: true }); } catch { /* ignore */ }
      return typeof foundingStatusLoaded === "function" && foundingStatusLoaded();
    }, null, { timeout: 30000 });
    await page.evaluate(() => {
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof setView === "function") setView("plans");
      if (typeof renderPricingPage === "function") renderPricingPage();
    });
    const mobile = await page.evaluate(() => {
      const reminder = document.querySelector("#freePlanReminderBar");
      const box = reminder?.getBoundingClientRect();
      return {
        reminderHidden: reminder?.hidden,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        widthOk: !box || box.width <= 390,
        hasComparison: Boolean(document.querySelector(".comparison-table")),
      };
    });
    assert.equal(mobile.reminderHidden, false);
    assert.equal(mobile.overflow, false);
    assert.equal(mobile.widthOk, true);
    assert.equal(mobile.hasComparison, true);
    await shot(page, "08-mobile-plans");
    console.log("PASS mobile layout");

    fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify({
      ok: true,
      liveClaimed: LIVE_CLAIMED,
      foundingLimit: FOUNDING_LIMIT,
      remainingTarget: 2,
      stripeMapping: {
        founding: { env: "STRIPE_PRICE_FOUNDING_MONTHLY", amount: "$9.99/month" },
        monthly: { env: "STRIPE_PRICE_PRO_MONTHLY", amount: "$19.99/month" },
        note: "Live unit_amount verification requires Stripe MCP auth in Cursor desktop; code + readiness mapping confirmed.",
      },
      screenshots: fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".png")),
    }, null, 2));
    console.log(`\nAll conversion finish approval checks passed. Screenshots: ${OUT_DIR}`);
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
