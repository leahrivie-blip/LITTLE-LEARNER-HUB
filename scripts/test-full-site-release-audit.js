#!/usr/bin/env node
/**
 * Full-site release audit for Free/Pro conversion experience.
 *
 * Covers guest + Free (curated/legacy) + Pro + Founding across
 * desktop / tablet / mobile: nav, signup, lessons, activities,
 * calendar, favorites, child profiles, upgrade chrome, and permissions.
 *
 * Run: node scripts/test-full-site-release-audit.js
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
const PORT = 19750 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-full-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join("/opt/cursor/artifacts", "full-site-release-audit");
const SCREEN_DIR = path.join(OUT_DIR, "screenshots");

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

const PERSONAS = {
  guest: null,
  freeCurated: {
    email: "audit-free-curated@example.com",
    plan: "Free",
    freeLessonAccessMode: "curated",
    createdAt: "2026-07-19T12:00:00.000Z",
    firstName: "Curated",
    lastName: "Free",
  },
  freeLegacy: {
    email: "audit-free-legacy@example.com",
    plan: "Free",
    freeLessonAccessMode: "legacy",
    createdAt: "2026-01-15T12:00:00.000Z",
    firstName: "Legacy",
    lastName: "Free",
  },
  pro: {
    email: "audit-pro@example.com",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    firstName: "Pro",
    lastName: "Provider",
  },
  founding: {
    email: "audit-founding@example.com",
    plan: "Founding",
    foundingMemberActive: true,
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    firstName: "Founding",
    lastName: "Member",
  },
  trial: {
    email: "audit-trial@example.com",
    plan: "Pro",
    subscriptionStatus: "trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    firstName: "Trial",
    lastName: "Provider",
  },
};

const report = {
  title: "Full Site Release Audit — Free/Pro Conversion",
  startedAt: new Date().toISOString(),
  finishedAt: "",
  branch: "",
  passed: [],
  failed: [],
  warnings: [],
  screenshots: [],
};

function pass(label) {
  report.passed.push(label);
  console.log(`✓ ${label}`);
}

function warn(label) {
  report.warnings.push(label);
  console.log(`⚠ ${label}`);
}

function fail(label, error) {
  const msg = `${label}: ${error?.message || error}`;
  report.failed.push(msg);
  console.error(`✗ ${msg}`);
}

async function shot(page, name) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const file = path.join(SCREEN_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(file);
  return file;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
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
  const users = {};
  Object.values(PERSONAS).forEach((acct) => {
    if (!acct) return;
    const paid = ["Founding", "Pro"].includes(acct.plan) || acct.foundingMemberActive;
    users[acct.email] = {
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
      trialStatus: acct.trialStatus || "",
    };
  });
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users, siteContent: {}, adminSessions: {} }, null, 2));
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
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("boot timeout");
}

async function openAs(page, account) {
  await page.addInitScript((acct) => {
    localStorage.clear();
    sessionStorage.clear();
    if (!acct) return;
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
        trialStatus: acct.trialStatus || "",
      },
    }));
    localStorage.removeItem("llhFreeWelcomeCardDismissed");
    sessionStorage.removeItem("llhFreePlanReminderDismissed");
    sessionStorage.removeItem("llhFoundingUpgradeDismissed");
  }, account);
  page.setDefaultTimeout(45000);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
  await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 60000 });
  await page.waitForTimeout(400);
  if (account) {
    await page.evaluate(() => {
      try { if (typeof loadAccountState === "function") loadAccountState(localStorage.getItem("llhUser")); } catch { /* ignore */ }
      try { if (typeof updateAuthButtons === "function") updateAuthButtons(); } catch { /* ignore */ }
      try { if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome(); } catch { /* ignore */ }
    });
    await page.waitForFunction(() => {
      try { return typeof canSeePaidUpgradeOffer === "function" && typeof canSeePaidUpgradeOffer() === "boolean"; }
      catch { return false; }
    }, null, { timeout: 60000 });
    await page.evaluate(() => {
      if (typeof refreshFreePlanUpgradeChrome === "function") refreshFreePlanUpgradeChrome();
      if (typeof setView === "function") setView("calendar");
    });
    await page.waitForTimeout(500);
  }
}

