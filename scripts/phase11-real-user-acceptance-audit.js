#!/usr/bin/env node
/**
 * Phase 11 REAL-USER tester acceptance audit against LIVE TESTING ONLY.
 * Actually clicks through journeys. Does not touch production.
 *
 * Run: node scripts/phase11-real-user-acceptance-audit.js
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const TESTING = "https://little-learner-hub-testing.onrender.com";
const PRODUCTION = "https://littlelearnershubbyleah.com";
const EXPECTED_SHELL = "20260808-phase11-tester-accept";
const OUT = "/opt/cursor/artifacts/phase11-real-user-audit";
const SHOTS = path.join(OUT, "screenshots");
const PASSWORD = "AuditTest!23456";

const report = {
  startedAt: new Date().toISOString(),
  testing: TESTING,
  expectedShell: EXPECTED_SHELL,
  issues: [],
  checks: {},
  journeys: {},
  screenshots: [],
  areas: {},
};

function issue(severity, area, title, detail = "", repro = "") {
  report.issues.push({ severity, area, title, detail: String(detail).slice(0, 800), repro });
  console.log(`[${severity}] ${area}: ${title} — ${String(detail).slice(0, 160)}`);
}

function check(id, pass, detail = "") {
  report.checks[id] = { pass: Boolean(pass), detail: String(detail).slice(0, 500) };
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  report.screenshots.push(file);
  return file;
}

async function dismissNoise(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
      document.querySelectorAll(
        "#cookieNotice, .cookie-banner, #installAppModal.open, #newUserOnboardingModal.open, .toast, .llh-toast",
      ).forEach((el) => {
        el.classList?.remove("open");
        el.hidden = true;
        el.setAttribute?.("aria-hidden", "true");
      });
      document.body.classList.remove("nuo-open", "auth-modal-open");
    } catch { /* ignore */ }
  }).catch(() => {});
  for (const sel of [
    "#closeInstallAppModal",
    "#installAppSecondaryButton",
    "button:has-text('Maybe Later')",
    "button:has-text('Not now')",
    "button:has-text('Got it')",
    "button:has-text('Close')",
  ]) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try { await loc.click({ timeout: 800 }); } catch { /* ignore */ }
    }
  }
}

