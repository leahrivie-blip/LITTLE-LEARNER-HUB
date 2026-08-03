#!/usr/bin/env node
/**
 * Free-user upgrade experience: persistent reminder, value messaging, and
 * Pro/Founding/Admin never seeing Free upgrade chrome.
 * Run: node scripts/test-free-user-upgrade-experience.js
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
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-free-upgrade-${crypto.randomBytes(4).toString("hex")}.json`);

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

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
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
        createdAt: acct.createdAt || "",
        freeLessonAccessMode: acct.freeLessonAccessMode || "",
      },
    }));
    sessionStorage.removeItem("llhFreePlanReminderDismissed");
    sessionStorage.removeItem("llhFoundingUpgradeDismissed");
    sessionStorage.removeItem("llhFreePlanSoftNudgeShown");
    if (acct.clearWelcomeDismiss) localStorage.removeItem("llhFreeWelcomeCardDismissed");
  }, account);
  page.setDefaultTimeout(60000);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function" && typeof renderUserDashboard === "function", null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    try {
      if (typeof loadAccountState === "function") loadAccountState(localStorage.getItem("llhUser"));
    } catch { /* ignore early-boot race */ }
    try {
      if (typeof updateAuthButtons === "function") updateAuthButtons();
    } catch { /* ignore early-boot race */ }
    try {
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
    } catch { /* ignore early-boot race */ }
    if (typeof setView === "function") setView("home");
  });
  await page.waitForTimeout(400);
  // Retry chrome refresh once capabilities are definitely live.
  await page.waitForFunction(() => {
    try {
      return typeof canSeePaidUpgradeOffer === "function" && typeof canSeePaidUpgradeOffer() === "boolean";
    } catch {
      return false;
    }
  }, null, { timeout: 60000 });
  await page.evaluate(() => {
    if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
  });
}