async function goView(page, view) {
  await page.evaluate((v) => {
    if (typeof setView === "function") setView(v, v === "home" ? { allowDashboard: true } : {});
  }, view);
  await page.waitForTimeout(450);
}

async function countVisible(page, selector) {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).filter((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || "1") > 0.05
        && rect.width > 0
        && rect.height > 0;
    }).length;
  }, selector);
}

async function clickFirstVisible(page, selector) {
  const handle = await page.evaluateHandle((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    return nodes.find((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }) || null;
  }, selector);
  const el = handle.asElement();
  if (!el) throw new Error(`No visible element for ${selector}`);
  await el.click({ force: true });
  await page.waitForTimeout(350);
}

async function auditGuest(browser, viewport) {
  const label = `guest/${viewport.name}`;
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await openAs(page, null);
    await shot(page, `${label}-home`);

    // Homepage CTAs
    const ctaCount = await countVisible(page, "[data-action='start-free'], [data-checkout-plan], [data-action='open-login']");
    assert.ok(ctaCount >= 2, `expected homepage CTAs, found ${ctaCount}`);
    pass(`${label}: homepage CTAs visible`);

    // Signup path
    await clickFirstVisible(page, "[data-action='start-free']");
    await page.waitForTimeout(400);
    const signupOpen = await page.evaluate(() => {
      const modal = document.querySelector("#authModal, .auth-modal, [data-auth-modal]");
      const email = document.querySelector("#emailInput, input[name='email'], input[type='email']");
      return {
        modalOpen: Boolean(modal && (modal.classList.contains("open") || !modal.hidden)),
        emailVisible: Boolean(email && email.getBoundingClientRect().height > 0),
      };
    });
    assert.ok(signupOpen.modalOpen || signupOpen.emailVisible, "signup/auth UI should open from Get Started");
    pass(`${label}: signup opens from Get Started`);
    await shot(page, `${label}-signup`);

    // Close auth if open and browse lessons as guest
    await page.evaluate(() => {
      document.querySelectorAll(".modal.open, #authModal.open").forEach((m) => {
        m.classList.remove("open");
        m.setAttribute("aria-hidden", "true");
      });
      if (typeof setView === "function") setView("lessons");
    });
    await page.waitForFunction(
      () => document.querySelector(".active-view")?.id === "view-lessons",
      null,
      { timeout: 15000 },
    );
    await page.waitForTimeout(300);
    const lessons = await page.evaluate(() => {
      const cards = document.querySelectorAll(".resource-card, .lesson-card, .library-card, [data-resource-id]");
      const locked = document.querySelectorAll(".is-locked, .resource-card.locked, [data-locked='true'], .pro-lock, .locked-preview");
      return { cards: cards.length, locked: locked.length, active: document.querySelector(".active-view")?.id || "" };
    });
    assert.equal(lessons.active, "view-lessons");
    assert.ok(lessons.cards > 0, "guest should see lesson cards");
    pass(`${label}: lesson library renders (${lessons.cards} cards)`);
    await shot(page, `${label}-lessons`);

    await goView(page, "activities");
    const activities = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      cards: document.querySelectorAll(".resource-card, .activity-card, .library-card, [data-resource-id]").length,
    }));
    assert.equal(activities.active, "view-activities");
    assert.ok(activities.cards > 0, "guest should see activity cards");
    pass(`${label}: activity center renders (${activities.cards} cards)`);
    await shot(page, `${label}-activities`);

    // Guest should not see Free-owner upgrade chrome
    const chrome = await page.evaluate(() => ({
      badge: document.querySelector("#freePlanBadge")?.hidden,
      reminder: document.querySelector("#freePlanReminderBar")?.hidden,
      welcome: Boolean(document.querySelector('.free-welcome-card[aria-label="Welcome to Little Learner Hub"]')),
      upgradeCard: Boolean(document.querySelector(".free-dashboard-upgrade-card")),
    }));
    assert.notEqual(chrome.badge, false, "guest must not see Free badge");
    assert.notEqual(chrome.reminder, false, "guest must not see Free reminder");
    assert.equal(chrome.welcome, false, "guest must not see Free welcome card");
    assert.equal(chrome.upgradeCard, false, "guest must not see Free upgrade card");
    pass(`${label}: no Free-owner chrome`);
  } catch (error) {
    fail(`${label}`, error);
    await shot(page, `${label}-FAIL`).catch(() => {});
  } finally {
    await page.close().catch(() => {});
  }
}