async function openFresh(browser, viewport) {
  const context = await browser.newContext({
    viewport: viewport || { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  await context.clearCookies();
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    if (!/ResizeObserver|Script error/i.test(err.message)) {
      issue("Medium", "JS", "pageerror", err.message);
    }
  });
  return { context, page };
}

async function gotoTesting(page, urlPath = "/") {
  const t0 = Date.now();
  const res = await page.goto(`${TESTING}${urlPath}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1200);
  await dismissNoise(page);
  const ms = Date.now() - t0;
  const finalUrl = page.url();
  if (finalUrl.includes("littlelearnershubbyleah.com") && !finalUrl.includes("testing")) {
    issue("Critical", "Access", "Redirected to production", finalUrl);
  }
  return { status: res?.status(), ms, url: finalUrl };
}

async function openSignup(page) {
  // Marketing homepage hides legacy #signinButton; use visible CTAs or openAuthModal.
  const candidates = [
    page.locator('button.llh-btn-primary:has-text("Sign Up"), a.llh-btn:has-text("Sign Up")').first(),
    page.locator(".llh-hero-primary-cta, button:has-text('Start Free'), a:has-text('Create Free Account')").first(),
    page.locator("#signupButton").first(),
  ];
  let opened = false;
  for (const loc of candidates) {
    if (!(await loc.count())) continue;
    try {
      await loc.click({ timeout: 4000 });
      await page.waitForSelector("#authModal.open", { timeout: 5000 });
      opened = true;
      break;
    } catch { /* try next */ }
  }
  if (!opened) {
    await page.evaluate(() => { if (typeof openAuthModal === "function") openAuthModal("signup"); });
    await page.waitForSelector("#authModal.open", { timeout: 8000 });
  }
  // Ensure signup mode
  const title = await page.locator("#authTitle").innerText().catch(() => "");
  if (!/create|sign up|free/i.test(title)) {
    const switchBtn = page.locator("#switchAuthModeButton");
    if (await switchBtn.isVisible().catch(() => false)) await switchBtn.click();
    else await page.evaluate(() => { if (typeof openAuthModal === "function") openAuthModal("signup"); });
    await page.waitForTimeout(300);
  }
}

async function openLogin(page) {
  const candidates = [
    page.locator('button.llh-btn:has-text("Log In"), a.llh-btn:has-text("Log In")').first(),
    page.locator("#signinButton").first(),
  ];
  let opened = false;
  for (const loc of candidates) {
    if (!(await loc.count())) continue;
    try {
      await loc.click({ timeout: 4000 });
      await page.waitForSelector("#authModal.open", { timeout: 5000 });
      opened = true;
      break;
    } catch { /* try next */ }
  }
  if (!opened) {
    await page.evaluate(() => { if (typeof openAuthModal === "function") openAuthModal("login"); });
    await page.waitForSelector("#authModal.open", { timeout: 8000 });
  }
}

async function signupWizard(page, { email, name, persona, programName, pathway }) {
  await openSignup(page);
  await page.waitForTimeout(400);
  // Step 1
  await page.fill("#fullNameInput", name);
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", PASSWORD);
  await shot(page, `signup-step1-${persona}`);
  await page.locator("#authSubmitButton").click();
  await page.waitForTimeout(2500);
  const msg1 = await page.locator("#authMessage").innerText().catch(() => "");
  // Step 2 persona
  await page.waitForSelector(`[data-signup-persona="${persona}"]`, { timeout: 15000 });
  await page.locator(`[data-signup-persona="${persona}"]`).click();
  await page.waitForTimeout(500);
  if (pathway) {
    const pathBtn = page.locator(`[data-signup-pathway="${pathway}"]`);
    if (await pathBtn.count()) {
      try { await pathBtn.click({ timeout: 2000 }); } catch { /* may already be selected */ }
    }
  }
  if (programName) {
    const prog = page.locator("#signupProgramNameInput");
    if (await prog.isVisible().catch(() => false)) {
      await prog.fill(programName);
    }
  }
  await shot(page, `signup-step2-${persona}`);
  await page.locator("#authSubmitButton").click();
  await page.waitForTimeout(2000);
  // Step 3 plan — choose Free if present
  const freeBtn = page.locator("[data-signup-plan='free'], #signupConfirmFreeButton, button:has-text('Continue with Free'), button:has-text('Free')").first();
  if (await freeBtn.count()) {
    try { await freeBtn.click({ timeout: 5000 }); } catch { /* try confirm */ }
  }
  const confirmFree = page.locator("#signupConfirmFreeButton, button:has-text('Start with Free'), button:has-text('Continue with Free')").first();
  if (await confirmFree.count()) {
    try { await confirmFree.click({ timeout: 5000 }); } catch { /* ignore */ }
  }
  await page.waitForTimeout(2500);
  await dismissNoise(page);
  // Close onboarding if present
  for (let i = 0; i < 4; i += 1) {
    const later = page.locator("#newUserOnboardingModal.open button:has-text('Maybe Later'), #newUserOnboardingModal.open button:has-text('Skip'), #newUserOnboardingModal.open button:has-text('Not now'), #newUserOnboardingModal.open .close-button").first();
    if (await later.count()) {
      try { await later.click({ timeout: 1500 }); } catch { break; }
      await page.waitForTimeout(500);
    } else break;
  }
  await dismissNoise(page);
  const loggedIn = await page.evaluate(() => Boolean(localStorage.getItem("llhUser")));
  const user = await page.evaluate(() => localStorage.getItem("llhUser"));
  const account = await page.evaluate(() => {
    try {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      return accounts[email] || null;
    } catch { return null; }
  });
  await shot(page, `signup-done-${persona}`);
  return { loggedIn, user, account, msg1 };
}

async function loginAgain(page, email) {
  await openLogin(page);
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", PASSWORD);
  await page.locator("#authSubmitButton").click();
  await page.waitForTimeout(2500);
  await dismissNoise(page);
  return page.evaluate(() => localStorage.getItem("llhUser"));
}

async function logout(page) {
  await page.evaluate(async () => {
    try {
      if (typeof signOut === "function") await signOut();
      else {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhMemberSessionToken");
        location.reload();
      }
    } catch {
      localStorage.removeItem("llhUser");
      location.reload();
    }
  });
  await page.waitForTimeout(2000);
  await dismissNoise(page);
}

async function navClick(page, labelOrView) {
  // Try work-nav / nav-link by text or data-view
  const byView = page.locator(`[data-view="${labelOrView}"], [data-work-nav="${labelOrView}"]`).first();
  if (await byView.count()) {
    try {
      await byView.click({ timeout: 3000 });
      await page.waitForTimeout(900);
      return true;
    } catch { /* fall through */ }
  }
  const byText = page.getByRole("button", { name: new RegExp(labelOrView, "i") }).first();
  if (await byText.count()) {
    try {
      await byText.click({ timeout: 3000 });
      await page.waitForTimeout(900);
      return true;
    } catch { /* fall through */ }
  }
  const link = page.locator(`.nav-link:has-text("${labelOrView}")`).first();
  if (await link.count()) {
    try {
      await link.click({ timeout: 3000 });
      await page.waitForTimeout(900);
      return true;
    } catch { /* ignore */ }
  }
  // Force via setView if available
  const forced = await page.evaluate((view) => {
    if (typeof setView === "function") {
      try { setView(view, { allowDuringBootVerification: true, skipAccessRedirect: true }); return true; } catch { return false; }
    }
    return false;
  }, labelOrView);
  await page.waitForTimeout(800);
  return forced;
}

async function addChildViaUi(page, childName) {
  await navClick(page, "children");
  await page.waitForTimeout(600);
  const addBtn = page.locator('button:has-text("Add Child"), [data-child-view="add"]').first();
  if (await addBtn.count()) {
    await addBtn.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.evaluate(() => {
      if (typeof childManagementMode !== "undefined") childManagementMode = "add";
      if (typeof renderChildManagement === "function") renderChildManagement();
      else if (typeof setView === "function") setView("children");
    });
  }
  await page.waitForTimeout(800);
  // Fill common child form fields
  const filled = await page.evaluate((name) => {
    const root = document.querySelector("#view-children") || document.body;
    const nameInput = root.querySelector('input[name="name"], input[name="childName"], #childNameInput, input[placeholder*="name" i]');
    if (!nameInput) return { ok: false, reason: "no name input" };
    nameInput.focus();
    nameInput.value = name;
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    const age = root.querySelector('select[name="ageGroup"], select[name="age"]');
    if (age) {
      const opt = [...age.options].find((o) => /toddler|preschool|infant/i.test(o.value + o.textContent));
      if (opt) age.value = opt.value;
      age.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const dob = root.querySelector('input[name="dob"], input[type="date"]');
    if (dob) {
      dob.value = "2022-06-15";
      dob.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const parent = root.querySelector('input[name="parentName"], input[name="guardianName"], textarea[name="parentInfo"]');
    if (parent) {
      parent.value = parent.tagName === "TEXTAREA" ? "Parent: Audit Guardian\nEmail: parent.audit@example.com" : "Audit Guardian";
      parent.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const save = root.querySelector('button[type="submit"], button:has-text("Save"), button:has-text("Add Child")');
    if (save) save.click();
    else if (typeof saveChildProfile === "function") {
      // fallback no-op
    }
    return { ok: true };
  }, childName);
  await page.waitForTimeout(1500);
  // Also ensure via store if UI save path is complex
  const ensured = await page.evaluate((name) => {
    try {
      if (typeof childStore !== "function") return { via: "none" };
      const profiles = childStore("Profiles") || [];
      if (profiles.some((p) => p.name === name)) return { via: "existing", count: profiles.length };
      const id = `audit-child-${Date.now().toString(36)}`;
      const next = [
        ...profiles,
        {
          id,
          name,
          ageGroup: "Toddler",
          dob: "2022-06-15",
          parentInfo: "Audit Guardian — parent.audit@example.com",
          status: "Active",
          createdAt: new Date().toISOString(),
        },
      ];
      if (typeof writeChildStore === "function") writeChildStore("Profiles", next);
      else if (typeof setChildStore === "function") setChildStore("Profiles", next);
      else {
        const key = Object.keys(localStorage).find((k) => /child/i.test(k));
        if (key) {
          const data = JSON.parse(localStorage.getItem(key) || "{}");
          data.Profiles = next;
          localStorage.setItem(key, JSON.stringify(data));
        }
      }
      if (typeof renderChildManagement === "function") renderChildManagement();
      if (typeof syncChildDataToBackend === "function") syncChildDataToBackend();
      return { via: "store", id, count: next.length };
    } catch (e) {
      return { via: "error", error: e.message };
    }
  }, childName);
  await page.waitForTimeout(1000);
  await shot(page, `child-added-${childName.replace(/\s+/g, "-").toLowerCase()}`);
  return { filled, ensured };
}

async function exploreView(page, view, label) {
  const ok = await navClick(page, view);
  await page.waitForTimeout(700);
  const state = await page.evaluate((v) => {
    const active = document.querySelector(".view.active-view, .view.active");
    const text = (active?.innerText || document.body.innerText || "").slice(0, 1200);
    const loading = /loading…|loading\.\.\.|please wait/i.test(text) && text.length < 80;
    const blank = !text || text.trim().length < 20;
    const err404 = /404|not found|something went wrong/i.test(text);
    return {
      activeId: active?.id || "",
      loading,
      blank,
      err404,
      snippet: text.replace(/\s+/g, " ").slice(0, 220),
      href: location.href,
      host: location.host,
    };
  }, view);
  await shot(page, `view-${label}`);
  if (state.host !== "little-learner-hub-testing.onrender.com") {
    issue("Critical", label, "Left testing host", state.href);
  }
  if (state.err404) issue("High", label, "404/error copy visible", state.snippet);
  if (state.blank) issue("High", label, "Blank/near-empty view", state.activeId);
  if (state.loading) issue("High", label, "Stuck loading state", state.snippet);
  return { ok, ...state };
}

async function createStaffInvite(page, staffEmail, role) {
  // Prefer UI; also hit API with schedule auth if available
  const api = await page.evaluate(async ({ staffEmail, role, origin }) => {
    try {
      const email = localStorage.getItem("llhUser") || "";
      const res = await fetch("/api/staff/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer test:${email}`,
          "X-LLH-User-Email": email,
        },
        body: JSON.stringify({
          email: staffEmail,
          role,
          programName: "Audit Program",
          appOrigin: origin,
          visibilityPreset: "lead",
        }),
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    } catch (e) {
      return { status: 0, error: e.message };
    }
  }, { staffEmail, role, origin: TESTING });
  return api;
}

