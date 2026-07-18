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
  assert.match(appJs, /If the Free sample feels this good/);
  assert.match(appJs, /Ready to save hours every week\?/);
  assert.match(appJs, /freeWelcomeCardHtml/);
  assert.match(appJs, /freeCalendarPlanningDays\s*=\s*30/);
  assert.match(appJs, /freeFavoriteLimit\s*=\s*20/);
  assert.match(appJs, /freeChildProfileLimit\s*=\s*5/);
  assert.match(css, /\.free-plan-reminder/);
  assert.match(css, /\.free-plan-badge/);
  assert.match(css, /\.free-welcome-card/);
  assert.match(css, /body\.user-pro \.free-plan-badge/);
  assert.match(indexHtml, /id="freePlanReminderBar"/);
  assert.match(indexHtml, /id="freePlanBadge"/);
  assert.match(indexHtml, /id="sidebarFreeUpgradeCard"/);
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
    assert.equal(state.reminderHidden, false, "Free plan reminder should show");
    assert.equal(state.sidebarHidden, false, "sidebar upgrade card should show");
    assert.equal(state.signupText, "Upgrade");
    assert.equal(state.bodyFreeUpgrade, true);
    assert.equal(state.bodyPro, false);
    assert.equal(state.reminderOverlapsTopbar, false, "reminder must not overlap topbar");
    console.log("PASS free owner chrome desktop", state);

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
      if (typeof setView === "function") setView("home");
      if (typeof renderHome === "function") renderHome();
    });
    await page.waitForTimeout(400);
    const dash = await page.evaluate(() => {
      const welcome = document.querySelector(".free-welcome-card");
      const banner = document.querySelector(".free-library-conversion-banner");
      return {
        hasWelcome: Boolean(welcome),
        hasBanner: Boolean(banner),
        text: (welcome || banner)?.innerText?.slice(0, 500) || "",
        hasPrimary: Boolean((welcome || banner)?.querySelector("[data-checkout-plan]")),
        benefits: Array.from((welcome || banner)?.querySelectorAll("li") || []).map((li) => li.textContent.trim()),
      };
    });
    assert.equal(dash.hasWelcome, true, "new Free users see dashboard welcome card");
    assert.equal(dash.hasBanner, false, "welcome card replaces conversion banner until dismissed");
    assert.match(dash.text, /Welcome to Little Learner Hub/i);
    assert.equal(dash.hasPrimary, true);
    assert.ok(dash.benefits.some((line) => /save hours every week/i.test(line)));
    console.log("PASS dashboard welcome card for new Free");

    await page.click("[data-dismiss-free-welcome]");
    await page.waitForTimeout(300);
    const afterDismiss = await page.evaluate(() => {
      const welcome = document.querySelector(".free-welcome-card");
      const banner = document.querySelector(".free-library-conversion-banner");
      return {
        hasWelcome: Boolean(welcome),
        hasBanner: Boolean(banner),
        text: banner?.innerText?.slice(0, 400) || "",
      };
    });
    assert.equal(afterDismiss.hasWelcome, false, "welcome card dismisses");
    assert.equal(afterDismiss.hasBanner, true, "conversion banner appears after welcome dismiss");
    assert.match(afterDismiss.text, /If the Free sample feels this good|save hours every week|Upgrade/i);
    console.log("PASS welcome dismiss reveals conversion banner");

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