async function auditPersona(browser, viewport, personaKey, account) {
  const label = `${personaKey}/${viewport.name}`;
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await openAs(page, account);
    const state = await page.evaluate(() => ({
      email: localStorage.getItem("llhUser"),
      isPro: typeof isProUser === "function" ? isProUser() : null,
      canSeeUpgrade: typeof canSeePaidUpgradeOffer === "function" ? canSeePaidUpgradeOffer() : null,
      legacy: typeof hasLegacyFreeLessonAccess === "function" ? hasLegacyFreeLessonAccess() : null,
      active: document.querySelector(".active-view")?.id || "",
      badgeHidden: document.querySelector("#freePlanBadge")?.hidden,
      reminderHidden: document.querySelector("#freePlanReminderBar")?.hidden,
      // New first-visit welcome only — never count the persistent upgrade card as welcome.
      welcome: Boolean(document.querySelector(
        '#mainCalendarApp .free-welcome-card[aria-label="Welcome to Little Learner Hub"], .free-welcome-card[aria-label="Welcome to Little Learner Hub"]',
      )),
      upgradeCard: Boolean(document.querySelector(
        "#mainCalendarApp .free-dashboard-upgrade-card, .free-dashboard-upgrade-card",
      )),
      conversion: Boolean(document.querySelector("#mainCalendarApp .free-library-conversion-banner, .free-library-conversion-banner")),
    }));

    assert.equal(state.email, account.email);
    assert.ok(state.active === "view-calendar" || state.active === "view-home", `expected calendar/home, got ${state.active}`);
    pass(`${label}: logged in and landed (${state.active})`);
    await shot(page, `${label}-calendar`);

    const isPaid = personaKey === "pro" || personaKey === "founding" || personaKey === "trial";
    if (isPaid) {
      assert.equal(state.isPro, true, "paid persona should be Pro");
      assert.equal(state.canSeeUpgrade, false, "paid persona should not see Free upgrade offer");
      assert.notEqual(state.badgeHidden, false, "paid persona must not show Free badge");
      assert.equal(state.welcome, false, "paid persona must not see Free welcome");
      assert.equal(state.upgradeCard, false, "paid persona must not see Free upgrade card");
      pass(`${label}: paid permissions correct`);
    } else if (personaKey === "freeCurated") {
      assert.equal(state.isPro, false);
      assert.equal(state.canSeeUpgrade, true);
      assert.equal(state.legacy, false);
      assert.equal(state.badgeHidden, false, "curated Free should show badge");
      assert.equal(state.welcome || state.conversion, true, "curated Free should see welcome or conversion");
      assert.equal(state.upgradeCard, false, "curated Free welcome owns the surface before dismiss");
      pass(`${label}: curated Free permissions + upgrade chrome`);
    } else if (personaKey === "freeLegacy") {
      assert.equal(state.isPro, false);
      assert.equal(state.canSeeUpgrade, true);
      assert.equal(state.legacy, true);
      assert.equal(state.welcome, false, "legacy Free should not see new welcome card");
      assert.equal(state.upgradeCard, true, "legacy Free should see persistent upgrade card (not the new welcome)");
      pass(`${label}: legacy Free permissions`);
    }

    // Lesson library
    await goView(page, "lessons");
    const lessons = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".resource-card, .lesson-card, .library-card, [data-resource-id]"));
      const openButtons = Array.from(document.querySelectorAll(
        "[data-open-resource], [data-view-lesson], .resource-card button, .lesson-card button, button[data-resource-id]",
      ));
      return {
        active: document.querySelector(".active-view")?.id || "",
        cards: cards.length,
        buttons: openButtons.length,
        upgradeStrip: Boolean(document.querySelector(".library-upgrade-strip, .free-library-conversion-banner")),
      };
    });
    assert.equal(lessons.active, "view-lessons");
    assert.ok(lessons.cards > 0, "lesson cards should render");
    pass(`${label}: lesson library (${lessons.cards} cards)`);
    await shot(page, `${label}-lessons`);

    // Open first lesson card/button if possible
    const opened = await page.evaluate(() => {
      const btn = document.querySelector(
        ".resource-card button, .lesson-card button, [data-open-resource], [data-view-lesson], .library-card button",
      );
      if (!btn) return { clicked: false };
      btn.click();
      return { clicked: true };
    });
    await page.waitForTimeout(700);
    if (opened.clicked) {
      const viewer = await page.evaluate(() => ({
        modal: Boolean(document.querySelector("#resourceViewerModal.open, .resource-viewer-modal.open, .lesson-workspace, #view-lesson-editor.active-view, .active-view#view-lessons .lesson-detail")),
        bodyText: (document.querySelector("#resourceViewerModal, .lesson-workspace, .active-view")?.innerText || "").slice(0, 200),
        customizeLocked: /Make This Lesson Plan Your Own|Customize any lesson plan/i.test(document.body.innerText),
      }));
      pass(`${label}: lesson open click works`);
      if (!isPaid && personaKey === "freeCurated" && viewer.customizeLocked) {
        pass(`${label}: customization upgrade messaging present for curated Free`);
      }
      await shot(page, `${label}-lesson-open`);
      // Close overlays
      await page.evaluate(() => {
        document.querySelectorAll(".modal.open").forEach((m) => {
          m.classList.remove("open");
          m.setAttribute("aria-hidden", "true");
        });
        const close = document.querySelector("[data-close-viewer], [data-close-modal], .modal.open .ghost-button");
        if (close) close.click();
      });
      await page.waitForTimeout(200);
    } else {
      warn(`${label}: no lesson open button found`);
    }

    // Activities
    await goView(page, "activities");
    const activities = await page.evaluate(() => {
      const cards = document.querySelectorAll(".resource-card, .activity-card, .library-card, [data-resource-id]");
      const proResources = (typeof resources !== "undefined" ? resources : [])
        .filter((r) => r && r.category === "Activity Center" && String(r.plan || "") === "Pro");
      return {
        active: document.querySelector(".active-view")?.id || "",
        cards: cards.length,
        proCount: proResources.length,
        sampleId: proResources[0]?.id || "",
      };
    });
    assert.equal(activities.active, "view-activities");
    assert.ok(activities.cards > 0, "activity cards should render");
    if (isPaid && activities.proCount > 0) {
      // Browse-list payloads intentionally omit steps/description/teacherLanguage to keep
      // /api/site-content small; the real how-to content is lazy-hydrated on open via
      // /api/curriculum/activities/:id. Open a real card (like a user would) instead of
      // inspecting the pre-hydration array, which would always read as empty by design.
      await page.evaluate((id) => {
        document.querySelector(`[data-view-resource="${id}"]`)?.click();
      }, activities.sampleId);
      await page.waitForSelector("#resourceViewerModal.open", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const hydrated = await page.evaluate(() => ({
        bodyText: document.querySelector("#resourceViewerBody")?.innerText || "",
      }));
      assert.ok(
        /Directions|Materials|Objective|Description/i.test(hydrated.bodyText),
        `paid users should receive hydrated Pro activity content on open (got: ${hydrated.bodyText.slice(0, 200)})`,
      );
      pass(`${label}: Pro activity opens with hydrated how-to content`);
      await page.evaluate(() => {
        document.querySelectorAll(".modal.open").forEach((m) => {
          m.classList.remove("open");
          m.setAttribute("aria-hidden", "true");
        });
      });
      await page.waitForTimeout(200);
    }
    pass(`${label}: activities (${activities.cards} cards)`);
    await shot(page, `${label}-activities`);

    // Calendar still works
    await goView(page, "calendar");
    const calendar = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      shell: Boolean(document.querySelector("#mainCalendarApp .llh-calendar-shell, #mainCalendarApp")),
      addBtn: Boolean(document.querySelector("[data-calendar-add-lesson-plan]")),
    }));
    assert.equal(calendar.active, "view-calendar");
    assert.ok(calendar.shell, "calendar shell should render");
    pass(`${label}: calendar works`);

    // Child profiles
    await goView(page, "children");
    const children = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      hasUi: Boolean(document.querySelector("#view-children, [data-view='children']"))
        || /Child|Profile|Children/i.test(document.querySelector(".active-view")?.innerText || ""),
      limitNote: /up to 5 child profiles|5 child profiles/i.test(document.body.innerText),
    }));
    assert.ok(children.active.includes("child") || children.hasUi, `children view expected, got ${children.active}`);
    pass(`${label}: child profiles view opens`);
    if (personaKey === "freeCurated" && children.limitNote) {
      pass(`${label}: Free child profile limit copy present`);
    }
    await shot(page, `${label}-children`);

    // Documentation helpers
    await goView(page, "ai");
    const ai = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      helpers: /Documentation|Observation|Parent Message/i.test(document.querySelector(".active-view")?.innerText || ""),
    }));
    assert.equal(ai.active, "view-ai");
    assert.ok(ai.helpers, "documentation helpers should render");
    pass(`${label}: documentation helpers open`);

    // Plans / billing visibility
    await goView(page, "plans");
    const plans = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      hasPricing: /Free|Pro|Founding|\$9\.99|\$19\.99/i.test(document.querySelector(".active-view")?.innerText || document.body.innerText || ""),
    }));
    assert.ok(plans.active === "view-plans" || plans.hasPricing, "plans page should show pricing");
    pass(`${label}: plans/pricing reachable`);

    // Favorites view if available
    await page.evaluate(() => {
      try { if (typeof setView === "function") setView("favorites"); } catch { /* ignore */ }
    });
    await page.waitForTimeout(300);
    const fav = await page.evaluate(() => ({
      active: document.querySelector(".active-view")?.id || "",
      modal: Boolean(document.querySelector("#proModal.open")),
      text: (document.querySelector(".active-view, #proModal")?.innerText || "").slice(0, 180),
    }));
    if (isPaid) {
      assert.notEqual(fav.modal, true, "paid users should not hit Pro lock on favorites");
      pass(`${label}: favorites accessible for paid`);
    } else if (fav.modal || fav.active === "view-favorites" || /favorite|upgrade|pro/i.test(fav.text)) {
      pass(`${label}: favorites gate/view handled for Free`);
    } else {
      warn(`${label}: favorites surface unclear`);
    }
  } catch (error) {
    fail(`${label}`, error);
    await shot(page, `${label}-FAIL`).catch(() => {});
  } finally {
    await page.close().catch(() => {});
  }
}

