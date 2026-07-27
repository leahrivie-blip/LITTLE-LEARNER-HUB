/**
 * Shared Playwright navigation helpers — visible clicks only, no setView shortcuts.
 */
const assert = require("node:assert/strict");

const DEVICES = {
  desktop: { width: 1366, height: 900, label: "desktop" },
  tablet: { width: 834, height: 1112, label: "tablet" },
  phone: { width: 390, height: 844, label: "phone" },
};

const PERSONAS = {
  "signed-out": null,
  free: {
    email: "matrix-free@test.local",
    firstName: "Free",
    lastName: "User",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    role: "owner",
    accountType: "home_daycare",
    createdAt: "2026-01-15T12:00:00.000Z",
    freeLessonAccessMode: "curated",
  },
  trial: {
    email: "matrix-trial@test.local",
    firstName: "Trial",
    lastName: "User",
    plan: "Pro",
    subscriptionStatus: "trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    role: "owner",
    accountType: "home_daycare",
  },
  founding: {
    email: "matrix-founding@test.local",
    firstName: "Founding",
    lastName: "Member",
    plan: "Founding",
    foundingMemberActive: true,
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
  pro: {
    email: "matrix-pro@test.local",
    firstName: "Pro",
    lastName: "User",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
  canceled: {
    email: "matrix-canceled@test.local",
    firstName: "Canceled",
    lastName: "User",
    plan: "Pro",
    subscriptionStatus: "Subscription Ended",
    stripeSubscriptionStatus: "canceled",
    subscriptionEndedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    accessEndsAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    role: "owner",
    accountType: "home_daycare",
  },
  "billing-review": {
    email: "matrix-billing@test.local",
    firstName: "Billing",
    lastName: "Review",
    plan: "Pro",
    subscriptionStatus: "Billing Review Required",
    stripeSubscriptionStatus: "past_due",
    lastFailedPaymentAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    role: "owner",
    accountType: "home_daycare",
  },
};

function makePlans(count = 24) {
  return Array.from({ length: count }, (_, i) => ({
    id: `matrix-plan-${i}`,
    title: `Matrix Lesson ${i}`,
    age: "Preschool",
    theme: "Science",
    plan: i % 4 === 0 ? "Free" : "Pro",
    status: "published",
    locked: false,
    activityCount: 4,
    updatedAt: new Date().toISOString(),
  }));
}

function makeActivities(count = 120) {
  return Array.from({ length: count }, (_, i) => ({
    id: `matrix-act-${i}`,
    lessonPlanId: `matrix-plan-${i % 20}`,
    title: `Matrix Activity ${i}`,
    activityCategory: "Art",
    dayOfWeek: "monday",
    plan: "Pro",
    locked: false,
    parentTitle: `Matrix Lesson ${i % 20}`,
    parentAge: "Preschool",
    parentPlan: "Pro",
    updatedAt: new Date().toISOString(),
  }));
}

async function seedSession(page, persona, { lastView = "calendar", cacheActivities = 120 } = {}) {
  const plans = makePlans(24);
  const activities = makeActivities(cacheActivities);
  await page.addInitScript(({ acct, rememberedView, cachedPlans, cachedActivities }) => {
    localStorage.clear();
    sessionStorage.clear();
    if (!acct) return;
    localStorage.setItem("llhUser", acct.email);
    localStorage.setItem("llhPlan", acct.plan || "Free");
    localStorage.setItem("llhAccounts", JSON.stringify({ [acct.email]: acct }));
    sessionStorage.setItem("llhLastPlatformView", rememberedView);
    localStorage.setItem("llhCurriculumLibraryCacheV1", JSON.stringify({
      lessonPlans: cachedPlans,
      activities: cachedActivities,
      resources: [],
      updatedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    }));
  }, { acct: persona, rememberedView: lastView, cachedPlans: plans, cachedActivities: activities });
}

async function waitBootReady(page) {
  await page.waitForFunction(
    () => document.body.classList.contains("app-boot-ready")
      && !document.querySelector("#appBootGate:not([hidden])"),
    null,
    { timeout: 45000 },
  );
}

async function openMobileNavIfNeeded(page) {
  const toggle = page.locator("#mobileMenuToggle");
  if (!(await toggle.isVisible())) return;
  const isOpen = await page.evaluate(() => document.body.classList.contains("mobile-nav-open"));
  if (!isOpen) await toggle.click();
  await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"), null, { timeout: 5000 });
}

async function closeMobileNavIfOpen(page) {
  const isOpen = await page.evaluate(() => document.body.classList.contains("mobile-nav-open"));
  if (!isOpen) return;
  const toggle = page.locator("#mobileMenuToggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"), null, { timeout: 5000 });
}

async function clickSidebarNav(page, navView, resolvedView = navView) {
  await openMobileNavIfNeeded(page);
  const clicked = await page.evaluate((view) => {
    const nodes = [...document.querySelectorAll(`.sidebar .nav-link[data-view="${view}"]`)];
    const el = nodes.find((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true" && node.offsetParent !== null);
    if (!el) return false;
    el.click();
    return true;
  }, navView);
  assert.ok(clicked, `no visible sidebar link for ${navView}`);
  await page.waitForSelector(`#view-${resolvedView}.active-view`, { timeout: 20000 });
  await closeMobileNavIfOpen(page);
}

async function evaluateShell(page) {
  return page.evaluate(() => {
    const views = [...document.querySelectorAll(".view")];
    const visible = views.filter((v) => {
      const style = getComputedStyle(v);
      return style.display !== "none" && style.visibility !== "hidden" && v.offsetParent !== null;
    });
    const active = [...document.querySelectorAll(".view.active-view")];
    return {
      activeId: document.querySelector(".active-view")?.id || "",
      activeCount: active.length,
      visibleIds: visible.map((v) => v.id),
      visibleCount: visible.length,
      bootReady: document.body.classList.contains("app-boot-ready"),
      providerSidebarVisible: (() => {
        const sb = document.querySelector(".app-shell > .sidebar");
        if (!sb) return false;
        const style = getComputedStyle(sb);
        return style.display !== "none" && sb.offsetParent !== null;
      })(),
    };
  });
}

function assertSingleView(shell, label) {
  assert.equal(shell.activeCount, 1, `${label}: expected one active view, got ${shell.activeCount}`);
  assert.equal(shell.visibleCount, 1, `${label}: expected one visible view, got ${shell.visibleIds.join(", ")}`);
}

module.exports = {
  DEVICES,
  PERSONAS,
  makePlans,
  makeActivities,
  seedSession,
  waitBootReady,
  openMobileNavIfNeeded,
  closeMobileNavIfOpen,
  clickSidebarNav,
  evaluateShell,
  assertSingleView,
};
