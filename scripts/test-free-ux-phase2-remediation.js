#!/usr/bin/env node
/**
 * Phase 2 — Free UX remediation (Founding chrome, auth overlays, entitlements,
 * onboarding lifecycle, upgrade pressure, connected Free-surface fixes).
 * Run: npm run test:free-ux-phase2-remediation
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
const PORT = 19300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-free-p2-${crypto.randomBytes(4).toString("hex")}.json`);
const CACHE = "20260804-profiles-logs-docs-r1";

function startServer() {
  return spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PROVIDER: "local-json",
      LOCAL_JSON_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
          res.resume();
          res.statusCode === 200 ? resolve() : reject(new Error(`status ${res.statusCode}`));
        });
        req.on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("Server boot timeout");
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const nuoJs = fs.readFileSync(path.join(ROOT, "scripts/new-user-onboarding.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const sampleJs = fs.readFileSync(path.join(ROOT, "scripts/free-curriculum-sample.js"), "utf8");

  assert.match(appJs, /function isFoundingAcquisitionOfferText/);
  assert.match(appJs, /function authoritativeContentAccessLabel/);
  assert.match(appJs, /function isFreeAccessibleActivity/);
  assert.match(appJs, /function curriculumActivityAccessStats/);
  assert.match(appJs, /function syncNonessentialNoticesForAuthOverlay/);
  assert.match(appJs, /FREE_UPGRADE_QUIET_UNTIL_KEY/);
  assert.match(appJs, /viewer_flag_off/);
  assert.match(appJs, /Add Your First Child/);
  assert.match(appJs, /data-activity-access-stats="canonical"/);
  assert.match(appJs, /sidebarCard\.hidden = true/);
  assert.match(appJs, /function favoriteSaveControl/);
  assert.match(appJs, /function freeUserMaySaveResource/);
  assert.doesNotMatch(appJs, /Save \(Pro\)/);
  assert.doesNotMatch(appJs, /"Pro Save"/);
  assert.doesNotMatch(appJs, /configurable from Admin later/);
  assert.match(appJs, /[Hh]eader Upgrade is the one persistent Free path/);
  assert.doesNotMatch(sampleJs, /Founding or Pro/);
  assert.match(nuoJs, /function clearOnLogout/);
  assert.match(nuoJs, /function hasCompletedOnboarding/);
  assert.match(nuoJs, /completedAt/);
  assert.doesNotMatch(nuoJs, /Start a 7-day Pro trial instead/);
  assert.match(css, /body\.auth-modal-open \.llh-meta-cookie-notice/);
  assert.match(css, /#authModal\.modal\.open \{\s*z-index: 13000/);
  assert.match(css, /\.browse-card:focus-visible/);
  assert.match(css, /\.is-locked-save/);
  assert.doesNotMatch(indexHtml, /If the Free sample feels this good/);
  assert.match(indexHtml, new RegExp(`app\\.js\\?v=${CACHE}`));
  assert.match(sw, new RegExp(`llh-shell-v\\d+-${CACHE}`));
  console.log("PASS static Phase 2 markers");

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const netFails = [];
    page.on("response", (res) => {
      if (res.status() >= 400 && /teaching-kit/i.test(res.url())) {
        netFails.push({ status: res.status(), url: res.url() });
      }
    });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof beginNewUserOnboardingAfterFreeSignup === "function", null, { timeout: 30000 });

    // Cookie notice must not block auth controls.
    await page.evaluate(() => {
      try { localStorage.removeItem("llhMetaCookieNoticeDismissed"); } catch { /* ignore */ }
      document.getElementById("llhMetaCookieNotice")?.remove();
      if (typeof ensureMetaCookieNotice === "function") ensureMetaCookieNotice();
      openAuthModal("signup");
    });
    await page.waitForSelector("#authModal.open #authSubmitButton", { state: "visible", timeout: 10000 });
    const overlay = await page.evaluate(() => {
      const cookie = document.getElementById("llhMetaCookieNotice");
      const submit = document.querySelector("#authSubmitButton");
      const cookieStyle = cookie ? getComputedStyle(cookie) : null;
      const submitStyle = submit ? getComputedStyle(submit) : null;
      return {
        cookieDisplay: cookieStyle?.display || "missing",
        cookiePointer: cookieStyle?.pointerEvents || "missing",
        authOpen: document.querySelector("#authModal")?.classList.contains("open") || document.body.classList.contains("auth-modal-open"),
        submitVisible: Boolean(submitStyle && submitStyle.display !== "none" && submitStyle.visibility !== "hidden"),
      };
    });
    assert.equal(overlay.authOpen, true);
    assert.ok(overlay.cookieDisplay === "none" || overlay.cookieDisplay === "missing", "cookie hidden while auth open");
    assert.equal(overlay.submitVisible, true);
    await page.evaluate(() => closeAuthModal());
    console.log("PASS cookie/auth overlay stacking");

    // Founding acquisition announcement suppressed when closed.
    const foundingHidden = await page.evaluate(() => {
      if (typeof renderManagedAnnouncementBanner !== "function") return true;
      const content = typeof effectiveSiteContent === "function" ? effectiveSiteContent() : {};
      content.announcement = {
        visible: true,
        text: "Big Updates Are Coming! Lock In My $9.99 Founding Price before plans change.",
        expiresAt: "2099-01-01",
      };
      if (typeof siteContentState === "object" && siteContentState) {
        siteContentState.announcement = content.announcement;
      }
      renderManagedAnnouncementBanner();
      const banner = document.querySelector("#siteAnnouncementBanner");
      return Boolean(banner?.hidden);
    });
    assert.equal(foundingHidden, true, "Founding acquisition announcement hidden");
    console.log("PASS Founding announcement suppressed");

    // Free signup onboarding lifecycle
    const email = `free-p2-${Date.now()}@example.com`;
    await page.evaluate((userEmail) => {
      localStorage.setItem("llhUser", userEmail);
      localStorage.setItem("llhPlan", "Free");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      accounts[userEmail] = {
        email: userEmail,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        freeLessonAccessMode: "curated",
        selectedPlanAtSignup: "Free",
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      if (typeof loadAccountState === "function") loadAccountState(userEmail);
      beginNewUserOnboardingAfterFreeSignup();
    }, email);

    await page.waitForSelector("#newUserOnboardingModal.open", { timeout: 10000 });
    await page.click('[data-nuo-action="continue"]');
    await page.waitForSelector("[data-nuo-action='choose-free']");
    assert.equal(await page.locator("[data-nuo-action='choose-trial']").count(), 0);
    await page.click('[data-nuo-action="choose-free"]');
    await page.waitForFunction(() => !document.querySelector("#newUserOnboardingModal.open"), null, { timeout: 5000 });

    const completed = await page.evaluate(() => {
      const state = NewUserOnboarding.getState();
      return {
        active: state.active,
        step: state.step,
        completedAt: state.completedAt,
        hasCompleted: NewUserOnboarding.hasCompletedOnboarding(),
      };
    });
    assert.equal(completed.hasCompleted, true);
    assert.equal(completed.active, false);
    assert.ok(completed.completedAt);

    // Refresh must not reopen welcome.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof NewUserOnboarding === "object", null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const afterRefresh = await page.evaluate(() => ({
      open: Boolean(document.querySelector("#newUserOnboardingModal.open")),
      completed: NewUserOnboarding.hasCompletedOnboarding(),
    }));
    assert.equal(afterRefresh.open, false, "welcome does not return after refresh");
    assert.equal(afterRefresh.completed, true);
    console.log("PASS onboarding completion persists across refresh");

    // Logout must close overlays and not block login.
    await page.evaluate(async () => {
      if (typeof signOut === "function") await signOut();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => openAuthModal("login"));
    await page.waitForSelector("#authModal.open");
    const loginClear = await page.evaluate(() => ({
      nuoOpen: Boolean(document.querySelector("#newUserOnboardingModal.open")),
      authOpen: document.querySelector("#authModal")?.classList.contains("open"),
      submitVisible: Boolean(document.querySelector("#authSubmitButton")?.offsetParent),
    }));
    assert.equal(loginClear.nuoOpen, false);
    assert.equal(loginClear.authOpen, true);
    assert.equal(loginClear.submitVisible, true);
    await page.evaluate(() => closeAuthModal());
    console.log("PASS logout clears onboarding overlay for login");

    // Re-login same Free account
    await page.evaluate((userEmail) => {
      localStorage.setItem("llhUser", userEmail);
      localStorage.setItem("llhPlan", "Free");
      if (typeof loadAccountState === "function") loadAccountState(userEmail);
      if (typeof updateAuthButtons === "function") updateAuthButtons();
      if (typeof NewUserOnboarding?.maybeResumeOnBoot === "function") NewUserOnboarding.maybeResumeOnBoot();
    }, email);
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#newUserOnboardingModal.open").count(), 0);

    // Upgrade chrome: one persistent header affordance; sidebar hidden.
    const chrome = await page.evaluate(() => {
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      const sidebar = document.querySelector("#sidebarFreeUpgradeCard");
      const reminder = document.querySelector("#freePlanReminderBar");
      const badge = document.querySelector("#freePlanBadge");
      const signup = document.querySelector("#signupButton");
      return {
        sidebarHidden: !sidebar || sidebar.hidden,
        reminderHidden: !reminder || reminder.hidden,
        badgeVisible: Boolean(badge && !badge.hidden),
        headerUpgrade: /upgrade/i.test(signup?.textContent || ""),
        bodyFounding: /Founding Membership|Lock In My \$9\.99 Founding/i.test(document.body.innerText || ""),
      };
    });
    assert.equal(chrome.sidebarHidden, true, "sidebar upgrade card hidden");
    assert.equal(chrome.reminderHidden, true, "large reminder hidden before value moment");
    assert.equal(chrome.badgeVisible, true);
    assert.equal(chrome.headerUpgrade, true);
    assert.equal(chrome.bodyFounding, false);
    console.log("PASS upgrade pressure capped to header");

    // Entitlement labels for Free activities
    await page.evaluate(() => {
      if (typeof applyDefaultFreeLibraryFilters === "function") applyDefaultFreeLibraryFilters();
      if (typeof setView === "function") setView("activities", { applyFreeLibraryDefaults: true });
      if (typeof renderCategoryPage === "function") renderCategoryPage("activities");
    });
    await page.waitForFunction(() => document.querySelector(".active-view")?.id === "view-activities", null, { timeout: 8000 });
    await page.waitForTimeout(700);
    const activities = await page.evaluate(() => {
      const root = document.querySelector("#view-activities");
      const cards = [...(root?.querySelectorAll(".activity-browse-card, .browse-card") || [])];
      const freeSection = root?.querySelector("[data-free-activities-primary], .browse-row");
      const badges = cards.slice(0, 12).map((card) => card.querySelector(".browse-card-badge")?.textContent?.trim() || "");
      const stats = root?.querySelector("[data-activity-access-stats='canonical']")?.textContent || "";
      const freeFilterCards = cards.filter((card) => {
        const badge = card.querySelector(".browse-card-badge")?.textContent || "";
        return /free/i.test(badge);
      });
      const proBadgesInFreeFilter = cards.filter((card) => /pro/i.test(card.querySelector(".browse-card-badge")?.textContent || "")).length;
      return {
        filter: typeof activityLibraryPlanFilter !== "undefined" ? activityLibraryPlanFilter : null,
        stats,
        badgeSample: badges,
        proBadgesInFreeFilter: activityLibraryPlanFilter === "Free" ? proBadgesInFreeFilter : null,
        freeBadgeCount: freeFilterCards.length,
        hasIncluded: /Your Included Free Activities/i.test(root?.innerText || ""),
      };
    });
    assert.equal(activities.filter, "Free");
    if (activities.proBadgesInFreeFilter != null) {
      assert.equal(activities.proBadgesInFreeFilter, 0, "Free filter must not show Pro badges");
    }
    console.log("PASS Free activity entitlement badges");

    // Lesson counts use canonical stats; open a Free lesson — no TK 404 when disabled.
    await page.evaluate(() => {
      if (typeof setView === "function") setView("lessons", { applyFreeLibraryDefaults: true });
      if (typeof renderCategoryPage === "function") renderCategoryPage("lessons");
    });
    await page.waitForFunction(() => document.querySelector(".active-view")?.id === "view-lessons", null, { timeout: 8000 });
    await page.waitForTimeout(600);
    const lessons = await page.evaluate(() => {
      const text = document.querySelector("#view-lessons")?.innerText || "";
      const freeMatch = text.match(/(\d+)\s*Free Lesson Plans Available/i);
      const proMatch = text.match(/(\d+)\s*Additional Pro Lesson Plans Available/i);
      const stats = typeof curriculumLessonPlanAccessStats === "function" ? curriculumLessonPlanAccessStats() : null;
      const freeCard = document.querySelector(".lesson-plan-card .browse-card-badge.is-free");
      const useBtn = document.querySelector("button.browse-use-plan");
      return {
        freeShown: freeMatch ? Number(freeMatch[1]) : null,
        proShown: proMatch ? Number(proMatch[1]) : null,
        freeStats: stats?.freeTotal ?? null,
        proStats: stats?.proTotal ?? null,
        hasFreeCard: Boolean(freeCard),
        useBtn: Boolean(useBtn),
        founding: /Founding Membership|Lock In My \$9\.99/i.test(text),
        starterBanner: Boolean(document.querySelector("[data-free-starter-banner]")),
      };
    });
    assert.equal(lessons.founding, false);
    assert.equal(lessons.starterBanner, false, "duplicate Free explainer banner removed");
    if (lessons.freeStats != null && lessons.freeShown != null) {
      assert.equal(lessons.freeShown, lessons.freeStats);
    }
    if (lessons.proStats != null && lessons.proShown != null) {
      assert.equal(lessons.proShown, lessons.proStats);
    }

    if (lessons.useBtn) {
      await page.locator("button.browse-use-plan").first().click({ force: true });
      await page.waitForTimeout(1200);
      // Prefer opening viewer via card if assign sheet appeared without viewer.
      const viewerOpen = await page.evaluate(() => Boolean(document.querySelector("[data-lesson-workspace], #resourceViewerBody .lesson-workspace")));
      if (!viewerOpen) {
        await page.locator(".lesson-plan-card").first().click({ force: true });
        await page.waitForTimeout(1500);
      }
    } else {
      await page.locator(".lesson-plan-card").first().click({ force: true });
      await page.waitForTimeout(1500);
    }

    const viewer = await page.evaluate(() => {
      const root = document.querySelector("[data-lesson-workspace]") || document.querySelector("#resourceViewerBody");
      const use = [...(root?.querySelectorAll("button") || [])].filter((b) => /use this plan/i.test(b.textContent || ""));
      const back = [...(root?.querySelectorAll("button") || [])].filter((b) => /^←?\s*back/i.test((b.textContent || "").trim()));
      const save = [...(root?.querySelectorAll("button") || [])].filter((b) => /^save(\s|\(|$)/i.test((b.textContent || "").trim()));
      return {
        open: Boolean(root?.querySelector?.("[data-lesson-workspace]") || root?.classList?.contains("lesson-workspace") || document.querySelector("[data-lesson-workspace]")),
        useCount: use.length,
        backCount: back.length,
        saveCount: save.length,
      };
    });
    if (viewer.open) {
      assert.ok(viewer.useCount <= 1, `expected ≤1 Use This Plan, got ${viewer.useCount}`);
      assert.ok(viewer.backCount <= 1, `expected ≤1 Back, got ${viewer.backCount}`);
      assert.ok(viewer.saveCount <= 1, `expected ≤1 Save, got ${viewer.saveCount}`);
    }
    const saveLabels = await page.evaluate(() => {
      const workspaceSave = document.querySelector(".lesson-workspace-save-btn")?.textContent?.trim() || "";
      const freeCard = document.querySelector(".lesson-plan-card .browse-card-badge.is-free")?.closest(".lesson-plan-card");
      const freeSave = freeCard?.querySelector(".browse-card-actions .ghost-button, .lesson-plan-save-btn")?.textContent?.trim() || "";
      const lockedCard = document.querySelector(".lesson-plan-card.locked");
      const lockedSave = lockedCard?.querySelector(".lesson-plan-save-btn");
      const settingsHtml = document.querySelector("#view-settings")?.innerHTML || "";
      if (typeof renderSettingsHub === "function") {
        try { renderSettingsHub(); } catch { /* ignore */ }
      }
      const settingsAfter = document.querySelector("#view-settings")?.innerHTML || settingsHtml;
      const calendarHasUpgrade = Boolean(document.querySelector("#view-calendar .free-dashboard-upgrade-card"));
      const homeHasUpgrade = Boolean(document.querySelector("#view-home .free-dashboard-upgrade-card"));
      return {
        workspaceSave,
        freeSave,
        lockedSaveDisabled: Boolean(lockedSave?.classList.contains("is-locked-save") || lockedSave?.classList.contains("disabled-control") || lockedSave?.hasAttribute("data-pro-feature")),
        settingsBanner: /founding-upgrade-banner/i.test(settingsAfter),
        calendarHasUpgrade,
        homeHasUpgrade,
        featuredAdminCopy: /configurable from Admin/i.test(document.body.innerText || ""),
      };
    });
    if (saveLabels.workspaceSave) {
      assert.doesNotMatch(saveLabels.workspaceSave, /Save \(Pro\)|Pro Save/i);
    }
    if (saveLabels.freeSave) {
      assert.doesNotMatch(saveLabels.freeSave, /Save \(Pro\)|Pro Save/i);
    }
    assert.equal(saveLabels.settingsBanner, false, "Settings must not stack Founding/Pro upgrade banner");
    assert.equal(saveLabels.calendarHasUpgrade, false, "Calendar must not stack upgrade card");
    assert.equal(saveLabels.homeHasUpgrade, false, "Home must not stack upgrade card");
    assert.equal(saveLabels.featuredAdminCopy, false);
    assert.equal(netFails.length, 0, `no teaching-kit 404s: ${JSON.stringify(netFails)}`);
    console.log("PASS lesson viewer action bar + no TK 404s");
    console.log("PASS Free Save labels + no stacked upgrade panels");

    // Children empty state
    await page.evaluate(() => {
      if (typeof setView === "function") setView("children");
      if (typeof renderChildrenPage === "function") renderChildrenPage();
      else if (typeof renderChildManagement === "function") renderChildManagement();
    });
    await page.waitForTimeout(500);
    const children = await page.evaluate(() => {
      const root = document.querySelector("#view-children, #childrenApp, .simple-child-page") || document.body;
      const add = [...root.querySelectorAll("button")].filter((b) => /add (your first )?child/i.test(b.textContent || "") && b.offsetParent);
      const observe = [...root.querySelectorAll("button")].filter((b) => /add observation/i.test(b.textContent || "") && b.offsetParent);
      return { addCount: add.length, observeCount: observe.length, empty: Boolean(root.querySelector("[data-children-empty-state]")) };
    });
    assert.equal(children.addCount, 1, "one Add Your First Child action");
    assert.equal(children.observeCount, 0, "Add Observation hidden with zero children");
    console.log("PASS children empty state");

    // Mobile auth overlay
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      try { localStorage.removeItem("llhMetaCookieNoticeDismissed"); } catch { /* ignore */ }
      document.getElementById("llhMetaCookieNotice")?.remove();
      if (typeof ensureMetaCookieNotice === "function") ensureMetaCookieNotice();
      openAuthModal("login");
    });
    await page.waitForSelector("#authModal.open");
    const mobileAuth = await page.evaluate(() => {
      const cookie = document.getElementById("llhMetaCookieNotice");
      return {
        cookieHidden: !cookie || getComputedStyle(cookie).display === "none",
        submit: Boolean(document.querySelector("#authSubmitButton")?.offsetParent),
      };
    });
    assert.equal(mobileAuth.cookieHidden, true);
    assert.equal(mobileAuth.submit, true);
    console.log("PASS mobile auth overlay");

    console.log("\nAll Phase 2 Free UX remediation tests passed.");
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