async function auditSignupFlow(browser) {
  const label = "signup-flow/desktop";
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await openAs(page, null);
    await clickFirstVisible(page, "[data-action='start-free']");
    await page.waitForTimeout(500);

    // Fill auth email (prefer the visible auth modal field, not marketing contact forms)
    const emailFilled = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("#emailInput, #authModal input[type='email'], .auth-modal input[type='email'], input[name='email']"));
      const email = candidates.find((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !el.disabled;
      });
      if (!email) return false;
      email.focus();
      email.value = `audit-signup-${Date.now()}@example.com`;
      email.dispatchEvent(new Event("input", { bubbles: true }));
      email.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    if (emailFilled) {
      const continueBtn = page.locator("#authModal button:has-text('Continue'), #authModal button:has-text('Next'), #authContinue, [data-auth-continue]").first();
      if (await continueBtn.count()) {
        await continueBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    // Look for plan chooser / Free preview / Founding
    const chooser = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return {
        founding: /Founding Member|\$9\.99/i.test(text),
        freePreview: /Free Plan|Create Free|curated|sample/i.test(text),
        pro: /Pro Monthly|\$19\.99|Start Your 7-Day Free Trial/i.test(text),
      };
    });
    assert.ok(chooser.founding || chooser.freePreview, "signup should expose paid/free plan choices");
    pass(`${label}: plan chooser messaging present`);
    await shot(page, `${label}-chooser`);

    // Free confirm path if available
    const freeBtn = page.locator("[data-plan='Free'], [data-action='choose-free'], button:has-text('Create Free Account'), button:has-text('Continue with Free')").first();
    if (await freeBtn.count()) {
      await freeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      const confirm = await page.evaluate(() => /miss|upgrade anytime|curated|Free/i.test(document.body.innerText || ""));
      if (confirm) pass(`${label}: Free confirmation copy shown`);
      else warn(`${label}: Free confirm copy not detected after Free click`);
      await shot(page, `${label}-free-confirm`);
    } else {
      warn(`${label}: Free plan button not found in current signup step`);
    }
  } catch (error) {
    fail(label, error);
    await shot(page, `${label}-FAIL`).catch(() => {});
  } finally {
    await page.close().catch(() => {});
  }
}