async function chromeState(page) {
  return page.evaluate(() => {
    const badge = document.querySelector("#freePlanBadge");
    const reminder = document.querySelector("#freePlanReminderBar");
    const sidebar = document.querySelector("#sidebarFreeUpgradeCard");
    const signup = document.querySelector("#signupButton");
    const reminderBox = reminder?.getBoundingClientRect();
    return {
      canSee: typeof canSeePaidUpgradeOffer === "function" ? canSeePaidUpgradeOffer() : null,
      isPro: typeof isProUser === "function" ? isProUser() : null,
      badgeHidden: badge?.hidden,
      reminderHidden: reminder?.hidden,
      sidebarHidden: sidebar?.hidden,
      signupText: signup?.textContent?.trim() || "",
      bodyFreeUpgrade: document.body.classList.contains("user-free-upgrade"),
      bodyPro: document.body.classList.contains("user-pro"),
      reminderOverlapsTopbar: reminder && !reminder.hidden
        ? (() => {
          const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
          if (!topbar || !reminderBox) return false;
          return reminderBox.top < topbar.bottom - 2 && reminderBox.bottom > topbar.top + 2;
        })()
        : false,
    };
  });
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(appJs, /function refreshFreePlanUpgradeChrome/);
  assert.match(appJs, /function maybeShowFreePlanSoftNudge/);
  assert.match(appJs, /Ready for the full lesson plan library\?|Lock In Founding Member Pricing/);
  assert.match(appJs, /This is included in Pro|freeWelcomeCardHtml/);
  assert.match(appJs, /freeWelcomeCardHtml/);
  assert.match(appJs, /freeCalendarPlanningDays\s*=\s*30/);
  assert.match(appJs, /freeFavoriteLimit\s*=\s*20/);
  assert.match(appJs, /freeChildProfileLimit\s*=\s*5/);
  assert.match(css, /\.free-plan-reminder/);
  assert.match(css, /\.free-plan-badge/);
  assert.match(css, /\.free-starter-explore|\.free-welcome-card/);
  assert.match(css, /body\.user-pro \.free-plan-badge/);
  assert.match(indexHtml, /id="freePlanReminderBar"/);
  assert.match(indexHtml, /id="freePlanBadge"/);
  assert.match(indexHtml, /id="sidebarFreeUpgradeCard"/);
  assert.match(indexHtml, /id="newUserOnboardingModal"/);
  console.log("PASS static free-upgrade markers");

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    await openAsAccount(page, { email: "free-upgrade-ux@example.com", plan: "Free" });
    let state = await chromeState(page);
    assert.equal(state.canSee, true, "free owner should see paid upgrade offer");
    assert.equal(state.isPro, false);
    assert.equal(state.badgeHidden, false, "Free Plan badge should show");
    // Reminder may stay hidden while the first-login welcome card owns the surface.
    assert.equal(state.sidebarHidden, false, "sidebar upgrade card should show");
    assert.match(state.signupText, /Lock In Founding Member Pricing|Upgrade to Pro|Upgrade/i);
    assert.equal(state.bodyFreeUpgrade, true);
    assert.equal(state.bodyPro, false);
    assert.equal(state.reminderOverlapsTopbar, false, "reminder must not overlap topbar");
    console.log("PASS free owner chrome desktop", state);

    // After starter/welcome dismissed and a value moment, the persistent reminder may show.
    await page.evaluate(() => {
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      localStorage.setItem("llhFreeStarterCardsDismissed", "1");
      localStorage.setItem("llhUpgradeValueMoments", JSON.stringify({ count: 1, kinds: ["locked_feature"] }));
      localStorage.setItem("llhNewUserOnboardingV1", JSON.stringify({ deferGenericUpgrades: false, step: "done", active: false }));
      sessionStorage.removeItem("llhFreePlanReminderDismissed");
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
    });
    await page.waitForTimeout(150);
    state = await chromeState(page);
    assert.equal(state.reminderHidden, false, "reminder shows after value moment");
    assert.equal(state.badgeHidden, false);
    console.log("PASS free owner reminder after value moment", state);

    await page.setViewportSize({ width: 390, height: 720 });
    await page.waitForTimeout(200);
    state = await chromeState(page);
    assert.equal(state.badgeHidden, false);
    assert.equal(state.reminderHidden, false);
    console.log("PASS free owner chrome mobile");

    await page.click("[data-dismiss-free-plan-reminder]");
    await page.waitForTimeout(100);
    state = await chromeState(page);
    assert.equal(state.reminderHidden, true, "reminder dismissible");
    assert.equal(state.badgeHidden, false, "badge stays after reminder dismiss");
    assert.equal(state.sidebarHidden, false, "sidebar stays after reminder dismiss");
    console.log("PASS dismiss reminder keeps persistent CTAs");

    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openAsAccount(page, { email: "pro-upgrade-ux@example.com", plan: "Pro" });
    state = await chromeState(page);
    assert.equal(state.canSee, false);
    assert.equal(state.isPro, true);
    assert.equal(state.badgeHidden, true);
    assert.equal(state.reminderHidden, true);
    assert.equal(state.sidebarHidden, true);
    assert.equal(state.bodyFreeUpgrade, false);
    assert.equal(state.bodyPro, true);
    console.log("PASS Pro user never sees Free upgrade chrome");

    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openAsAccount(page, {
      email: "founding-upgrade-ux@example.com",
      plan: "Founding",
      foundingMemberActive: true,
    });
    state = await chromeState(page);
    assert.equal(state.canSee, false);
    assert.equal(state.isPro, true);
    assert.equal(state.badgeHidden, true);
    assert.equal(state.reminderHidden, true);
    assert.equal(state.sidebarHidden, true);
    console.log("PASS Founding member never sees Free upgrade chrome");

    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openAsAccount(page, {
      email: "free-dashboard-ux@example.com",
      plan: "Free",
      freeLessonAccessMode: "curated",
      createdAt: "2026-07-19T12:00:00.000Z",
      clearWelcomeDismiss: true,
    });
    await page.evaluate(() => {
      localStorage.removeItem("llhFreeWelcomeCardDismissed");
      localStorage.removeItem("llhFreeStarterCardsDismissed");
      localStorage.setItem("llhNewUserOnboardingV1", JSON.stringify({
        active: false,
        step: "free-start",
        freeSelectedAt: new Date().toISOString(),
        deferGenericUpgrades: true,
      }));
      // Logged-in home remaps to Calendar — starter explore lives on that planning surface.
      if (typeof setView === "function") setView("calendar");
      if (typeof renderMainCalendar === "function") renderMainCalendar();
    });
    await page.waitForTimeout(500);
    const dash = await page.evaluate(() => {
      const root = document.querySelector("#mainCalendarApp") || document.querySelector(".active-view");
      const starter = root?.querySelector("[data-free-starter-explore]");
      const upgradeWelcome = root?.querySelector('.free-welcome-card [data-checkout-plan]');
      const banner = root?.querySelector(".free-library-conversion-banner");
      const active = document.querySelector(".active-view")?.id || "";
      return {
        active,
        hasStarter: Boolean(starter),
        hasUpgradePush: Boolean(upgradeWelcome),
        hasBanner: Boolean(banner),
        text: starter?.innerText?.slice(0, 500) || "",
        hasLessonCta: Boolean(starter?.querySelector('[data-nuo-nav="lessons"]')),
      };
    });
    assert.equal(dash.active, "view-calendar", "logged-in Free lands on calendar home");
    assert.equal(dash.hasStarter, true, "new Free users see experience-first starter cards");
    assert.equal(dash.hasUpgradePush, false, "starter cards must not push Upgrade to Pro");
    assert.equal(dash.hasBanner, false, "no conversion banner stacked with starter");
    assert.match(dash.text, /Let's get you started/i);
    assert.equal(dash.hasLessonCta, true, "Browse Lesson Plans CTA visible");
    console.log("PASS calendar starter explore for new Free");

    await page.evaluate(() => {
      const btn = document.querySelector("#mainCalendarApp [data-dismiss-free-starter]");
      if (!btn) throw new Error("starter dismiss missing on calendar");
      btn.click();
    });
    await page.waitForTimeout(400);
    const afterDismiss = await page.evaluate(() => {
      const root = document.querySelector("#mainCalendarApp") || document.querySelector(".active-view");
      const starter = root?.querySelector("[data-free-starter-explore]");
      const card = root?.querySelector(".free-dashboard-upgrade-card");
      return {
        hasStarter: Boolean(starter),
        hasCard: Boolean(card),
        dismissed: localStorage.getItem("llhFreeStarterCardsDismissed") === "1",
      };
    });
    assert.equal(afterDismiss.dismissed, true, "starter dismiss persists");
    assert.equal(afterDismiss.hasStarter, false, "starter cards gone after dismiss");
    assert.equal(afterDismiss.hasCard, false, "no immediate upgrade card after Free path");
    console.log("PASS starter dismiss does not immediately push upgrade");

    console.log("\nAll free user upgrade experience tests passed.");
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }
}

main();