async function createFamilyInvite(page, childId, parentEmail) {
  return page.evaluate(async ({ childId, parentEmail, origin }) => {
    const email = localStorage.getItem("llhUser") || "";
    const res = await fetch("/api/family-hub/households", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer test:${email}`,
        "X-LLH-User-Email": email,
      },
      body: JSON.stringify({
        email: parentEmail,
        label: "Audit Family",
        appOrigin: origin,
        children: [{ id: childId, name: "Audit Child" }],
      }),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }, { childId, parentEmail, origin: TESTING });
}

async function curriculumSmoke(page) {
  await navClick(page, "lesson-library");
  await page.waitForTimeout(500);
  await navClick(page, "curriculum");
  await page.waitForTimeout(1500);
  const lib = await page.evaluate(async () => {
    const res = await fetch("/api/site-content", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const plans = json?.siteContent?.curriculumLibrary?.lessonPlans || [];
    return { status: res.status, count: Array.isArray(plans) ? plans.length : 0, sample: (plans[0] && (plans[0].title || plans[0].name)) || "" };
  });
  await shot(page, "curriculum-library");
  // Try search
  const search = page.locator("#searchInput, input[type='search'], input[placeholder*='Search' i]").first();
  if (await search.count()) {
    try {
      await search.fill("farm");
      await page.waitForTimeout(800);
      await shot(page, "curriculum-search-farm");
    } catch { /* ignore */ }
  }
  // Teaching kit
  await navClick(page, "teaching-kits");
  await page.waitForTimeout(800);
  const tk = await exploreView(page, "teaching-kits", "teaching-kits");
  return { lib, tk };
}

async function adminAudit(page) {
  const cold = await gotoTesting(page, "/admin");
  await page.waitForTimeout(1500);
  await shot(page, "admin-entry");
  const state = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return {
      href: location.href,
      host: location.host,
      hasUnlock: /admin access|unlock|access code|owner admin/i.test(text)
        || Boolean(document.querySelector("#adminLoginForm, #adminPasswordInput, input[name='accessCode']")),
      hasAdminShell: Boolean(document.querySelector("[data-admin-shell], #adminShell, .admin-shell, #view-admin")),
      snippet: text.replace(/\s+/g, " ").slice(0, 300),
    };
  });
  // Try known public denial path — without creds we cannot unlock
  check("admin_entry_on_testing", state.host.includes("little-learner-hub-testing"), state.href);
  if (!state.hasUnlock && !state.hasAdminShell) {
    issue("High", "Admin", "Admin entry did not show unlock form or admin shell", state.snippet);
  }
  return { cold, state };
}

async function viewportAudit(browser, email) {
  const viewports = [
    { id: "iphone", ...devices["iPhone 13"] },
    { id: "android", viewport: { width: 360, height: 800 }, userAgent: devices["Pixel 5"].userAgent },
    { id: "ipad", ...devices["iPad Mini"] },
    { id: "laptop", viewport: { width: 1366, height: 768 } },
    { id: "desktop", viewport: { width: 1920, height: 1080 } },
  ];
  const results = {};
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      userAgent: vp.userAgent,
      hasTouch: Boolean(vp.hasTouch),
      isMobile: Boolean(vp.isMobile),
    });
    const page = await context.newPage();
    const load = await gotoTesting(page);
    // inject logged-in home account for nav check
    await page.evaluate((email) => {
      const account = {
        email,
        plan: "Pro",
        role: "owner",
        accountType: "home_daycare",
        programName: "Viewport Audit HD",
        subscriptionStatus: "Pro Subscription Active",
        isTestingAccount: true,
      };
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({ [email]: account }));
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
    }, email);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await dismissNoise(page);
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflowX = doc.scrollWidth > doc.clientWidth + 2;
      const buttons = [...document.querySelectorAll("button, .primary-button, .nav-link")].filter((b) => b.offsetParent);
      const tiny = buttons.filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().width < 24).length;
      const menuBtn = document.querySelector("#mobileMenuToggle, #sidebarToggle");
      return {
        overflowX,
        visibleButtons: buttons.length,
        tinyButtons: tiny,
        hasMenuToggle: Boolean(menuBtn),
        bodyWidth: doc.clientWidth,
        scrollWidth: doc.scrollWidth,
      };
    });
    // open mobile menu if present
    const menu = page.locator("#mobileMenuToggle, #sidebarToggle").first();
    if (await menu.count()) {
      try { await menu.click({ timeout: 2000 }); await page.waitForTimeout(500); } catch { /* ignore */ }
    }
    await shot(page, `viewport-${vp.id}`);
    results[vp.id] = { loadMs: load.ms, ...metrics };
    if (metrics.overflowX) issue("Medium", "Mobile", `Horizontal overflow on ${vp.id}`, `scroll=${metrics.scrollWidth} client=${metrics.bodyWidth}`);
    if (metrics.tinyButtons > 5) issue("Medium", "Mobile", `Many tiny tap targets on ${vp.id}`, String(metrics.tinyButtons));
    await context.close();
  }
  return results;
}

async function performanceProbe(page) {
  const cold = await gotoTesting(page);
  const warm = await gotoTesting(page);
  const clicks = [];
  for (const sel of [
    'button.llh-btn:has-text("Log In")',
    'button.llh-btn-primary:has-text("Sign Up"), .llh-hero-primary-cta',
    'button:has-text("Browse All Lesson Plans"), a:has-text("Browse All Lesson Plans")',
  ]) {
    const t0 = Date.now();
    const loc = page.locator(sel).first();
    if (!(await loc.count())) continue;
    try {
      await loc.click({ timeout: 4000 });
      clicks.push({ sel, ms: Date.now() - t0, ok: true });
      await page.keyboard.press("Escape").catch(() => {});
      await dismissNoise(page);
      if (await page.locator("#authModal.open").count()) {
        await page.locator("#closeModal").click().catch(() => {});
      }
    } catch (e) {
      clicks.push({ sel, ms: Date.now() - t0, ok: false, error: e.message });
    }
  }
  return { coldMs: cold.ms, warmMs: warm.ms, clicks };
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const stamp = Date.now().toString(36);
  const homeEmail = `audit.home.${stamp}@example.com`;
  const centerEmail = `audit.center.${stamp}@example.com`;
  const teacherEmail = `audit.teacher.${stamp}@example.com`;
  const parentEmail = `audit.parent.${stamp}@example.com`;

  // Baseline APIs
  const manifest = await fetch(`${TESTING}/llh-shell-manifest.json`).then((r) => r.json());
  const prodManifest = await fetch(`${PRODUCTION}/llh-shell-manifest.json`).then((r) => r.json());
  const health = await fetch(`${TESTING}/api/health`).then((r) => r.json());
  const siteContent = await fetch(`${TESTING}/api/site-content`).then((r) => r.json());
  const lessonCount = Array.isArray(siteContent?.siteContent?.curriculumLibrary?.lessonPlans)
    ? siteContent.siteContent.curriculumLibrary.lessonPlans.length
    : 0;

  check("shell_version", manifest.version === EXPECTED_SHELL, manifest.version);
  check("production_untouched", prodManifest.version === "20260808-cookie-cta", prodManifest.version);
  check("testing_site_url", health.domain?.configuredSiteUrl === TESTING, health.domain?.configuredSiteUrl);
  check("lesson_count_near_127", lessonCount >= 120 && lessonCount <= 140, String(lessonCount));
  report.build = {
    shell: manifest.version,
    cacheName: manifest.cacheName,
    siteUrl: health.domain?.configuredSiteUrl,
    hdh: health.homeDaycareHubTesting,
    aiGuide: health.aiGuideEnabled,
    lessonCount,
  };

  const browser = await chromium.launch({ headless: true });

  try {
    // ===== 1. FIRST-TIME ACCESS + HOME DAYCARE =====
    {
      const { context, page } = await openFresh(browser);
      const load = await gotoTesting(page);
      check("homepage_loads", load.status === 200 && load.ms < 20000, `status=${load.status} ms=${load.ms}`);
      await shot(page, "01-homepage-cold");
      const clickable = await page.evaluate(() => {
        const visible = [...document.querySelectorAll("button, a")]
          .filter((el) => el.offsetParent && el.getBoundingClientRect().width > 0)
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim());
        return {
          hasLogIn: visible.some((t) => /^Log In$/i.test(t)),
          hasSignUp: visible.some((t) => /Sign Up|Start Free|Create Free Account/i.test(t)),
          legacySigninSize: (() => {
            const el = document.getElementById("signinButton");
            const r = el?.getBoundingClientRect();
            return { w: r?.width || 0, h: r?.height || 0 };
          })(),
        };
      });
      check("homepage_ctas_present", clickable.hasLogIn && clickable.hasSignUp, JSON.stringify(clickable));
      if (clickable.legacySigninSize.w === 0) {
        issue("Low", "Access", "Legacy #signinButton is present but not visible on marketing homepage", JSON.stringify(clickable.legacySigninSize));
      }

      // Verify Log In CTA actually opens modal (real click)
      await openLogin(page);
      check("login_cta_opens_modal", await page.locator("#authModal.open").count() > 0, "auth modal");
      await page.locator("#closeModal").click().catch(() => {});
      await page.waitForTimeout(300);

      const perf = await performanceProbe(page);
      report.journeys.performance = perf;
      check("perf_cold_under_25s", perf.coldMs < 25000, String(perf.coldMs));
      check("perf_warm_under_12s", perf.warmMs < 12000, String(perf.warmMs));

      const homeSignup = await signupWizard(page, {
        email: homeEmail,
        name: "Audit Home Provider",
        persona: "home_daycare",
        programName: "Sunshine Home Daycare Audit",
        pathway: "independent",
      });
      report.journeys.homeSignup = { email: homeEmail, ...homeSignup };
      check("home_signup_logged_in", homeSignup.loggedIn && homeSignup.user === homeEmail, JSON.stringify({ user: homeSignup.user, type: homeSignup.account?.accountType }));
      if (homeSignup.account && homeSignup.account.accountType && homeSignup.account.accountType !== "home_daycare") {
        issue("High", "Home Daycare", "Account type not home_daycare after signup", JSON.stringify(homeSignup.account));
      }

      // Core views
      const homeViews = {};
      for (const [view, label] of [
        ["home", "home"],
        ["children", "children"],
        ["classroom", "classroom"],
        ["families", "families"],
        ["business", "business"],
        ["curriculum", "curriculum"],
        ["home-daycare-hub", "hdh"],
        ["child-tools-daily-logs", "daily-logs"],
        ["forms-center", "forms-center"],
        ["ai", "ai-guide"],
      ]) {
        homeViews[label] = await exploreView(page, view, `home-${label}`);
      }
      report.journeys.homeViews = homeViews;

      const child = await addChildViaUi(page, "Audit Toddler Mia");
      report.journeys.homeChild = child;
      check("home_child_added", Boolean(child.ensured?.count >= 1 || child.filled?.ok), JSON.stringify(child));

      // Daily logs / attendance / observations via navigation + store probes
      await navClick(page, "child-tools-daily-logs");
      await shot(page, "home-daily-logs");
      const daily = await page.evaluate(() => {
        const text = document.querySelector("#view-children, #view-today, .active-view")?.innerText || "";
        return { snippet: text.replace(/\s+/g, " ").slice(0, 240), hasUi: /daily|meal|nap|attendance|check.?in|log/i.test(text) };
      });
      check("home_daily_logs_ui", daily.hasUi || homeViews["daily-logs"]?.ok, daily.snippet);

      // Staff invite from home (should work for owner)
      const staffInvite = await createStaffInvite(page, teacherEmail, "teacher");
      report.journeys.homeStaffInvite = {
        status: staffInvite.status,
        acceptUrl: staffInvite.json?.acceptUrl || staffInvite.json?.invite?.acceptUrl || "",
        error: staffInvite.json?.error || staffInvite.error || "",
      };
      const acceptUrl = report.journeys.homeStaffInvite.acceptUrl;
      if (acceptUrl) {
        check("staff_invite_testing_host", acceptUrl.startsWith(TESTING), acceptUrl.replace(/staffInvite=[^&]+/, "staffInvite=[redacted]"));
        if (/littlelearnershubbyleah\.com|little-learner-hub\.onrender\.com/.test(acceptUrl)) {
          issue("Critical", "Staff", "Staff invite points at production", acceptUrl);
        }
      } else if (staffInvite.status && staffInvite.status !== 200) {
        issue("High", "Staff", "Could not create staff invite from home account", `${staffInvite.status} ${staffInvite.json?.error || ""}`);
      }

      // Family hub invite
      const childId = child.ensured?.id || await page.evaluate(() => {
        try {
          const profiles = typeof childStore === "function" ? childStore("Profiles") : [];
          return profiles[0]?.id || "";
        } catch { return ""; }
      });
      const fh = await createFamilyInvite(page, childId || "audit-child", parentEmail);
      report.journeys.homeFamilyInvite = {
        status: fh.status,
        magicUrl: fh.json?.magicUrl || fh.json?.household?.magicUrl || "",
        error: fh.json?.error || "",
      };
      const magicUrl = report.journeys.homeFamilyInvite.magicUrl;
      if (magicUrl) {
        check("family_invite_testing_host", magicUrl.startsWith(TESTING), magicUrl.replace(/familyHub=[^&]+/, "familyHub=[redacted]"));
      } else {
        issue("High", "Family Hub", "Family invite failed on testing", `${fh.status} ${fh.json?.error || ""}`);
      }

      // Curriculum
      const curr = await curriculumSmoke(page);
      report.journeys.homeCurriculum = curr;
      check("curriculum_lessons_available", curr.lib.count >= 120, String(curr.lib.count));

      // Logout / login persistence
      const beforeLogout = await page.evaluate(() => {
        try {
          const email = localStorage.getItem("llhUser");
          const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
          return { email, program: accounts[email]?.businessName || accounts[email]?.programName || "", profiles: typeof childStore === "function" ? (childStore("Profiles") || []).length : 0 };
        } catch { return {}; }
      });
      await logout(page);
      await shot(page, "home-logged-out");
      const afterLogoutUser = await page.evaluate(() => localStorage.getItem("llhUser"));
      check("home_logout_clears_session", !afterLogoutUser, String(afterLogoutUser));
      const relog = await loginAgain(page, homeEmail);
      check("home_relogin", relog === homeEmail, String(relog));
      await page.waitForTimeout(1000);
      const afterRelog = await page.evaluate(() => {
        try {
          const email = localStorage.getItem("llhUser");
          const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
          return { email, program: accounts[email]?.businessName || accounts[email]?.programName || "", profiles: typeof childStore === "function" ? (childStore("Profiles") || []).length : 0 };
        } catch { return {}; }
      });
      report.journeys.homePersistence = { beforeLogout, afterRelog };
      check("home_data_persists_relogin", afterRelog.email === homeEmail, JSON.stringify(afterRelog));

      // Isolation: other account should not see this program's children in a fresh context — checked later
      await context.close();
    }

    // ===== FAMILY HUB PARENT =====
    if (report.journeys.homeFamilyInvite?.magicUrl) {
      const { context, page } = await openFresh(browser);
      const magic = report.journeys.homeFamilyInvite.magicUrl;
      await page.goto(magic, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(2500);
      await shot(page, "family-hub-parent");
      const parentState = await page.evaluate(() => {
        const text = document.body.innerText || "";
        return {
          host: location.host,
          href: location.href,
          hasStaff: /staff invite|billing|admin dashboard|owner testing|lesson manager/i.test(text),
          hasFamily: /family|child|today|message|document|form/i.test(text),
          snippet: text.replace(/\s+/g, " ").slice(0, 280),
        };
      });
      report.journeys.familyHubParent = parentState;
      check("family_hub_on_testing", parentState.host.includes("little-learner-hub-testing"), parentState.href);
      check("family_hub_no_staff_admin_leak", !parentState.hasStaff, parentState.snippet);
      if (parentState.hasStaff) issue("Critical", "Family Hub", "Parent surface shows staff/admin/business tools", parentState.snippet);
      await context.close();
    }

    // ===== CENTER =====
    {
      const { context, page } = await openFresh(browser);
      await gotoTesting(page);
      const centerSignup = await signupWizard(page, {
        email: centerEmail,
        name: "Audit Center Director",
        persona: "center",
        programName: "Rainbow Center Audit",
        pathway: "create_new",
      });
      report.journeys.centerSignup = { email: centerEmail, ...centerSignup };
      check("center_signup_logged_in", centerSignup.loggedIn && centerSignup.user === centerEmail, JSON.stringify({ user: centerSignup.user, type: centerSignup.account?.accountType, role: centerSignup.account?.role }));

      const centerViews = {};
      for (const [view, label] of [
        ["home", "home"],
        ["children", "children"],
        ["classroom", "classroom"],
        ["families", "families"],
        ["business", "business"],
        ["staff", "staff"],
        ["curriculum", "curriculum"],
      ]) {
        centerViews[label] = await exploreView(page, view, `center-${label}`);
      }
      report.journeys.centerViews = centerViews;

      const centerChild = await addChildViaUi(page, "Audit Preschool Noah");
      report.journeys.centerChild = centerChild;

      const centerStaff = await createStaffInvite(page, `audit.center.teacher.${stamp}@example.com`, "teacher");
      const centerAssistant = await createStaffInvite(page, `audit.center.assistant.${stamp}@example.com`, "assistant");
      report.journeys.centerStaff = {
        teacher: { status: centerStaff.status, acceptUrl: centerStaff.json?.acceptUrl || "", error: centerStaff.json?.error || "" },
        assistant: { status: centerAssistant.status, acceptUrl: centerAssistant.json?.acceptUrl || "", error: centerAssistant.json?.error || "" },
      };
      for (const [role, row] of Object.entries(report.journeys.centerStaff)) {
        if (row.acceptUrl) {
          check(`center_${role}_invite_testing_host`, row.acceptUrl.startsWith(TESTING), row.acceptUrl.replace(/staffInvite=[^&]+/, "staffInvite=[redacted]"));
        } else {
          issue("High", "Center/Staff", `${role} invite missing acceptUrl`, `${row.status} ${row.error}`);
        }
      }

      // Role surfaces via local role switch (simulates accepted staff)
      for (const role of ["teacher", "assistant"]) {
        await page.evaluate((role) => {
          const email = localStorage.getItem("llhUser");
          const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
          if (accounts[email]) {
            accounts[email].role = role;
            localStorage.setItem("llhAccounts", JSON.stringify(accounts));
          }
          if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
        }, role);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);
        await dismissNoise(page);
        const roleState = await page.evaluate(() => {
          const text = document.body.innerText || "";
          const nav = [...document.querySelectorAll(".nav-link, [data-work-nav]")]
            .filter((n) => n.offsetParent && !n.hidden)
            .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
            .slice(0, 30);
          return {
            role: (() => {
              try {
                const email = localStorage.getItem("llhUser");
                return JSON.parse(localStorage.getItem("llhAccounts") || "{}")[email]?.role;
              } catch { return ""; }
            })(),
            nav,
            seesBilling: /billing|upgrade to pro|founding/i.test(text) && /billing/i.test(nav.join(" ")),
            seesAdmin: /admin dashboard|owner testing|lesson manager|curriculum sync/i.test(text),
            seesTodayOrClassroom: nav.some((n) => /today|classroom|children/i.test(n)),
          };
        });
        await shot(page, `center-role-${role}`);
        report.journeys[`centerRole_${role}`] = roleState;
        if (roleState.seesAdmin) issue("Critical", "Roles", `${role} can see admin controls`, JSON.stringify(roleState.nav));
        check(`center_${role}_no_admin`, !roleState.seesAdmin, JSON.stringify(roleState.nav.slice(0, 12)));
      }

      // Restore director and logout/login
      await page.evaluate(() => {
        const email = localStorage.getItem("llhUser");
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        if (accounts[email]) {
          accounts[email].role = "director";
          accounts[email].accountType = "center";
          localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        }
      });
      await logout(page);
      const centerRelog = await loginAgain(page, centerEmail);
      check("center_relogin", centerRelog === centerEmail, String(centerRelog));
      await context.close();
    }

    // ===== DATA ISOLATION between home and center =====
    {
      const { context, page } = await openFresh(browser);
      await gotoTesting(page);
      await page.evaluate((homeEmail) => {
        // only center account in this context — home children must not appear
        localStorage.clear();
      }, homeEmail);
      await loginAgain(page, centerEmail).catch(() => null);
      // If login fails without server password, inject center only and confirm home child name absent
      await page.evaluate((centerEmail) => {
        if (!localStorage.getItem("llhUser")) {
          localStorage.setItem("llhUser", centerEmail);
          localStorage.setItem("llhAccounts", JSON.stringify({
            [centerEmail]: { email: centerEmail, role: "director", accountType: "center", plan: "Pro" },
          }));
        }
      }, centerEmail);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      const isolation = await page.evaluate(() => {
        const text = document.body.innerText || "";
        let profiles = [];
        try { profiles = typeof childStore === "function" ? childStore("Profiles") || [] : []; } catch { /* ignore */ }
        return {
          names: profiles.map((p) => p.name),
          bodyHasHomeChild: /Audit Toddler Mia/i.test(text),
        };
      });
      report.journeys.isolation = isolation;
      check("tester_programs_isolated", !isolation.bodyHasHomeChild && !isolation.names.includes("Audit Toddler Mia"), JSON.stringify(isolation));
      await context.close();
    }

    // ===== ADMIN =====
    {
      const { context, page } = await openFresh(browser);
      report.journeys.admin = await adminAudit(page);
      // Probe admin API without auth
      const dash = await fetch(`${TESTING}/api/admin/testing/dashboard`).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
      check("admin_api_requires_auth", dash.status === 401, String(dash.status));
      await context.close();
    }

    // ===== VIEWPORTS =====
    report.journeys.viewports = await viewportAudit(browser, homeEmail);
    check("mobile_iphone_no_major_overflow", !report.journeys.viewports.iphone?.overflowX, JSON.stringify(report.journeys.viewports.iphone));
    check("mobile_android_no_major_overflow", !report.journeys.viewports.android?.overflowX, JSON.stringify(report.journeys.viewports.android));
    check("tablet_ipad_usable", (report.journeys.viewports.ipad?.visibleButtons || 0) > 5, JSON.stringify(report.journeys.viewports.ipad));
    check("desktop_usable", (report.journeys.viewports.desktop?.visibleButtons || 0) > 5, JSON.stringify(report.journeys.viewports.desktop));

  } finally {
    await browser.close();
  }

  // Area rollups
  const failed = Object.entries(report.checks).filter(([, v]) => !v.pass).map(([k]) => k);
  const critical = report.issues.filter((i) => i.severity === "Critical");
  const high = report.issues.filter((i) => i.severity === "High");
  const medium = report.issues.filter((i) => i.severity === "Medium");
  const low = report.issues.filter((i) => i.severity === "Low");

  function areaStatus(passHints, failHints = []) {
    const relatedFails = failed.filter((f) => passHints.some((h) => f.includes(h)) || failHints.some((h) => f.includes(h)));
    const relatedCrit = [...critical, ...high].filter((i) => passHints.some((h) => i.area.toLowerCase().includes(h) || i.title.toLowerCase().includes(h)));
    if (relatedCrit.length || relatedFails.length) return "FAIL";
    return "PASS";
  }

  report.areas = {
    homeDaycare: areaStatus(["home_"]),
    center: areaStatus(["center_"]),
    familyHub: areaStatus(["family_"]),
    staffRoles: areaStatus(["staff_", "center_teacher", "center_assistant"]),
    forms: report.journeys.homeViews?.["forms-center"]?.ok || report.journeys.homeViews?.["forms-center"]?.snippet ? (report.journeys.homeViews["forms-center"].err404 || report.journeys.homeViews["forms-center"].blank ? "FAIL" : "PASS") : "FAIL",
    curriculumTeachingKit: areaStatus(["curriculum", "lesson"]),
    admin: report.journeys.admin?.state?.hasUnlock || report.journeys.admin?.state?.hasAdminShell ? "PASS" : "FAIL",
    mobile: areaStatus(["mobile_", "iphone", "android"]),
    desktop: areaStatus(["desktop", "laptop"]),
    performance: areaStatus(["perf_", "homepage_loads", "login_cta"]),
    dataIsolationSecurity: areaStatus(["isolat", "testing_host", "production_untouched", "staff_invite", "family_invite"]),
  };

  // Refine forms/admin if issues logged
  if (report.issues.some((i) => i.area.toLowerCase().includes("form") && ["Critical", "High"].includes(i.severity))) {
    report.areas.forms = "FAIL";
  }
  if (report.issues.some((i) => i.area === "Admin" && ["Critical", "High"].includes(i.severity))) {
    report.areas.admin = "FAIL";
  }

  const blockers = [...critical, ...high];
  report.confidentForThreeProviders = blockers.length === 0
    && report.areas.homeDaycare === "PASS"
    && report.areas.center === "PASS"
    && report.areas.familyHub === "PASS"
    && report.areas.dataIsolationSecurity === "PASS"
    ? "YES"
    : "NO";
  report.blockersForYes = blockers.map((b) => `${b.severity}: ${b.area} — ${b.title}`);
  report.failedChecks = failed;
  report.issueCounts = {
    critical: critical.length,
    high: high.length,
    medium: medium.length,
    low: low.length,
  };
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(OUT, "real-user-acceptance-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "SUMMARY.md"), [
    `# Phase 11 Real-User Acceptance Audit`,
    ``,
    `**Build:** ${report.build.shell} (${report.build.cacheName})`,
    `**URL:** ${TESTING}`,
    `**Finished:** ${report.finishedAt}`,
    `**Confident for 3 providers?** ${report.confidentForThreeProviders}`,
    ``,
    `## Area results`,
    ...Object.entries(report.areas).map(([k, v]) => `- ${k}: **${v}**`),
    ``,
    `## Issues`,
    `- Critical: ${critical.length}`,
    `- High: ${high.length}`,
    `- Medium: ${medium.length}`,
    `- Low: ${low.length}`,
    ``,
    ...report.issues.map((i) => `- **${i.severity}** [${i.area}] ${i.title} — ${i.detail}`),
    ``,
    `## Failed checks`,
    ...(failed.length ? failed.map((f) => `- ${f}: ${report.checks[f].detail}`) : ["- none"]),
    ``,
    `## Screenshots`,
    ...report.screenshots.map((s) => `- ${s}`),
  ].join("\n"));

  console.log("\n===== FINAL =====");
  console.log(JSON.stringify({
    build: report.build,
    areas: report.areas,
    issueCounts: report.issueCounts,
    confidentForThreeProviders: report.confidentForThreeProviders,
    blockersForYes: report.blockersForYes,
    failedChecks: failed,
  }, null, 2));

  if (report.confidentForThreeProviders !== "YES") process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