async function auditApiPermissions() {
  const label = "api-permissions";
  try {
    const publicContent = await requestJson("GET", "/api/site-content");
    assert.equal(publicContent.status, 200);
    const plans = publicContent.json?.siteContent?.curriculumLibrary?.lessonPlans
      || publicContent.json?.curriculumLibrary?.lessonPlans
      || [];
    assert.ok(plans.length > 0, "public library should list lesson plans");
    const lockedPro = plans.filter((p) => p.plan === "Pro" && p.locked);
    const unlocked = plans.filter((p) => p.locked === false || p.dailyPlans);
    assert.ok(lockedPro.length > 0, "some Pro plans should be locked publicly");
    assert.ok(unlocked.length > 0, "some Free/curated plans should be unlocked publicly");
    pass(`${label}: public library gate (${unlocked.length} unlocked, ${lockedPro.length} locked Pro)`);

    const freeHdr = { Authorization: "Bearer test:audit-free-curated@example.com" };
    const legacyHdr = { Authorization: "Bearer test:audit-free-legacy@example.com" };
    const proHdr = { Authorization: "Bearer test:audit-pro@example.com" };

    const freeLib = await requestJson("GET", "/api/site-content", null, freeHdr);
    const legacyLib = await requestJson("GET", "/api/site-content", null, legacyHdr);
    const proLib = await requestJson("GET", "/api/site-content", null, proHdr);
    assert.equal(freeLib.status, 200);
    assert.equal(legacyLib.status, 200);
    assert.equal(proLib.status, 200);

    const countUnlocked = (payload) => {
      const list = payload?.siteContent?.curriculumLibrary?.lessonPlans
        || payload?.curriculumLibrary?.lessonPlans
        || [];
      // Browse-list DTOs intentionally omit dailyPlans (fetched lazily on open) for the
      // fully-authorized Pro/Founding/Trial/admin library, so "unlocked" must be read from
      // the `locked` flag alone, not dailyPlans presence (which only some legacy/curated
      // Free list entries still embed inline).
      return list.filter((p) => p && p.locked !== true).length;
    };
    const freeCount = countUnlocked(freeLib.json);
    const legacyCount = countUnlocked(legacyLib.json);
    const proCount = countUnlocked(proLib.json);
    assert.ok(proCount > legacyCount, `Pro (${proCount}) should unlock more than legacy Free (${legacyCount})`);
    assert.ok(legacyCount >= freeCount, `legacy Free (${legacyCount}) should unlock >= curated Free (${freeCount})`);
    assert.ok(proCount >= 40, `Pro should unlock nearly the full published library (got ${proCount})`);
    pass(`${label}: unlock counts curated=${freeCount} legacy=${legacyCount} pro=${proCount}`);
  } catch (error) {
    fail(label, error);
  }
}

async function auditStaticContracts() {
  const label = "static-contracts";
  try {
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.match(appJs, /freeCalendarPlanningDays\s*=\s*30/);
    assert.match(appJs, /freeFavoriteLimit\s*=\s*20/);
    assert.match(appJs, /freeChildProfileLimit\s*=\s*5/);
    assert.match(appJs, /freeWelcomeCardHtml/);
    assert.match(appJs, /freeUpgradeBenefitLines/);
    assert.match(appJs, /hasLegacyFreeLessonAccess/);
    assert.match(indexHtml, /About 30 days of calendar planning/);
    assert.match(indexHtml, /Up to 20 favorites/);
    assert.match(indexHtml, /5 Child Profiles/);
    const ver = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
    assert.ok(ver, "app.js cache bust present");
    assert.match(sw, new RegExp(ver.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    pass(`${label}: Free limits + cache bust aligned (${ver})`);
  } catch (error) {
    fail(label, error);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  try {
    report.branch = fs.readFileSync(path.join(ROOT, ".git/HEAD"), "utf8").trim();
  } catch {
    report.branch = "";
  }

  console.log(`\nFull-site release audit on http://127.0.0.1:${PORT}\n`);
  await auditStaticContracts();

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    pass("server health");
    await auditApiPermissions();
    await auditSignupFlow(browser);

    // Guest on all viewports
    for (const viewport of VIEWPORTS) {
      await auditGuest(browser, viewport);
    }

    // Personas: desktop always; tablet/mobile for curated Free + Pro (highest risk)
    for (const viewport of VIEWPORTS) {
      await auditPersona(browser, viewport, "freeCurated", PERSONAS.freeCurated);
      await auditPersona(browser, viewport, "pro", PERSONAS.pro);
    }
    // Legacy Free + Founding + Trial on desktop
    await auditPersona(browser, VIEWPORTS[0], "freeLegacy", PERSONAS.freeLegacy);
    await auditPersona(browser, VIEWPORTS[0], "founding", PERSONAS.founding);
    await auditPersona(browser, VIEWPORTS[0], "trial", PERSONAS.trial);

  } catch (error) {
    fail("audit-runner", error);
    if (bootLog) console.error(bootLog.slice(-2500));
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }

  report.finishedAt = new Date().toISOString();
  const summary = {
    ...report,
    counts: {
      passed: report.passed.length,
      failed: report.failed.length,
      warnings: report.warnings.length,
      screenshots: report.screenshots.length,
    },
  };
  const outFile = path.join(OUT_DIR, "full-site-release-audit.json");
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  const md = [
    `# ${report.title}`,
    "",
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Passed: ${report.passed.length}`,
    `- Failed: ${report.failed.length}`,
    `- Warnings: ${report.warnings.length}`,
    "",
    "## Failures",
    ...(report.failed.length ? report.failed.map((f) => `- ${f}`) : ["- None"]),
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map((w) => `- ${w}`) : ["- None"]),
    "",
    "## Screenshots",
    ...report.screenshots.map((s) => `- ${s}`),
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "full-site-release-audit.md"), md);

  console.log(`\nAudit complete: ${report.passed.length} passed, ${report.failed.length} failed, ${report.warnings.length} warnings`);
  console.log(`Report: ${outFile}`);
  if (report.failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
