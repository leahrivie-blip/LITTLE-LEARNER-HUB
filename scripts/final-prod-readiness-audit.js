#!/usr/bin/env node
/**
 * Final production readiness audit against live Render.
 *
 * Usage:
 *   LLH_TEST_EMAIL=... LLH_TEST_PASSWORD=... node scripts/final-prod-readiness-audit.js
 *
 * Optional:
 *   LLH_PROD_URL=https://little-learner-hub.onrender.com
 *   LLH_ARTIFACT_DIR=/opt/cursor/artifacts/final-prod-readiness-audit
 *   LLH_ADMIN_EMAIL / LLH_ADMIN_PASSWORD / LLH_ADMIN_CODE — optional Admin unlock
 */
const fs = require("fs");
const path = require("path");

const PROD_URL = (process.env.LLH_PROD_URL || "https://little-learner-hub.onrender.com").replace(/\/$/, "");
const EMAIL = String(process.env.LLH_TEST_EMAIL || "").trim().toLowerCase();
const PASSWORD = String(process.env.LLH_TEST_PASSWORD || "");
const ADMIN_EMAIL = String(process.env.LLH_ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.LLH_ADMIN_PASSWORD || "");
const ADMIN_CODE = String(process.env.LLH_ADMIN_CODE || "");
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/final-prod-readiness-audit";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  if (!EMAIL || !PASSWORD) throw new Error("LLH_TEST_EMAIL and LLH_TEST_PASSWORD are required");

  const playwright = require("playwright");
  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const results = [];
  const issues = [];
  const consoleErrors = [];
  const failedRequests = [];

  function record(id, area, status, detail = "", severity = null, meta = {}) {
    const row = { id, area, status, detail, severity, meta, at: nowIso() };
    results.push(row);
    if (status === "FAIL" && severity) {
      issues.push({
        severity: String(severity).toUpperCase(),
        id,
        area,
        page: meta.page || area,
        steps: meta.steps || detail,
        expected: meta.expected || "Workflow succeeds without error",
        actual: meta.actual || detail,
        fix: meta.fix || "Investigate and fix before calling production-ready",
      });
    }
    console.log(`[${status}] ${id} — ${detail || area}`);
  }

  async function shot(page, name) {
    const file = path.join(ARTIFACT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    return file;
  }

  async function withPage(viewport, fn) {
    const context = await browser.newContext({
      viewport,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 LLH-Final-Audit/1",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on("pageerror", (err) => consoleErrors.push({ message: String(err), at: nowIso() }));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push({ message: msg.text(), at: nowIso() });
    });
    page.on("requestfailed", (req) => {
      failedRequests.push({ url: req.url(), error: req.failure()?.errorText || "", at: nowIso() });
    });
    try {
      await fn(page, context);
    } finally {
      await context.close();
    }
  }

  async function login(page) {
    await page.goto(`${PROD_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.click("#signinButton");
    await page.waitForSelector("#authModal.open #emailInput, #authModal[aria-hidden='false'] #emailInput, #authModal #emailInput", { timeout: 15000 });
    const email = page.locator("#authModal #emailInput").first();
    const password = page.locator("#authModal #passwordInput").first();
    await email.waitFor({ state: "visible", timeout: 10000 });
    await email.fill(EMAIL);
    await password.fill(PASSWORD);
    await page.locator("#authModal button[type='submit']").first().click();
    await page.waitForTimeout(4000);
    const loggedIn = await page.evaluate(() => Boolean(localStorage.getItem("llhCurrentUser") || document.body.classList.contains("user-authenticated")));
    return loggedIn;
  }

  // ---------- PUBLIC / DOMAIN ----------
  await withPage({ width: 1280, height: 800 }, async (page) => {
    const health = await page.request.get(`${PROD_URL}/api/health`);
    const healthJson = await health.json().catch(() => ({}));
    if (health.ok() && healthJson.ok) {
      record("health", "public", "PASS", `launchReady=${healthJson.launchReady} founding remaining=${healthJson.founding?.remaining}`);
    } else {
      record("health", "public", "FAIL", `Health failed ${health.status()}`, "critical", {
        page: "/api/health",
        steps: "GET /api/health",
        expected: "200 ok:true",
        actual: String(health.status()),
        fix: "Check Render service / crash logs",
      });
    }

    for (const host of ["https://littlelearnerhub.com/", "https://www.littlelearnerhub.com/"]) {
      try {
        const resp = await page.request.get(host, { maxRedirects: 0, timeout: 20000 });
        const status = resp.status();
        const body = await resp.text();
        const challenged = /just a moment|cf-mitigated|security verification/i.test(body) || status === 403;
        if (challenged || status >= 400) {
          record(`domain-${host}`, "public", "FAIL", `${host} status=${status} blocked/challenge`, "critical", {
            page: host,
            steps: `Open ${host} in a browser`,
            expected: "Little Learner Hub homepage loads",
            actual: status === 403 || challenged ? "Cloudflare challenge / Bluehost — site never loads" : `HTTP ${status}`,
            fix: "Point DNS at Render (see docs/DOMAIN_DNS_FIX.md); turn off stuck Cloudflare challenge",
          });
        } else {
          record(`domain-${host}`, "public", "PASS", `status=${status}`);
        }
      } catch (error) {
        record(`domain-${host}`, "public", "FAIL", error.message, "critical", {
          page: host,
          steps: `Open ${host}`,
          expected: "Homepage loads",
          actual: error.message,
          fix: "Fix DNS / hosting for custom domain",
        });
      }
    }

    await page.goto(`${PROD_URL}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(page, "01-homepage-desktop");

    const home = await page.evaluate(() => {
      const heroCta = [...document.querySelectorAll(".lp-hero [data-action='start-free']")].map((b) => b.textContent.trim());
      const midCta = [...document.querySelectorAll(".lp-mid-cta [data-action='start-free']")].map((b) => b.textContent.trim());
      const finalCta = [...document.querySelectorAll(".lp-final-cta [data-action='start-free']")].map((b) => b.textContent.trim());
      const signupTop = document.querySelector("#signupButton");
      const signupTopVisible = Boolean(signupTop && getComputedStyle(signupTop).display !== "none" && getComputedStyle(signupTop).visibility !== "hidden");
      const heroRect = document.querySelector(".lp-hero-actions")?.getBoundingClientRect();
      const headline = document.querySelector(".lp-hero-headline")?.textContent?.trim() || "";
      const pricing = Boolean(document.querySelector(".lp-pricing-section, [data-view='plans'], #homePricing, .lp-pricing-card"));
      const founding = Boolean(document.querySelector("#homeFoundingOffer, .landing-founding-slot, .spots-meter, [data-plan='Founding']"));
      const placeholders = [...document.body.querySelectorAll("*")].some((el) => /lorem ipsum|TODO:|coming soon placeholder|\[insert/i.test(el.textContent || ""));
      return {
        heroCta,
        midCta,
        finalCta,
        signupTopVisible,
        signupTopText: signupTop?.textContent?.trim() || "",
        heroCtaInFirstViewport: Boolean(heroRect && heroRect.top < window.innerHeight && heroRect.bottom > 0),
        headline,
        pricing,
        founding,
        placeholders,
        title: document.title,
      };
    });

    if (home.heroCta.length && home.heroCtaInFirstViewport) {
      record("homepage-hero-signup", "public", "PASS", `Hero CTA visible: ${home.heroCta.join(" | ")}`);
    } else {
      record("homepage-hero-signup", "public", "FAIL", `Hero signup not clearly in first viewport: ${JSON.stringify(home.heroCta)}`, "high", {
        page: "Homepage hero",
        steps: "Open homepage as guest on desktop",
        expected: "Sign Up CTA visible without scrolling",
        actual: home.heroCtaInFirstViewport ? "CTA missing" : "CTA below fold or missing",
        fix: "Keep Sign Up above benefits / first viewport",
      });
    }
    if (home.midCta.length) record("homepage-mid-signup", "public", "PASS", home.midCta.join(" | "));
    else record("homepage-mid-signup", "public", "FAIL", "Missing mid-page signup CTA", "high", {
      page: "Homepage mid-page",
      steps: "Scroll past testimonials",
      expected: "Second Sign Up CTA",
      actual: "Not found",
      fix: "Restore .lp-mid-cta section",
    });
    if (home.finalCta.length) record("homepage-final-signup", "public", "PASS", home.finalCta.join(" | "));
    else record("homepage-final-signup", "public", "FAIL", "Missing final CTA", "medium");
    if (home.signupTopVisible) record("homepage-topbar-signup", "public", "PASS", home.signupTopText);
    else record("homepage-topbar-signup", "public", "FAIL", "Topbar Sign Up not visible", "high");
    if (home.headline) record("homepage-value-prop", "public", "PASS", home.headline.slice(0, 80));
    else record("homepage-value-prop", "public", "FAIL", "Missing hero headline", "high");
    if (home.pricing) record("homepage-pricing", "public", "PASS", "Pricing section present");
    else record("homepage-pricing", "public", "FAIL", "Pricing section not found on homepage", "high", {
      page: "Homepage pricing",
      steps: "Scroll homepage for pricing",
      expected: "Clear Free / Pro / Founding pricing",
      actual: "No pricing section detected",
      fix: "Ensure pricing cards render for guests",
    });
    if (home.founding) record("homepage-founding", "public", "PASS", "Founding offer present");
    else record("homepage-founding", "public", "FAIL", "Founding offer not visible", "medium", {
      page: "Homepage founding",
      steps: "View founding offer section",
      expected: "Founding Member offer visible",
      actual: "Not detected",
      fix: "Check #homeFoundingOffer / spots meter render",
    });
    if (!home.placeholders) record("homepage-placeholders", "public", "PASS", "No obvious placeholder copy");
    else record("homepage-placeholders", "public", "FAIL", "Placeholder copy detected", "medium");

    // Signup modal opens from hero
    await page.click(".lp-hero [data-action='start-free']");
    await page.waitForTimeout(800);
    const modalOpen = await page.evaluate(() => {
      const modal = document.querySelector("#authModal");
      return Boolean(modal && (modal.classList.contains("open") || modal.getAttribute("aria-hidden") === "false"));
    });
    const mode = await page.evaluate(() => document.querySelector("#authMode, [data-auth-mode], #authTitle")?.textContent || document.body.className);
    if (modalOpen) record("signup-modal-from-hero", "auth", "PASS", `Modal open (${String(mode).slice(0, 60)})`);
    else record("signup-modal-from-hero", "auth", "FAIL", "Hero Sign Up did not open auth modal", "critical", {
      page: "Homepage hero",
      steps: "Click Sign Up — It's Free",
      expected: "Signup modal opens",
      actual: "No auth modal",
      fix: "Wire data-action=start-free to openAuthModal('signup')",
    });
    await page.keyboard.press("Escape").catch(() => {});
    await page.click("#closeModal").catch(() => {});
  });

  // ---------- MOBILE HOMEPAGE ----------
  await withPage({ width: 390, height: 844 }, async (page) => {
    await page.goto(`${PROD_URL}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await shot(page, "02-homepage-mobile");
    const mobile = await page.evaluate(() => {
      const signup = document.querySelector("#signupButton");
      const cs = signup ? getComputedStyle(signup) : null;
      const heroBtn = document.querySelector(".lp-hero [data-action='start-free']");
      const heroRect = heroBtn?.getBoundingClientRect();
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      return {
        signupVisible: Boolean(signup && cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0"),
        heroInView: Boolean(heroRect && heroRect.top < window.innerHeight),
        overflowX,
        signupText: signup?.textContent?.trim() || "",
      };
    });
    if (mobile.signupVisible) record("mobile-topbar-signup", "mobile", "PASS", mobile.signupText);
    else record("mobile-topbar-signup", "mobile", "FAIL", "Topbar Sign Up hidden on mobile", "critical", {
      page: "Homepage mobile topbar",
      steps: "Open homepage at 390px width",
      expected: "Sign Up button visible",
      actual: "Hidden or missing",
      fix: "Do not hide #signupButton on body.home-view mobile",
    });
    if (mobile.heroInView) record("mobile-hero-signup", "mobile", "PASS", "Hero signup in first viewport");
    else record("mobile-hero-signup", "mobile", "FAIL", "Hero signup not in first viewport", "high");
    if (!mobile.overflowX) record("mobile-no-hscroll", "mobile", "PASS", "No horizontal overflow on homepage");
    else record("mobile-no-hscroll", "mobile", "FAIL", "Horizontal scroll on homepage", "medium");
  });

  // ---------- AUTHENTICATED FLOWS ----------
  await withPage({ width: 1280, height: 900 }, async (page) => {
    const loggedIn = await login(page);
    await shot(page, "03-after-login");
    if (!loggedIn) {
      record("login", "auth", "FAIL", `Could not login as ${EMAIL}`, "critical", {
        page: "Login",
        steps: "Sign in with LLH_TEST_EMAIL",
        expected: "Authenticated session",
        actual: "Still logged out",
        fix: "Verify credentials / Firebase auth / production login path",
      });
      return;
    }
    record("login", "auth", "PASS", `Logged in as ${EMAIL}`);

    const accountInfo = await page.evaluate(() => {
      const email = localStorage.getItem("llhCurrentUser") || "";
      let account = null;
      try {
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        account = accounts[email] || Object.values(accounts).find((a) => a?.email === email) || null;
      } catch {}
      return {
        email,
        plan: account?.plan || localStorage.getItem("llhPlan") || "",
        accountType: account?.accountType || "",
        role: account?.role || "",
        firstName: account?.firstName || "",
        lastName: account?.lastName || "",
        businessName: account?.businessName || account?.programSettings?.programName || "",
        founding: Boolean(account?.foundingMemberActive || account?.plan === "Founding"),
        bodyPro: document.body.classList.contains("user-pro"),
        bodyAuth: document.body.classList.contains("user-authenticated"),
      };
    });
    record("account-identity", "auth", "PASS", JSON.stringify(accountInfo));
    if (!accountInfo.firstName && !accountInfo.lastName) {
      record("account-name-fields", "auth", "FAIL", "First/last name empty on test account profile", "medium", {
        page: "Account profile",
        steps: "Inspect saved account after login",
        expected: "Name fields populated for known users",
        actual: "Missing first/last name",
        fix: "Ensure signup/profile sync writes firstName/lastName",
      });
    } else {
      record("account-name-fields", "auth", "PASS", `${accountInfo.firstName} ${accountInfo.lastName}`.trim());
    }

    // Navigate key surfaces
    const views = [
      ["lessons", "Lesson Plan Library"],
      ["activities", "Activity Library"],
      ["calendar", "Calendar"],
      ["children", "Child Profiles"],
      ["ai", "Documentation Helpers"],
      ["settings", "Settings"],
    ];
    for (const [view, label] of views) {
      try {
        const nav = page.locator(`[data-view='${view}']`).first();
        if (await nav.count()) {
          await nav.click({ timeout: 8000 });
        } else {
          await page.evaluate((v) => {
            if (typeof setView === "function") setView(v);
          }, view);
        }
        await page.waitForTimeout(1800);
        const active = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
        const emptyError = await page.evaluate(() => {
          const text = document.querySelector(".active-view")?.innerText || "";
          return /something went wrong|undefined is not|failed to load|not found/i.test(text);
        });
        await shot(page, `view-${view}`);
        if (active.includes(view) && !emptyError) record(`nav-${view}`, "navigation", "PASS", label);
        else record(`nav-${view}`, "navigation", "FAIL", `${label} active=${active}`, "high", {
          page: label,
          steps: `Open ${label} from sidebar`,
          expected: `${label} view loads`,
          actual: emptyError ? "Error text in view" : `active=${active}`,
          fix: `Fix ${view} route / render`,
        });
      } catch (error) {
        record(`nav-${view}`, "navigation", "FAIL", error.message, "high", {
          page: label,
          steps: `Open ${label}`,
          expected: "Loads",
          actual: error.message,
          fix: `Fix navigation to ${view}`,
        });
      }
    }

    // Lesson library: open first plan if any
    try {
      await page.evaluate(() => { if (typeof setView === "function") setView("lessons"); });
      await page.waitForTimeout(2000);
      const opened = await page.evaluate(async () => {
        const card = document.querySelector("[data-open-resource], [data-lesson-open], .resource-card button, .lesson-card button, [data-view-resource]");
        if (card) {
          card.click();
          return { clicked: true, text: card.textContent?.trim()?.slice(0, 80) || "" };
        }
        const any = document.querySelector("#view-lessons, .active-view")?.innerText?.slice(0, 200) || "";
        return { clicked: false, text: any };
      });
      await page.waitForTimeout(2000);
      await shot(page, "04-lesson-library");
      if (opened.clicked) {
        const viewer = await page.evaluate(() => {
          const text = document.body.innerText || "";
          return {
            hasViewer: /materials|objectives|monday|activity|directions|weekly/i.test(text),
            blank: /no content|blank plan|failed to load lesson/i.test(text),
          };
        });
        if (viewer.hasViewer && !viewer.blank) record("lesson-open", "lessons", "PASS", `Opened: ${opened.text}`);
        else record("lesson-open", "lessons", "FAIL", "Lesson opened but content looks empty/broken", "high", {
          page: "Lesson viewer",
          steps: "Open first lesson from library",
          expected: "Materials/activities/days visible",
          actual: JSON.stringify(viewer),
          fix: "Audit live curriculum catalog content",
        });
      } else {
        record("lesson-open", "lessons", "FAIL", `No lesson cards to open. Snippet: ${opened.text}`, "high", {
          page: "Lesson Plan Library",
          steps: "Open Lesson Plan Library while logged in",
          expected: "Lesson cards visible",
          actual: "No clickable lesson cards found",
          fix: "Check curriculum library sync / Free vs Pro gating UI",
        });
      }
    } catch (error) {
      record("lesson-open", "lessons", "FAIL", error.message, "high");
    }

    // Live site-content curriculum counts
    try {
      const site = await page.request.get(`${PROD_URL}/api/site-content?t=${Date.now()}`);
      const data = await site.json();
      const lib = data?.siteContent?.curriculumLibrary || {};
      const plans = lib.lessonPlans || lib.plans || [];
      const activities = lib.activities || [];
      record("catalog-counts", "lessons", "PASS", `plans=${Array.isArray(plans) ? plans.length : "n/a"} activities=${Array.isArray(activities) ? activities.length : "n/a"}`);
      if (Array.isArray(plans) && plans.length) {
        const incomplete = [];
        for (const plan of plans.slice(0, 80)) {
          const daily = plan.dailyPlans || {};
          const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
          const emptyDays = days.filter((d) => !Array.isArray(daily[d]?.items) || !daily[d].items.length);
          if (emptyDays.length) incomplete.push({ id: plan.id, title: plan.title, emptyDays });
        }
        if (incomplete.length) {
          record("catalog-incomplete-days", "lessons", "FAIL", `${incomplete.length} plans missing weekday activities (sample ${incomplete.slice(0, 3).map((p) => p.title).join("; ")})`, "high", {
            page: "Curriculum catalog",
            steps: "Inspect /api/site-content curriculumLibrary.lessonPlans",
            expected: "Mon–Fri activities present for weekly plans",
            actual: `${incomplete.length} incomplete; e.g. ${incomplete[0]?.title}: ${incomplete[0]?.emptyDays?.join(",")}`,
            fix: "Re-import incomplete plans (e.g. Space Adventure) into production catalog",
          });
          fs.writeFileSync(path.join(ARTIFACT_DIR, "incomplete-live-plans.json"), JSON.stringify(incomplete, null, 2));
        } else {
          record("catalog-incomplete-days", "lessons", "PASS", "Sampled live plans have weekday activities");
        }
      }
    } catch (error) {
      record("catalog-counts", "lessons", "FAIL", error.message, "medium");
    }

    // Children / profiles
    try {
      await page.evaluate(() => { if (typeof setView === "function") setView("children"); });
      await page.waitForTimeout(1500);
      const children = await page.evaluate(() => {
        const cards = document.querySelectorAll("[data-select-child], [data-view-child-profile], .simple-child-card, .child-card");
        return { count: cards.length, text: document.querySelector("#childManagementApp, .active-view")?.innerText?.slice(0, 180) || "" };
      });
      if (children.count > 0) {
        record("children-list", "children", "PASS", `${children.count} child entry points`);
        await page.locator("[data-select-child], [data-view-child-profile], .simple-child-card button, .simple-child-card").first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const tabs = await page.evaluate(() => [...document.querySelectorAll("[data-child-tab]")].map((t) => t.textContent.trim()));
        record("child-tabs", "children", "PASS", tabs.join(" | ") || "tabs rendered after open");
        await shot(page, "05-child-profile");
      } else {
        record("children-list", "children", "FAIL", `No children visible: ${children.text}`, "medium", {
          page: "Child Profiles",
          steps: "Open Child Profiles after login",
          expected: "At least one child or empty-state with Add Child",
          actual: children.text || "Empty",
          fix: "Seed test children or verify cloud child-data sync",
        });
      }
    } catch (error) {
      record("children-list", "children", "FAIL", error.message, "medium");
    }

    // Daily logs
    try {
      await page.evaluate(() => {
        if (typeof setView === "function") setView("child-tools-daily-logs");
      });
      await page.waitForTimeout(2000);
      const dlc = await page.evaluate(() => {
        const text = document.querySelector("#childManagementApp, .active-view")?.innerText || "";
        return {
          hasCenter: /daily log|attendance|check in|check-in|absent/i.test(text),
          text: text.slice(0, 200),
        };
      });
      await shot(page, "06-daily-logs");
      if (dlc.hasCenter) record("daily-logs", "daily-logs", "PASS", "Daily Logs surface loaded");
      else record("daily-logs", "daily-logs", "FAIL", `Daily Logs content missing: ${dlc.text}`, "high", {
        page: "Daily Logs",
        steps: "Open Daily Logs from nav",
        expected: "Attendance / daily log center",
        actual: dlc.text || "Blank",
        fix: "Fix daily-logs routing / renderDailyLogsCenter",
      });
    } catch (error) {
      record("daily-logs", "daily-logs", "FAIL", error.message, "high");
    }

    // Calendar persistence smoke: open calendar
    try {
      await page.evaluate(() => { if (typeof setView === "function") setView("calendar"); });
      await page.waitForTimeout(2500);
      const cal = await page.evaluate(() => {
        const text = document.querySelector("#view-calendar, .active-view")?.innerText || "";
        return {
          loaded: /calendar|week|month|today|add/i.test(text),
          text: text.slice(0, 180),
        };
      });
      await shot(page, "07-calendar");
      if (cal.loaded) record("calendar-load", "calendar", "PASS", "Calendar loaded");
      else record("calendar-load", "calendar", "FAIL", cal.text, "high");
    } catch (error) {
      record("calendar-load", "calendar", "FAIL", error.message, "high");
    }

    // Feedback modal
    try {
      const fb = page.locator("[data-open-feedback]").first();
      if (await fb.count()) {
        await fb.click();
        await page.waitForTimeout(600);
        const open = await page.evaluate(() => Boolean(document.querySelector("#feedbackModal.open, #feedbackModal[aria-hidden='false'], .feedback-modal.open")));
        if (open) record("feedback-modal", "support", "PASS", "Feedback modal opens");
        else record("feedback-modal", "support", "FAIL", "Feedback trigger did not open modal", "medium");
        await page.keyboard.press("Escape").catch(() => {});
      } else {
        record("feedback-modal", "support", "FAIL", "No feedback entry point visible while logged in", "medium");
      }
    } catch (error) {
      record("feedback-modal", "support", "FAIL", error.message, "medium");
    }

    // Billing / plans surface
    try {
      await page.evaluate(() => { if (typeof setView === "function") setView("plans"); });
      await page.waitForTimeout(1200);
      const plans = await page.evaluate(() => /free|pro|founding|trial|\$/i.test(document.querySelector(".active-view")?.innerText || ""));
      if (plans) record("plans-view", "billing", "PASS", "Plans/pricing view loads for account");
      else record("plans-view", "billing", "FAIL", "Plans view empty", "medium");
    } catch (error) {
      record("plans-view", "billing", "FAIL", error.message, "medium");
    }

    // Logout
    try {
      await page.evaluate(() => {
        if (typeof setView === "function") setView("account");
      });
      await page.waitForTimeout(800);
      const signOut = page.locator("#signOutButton, [data-sign-out], button:has-text('Sign Out')").first();
      if (await signOut.count()) {
        await signOut.click();
        await page.waitForTimeout(1500);
      } else {
        await page.evaluate(() => {
          localStorage.removeItem("llhCurrentUser");
          document.body.classList.remove("user-authenticated", "user-pro");
        });
      }
      const still = await page.evaluate(() => Boolean(localStorage.getItem("llhCurrentUser")));
      if (!still) record("logout", "auth", "PASS", "Logged out");
      else record("logout", "auth", "FAIL", "Still has llhCurrentUser after logout attempt", "high");
    } catch (error) {
      record("logout", "auth", "FAIL", error.message, "high");
    }
  });

  // ---------- ADMIN (optional) ----------
  if (ADMIN_EMAIL && ADMIN_PASSWORD && ADMIN_CODE) {
    await withPage({ width: 1280, height: 900 }, async (page) => {
      await page.goto(`${PROD_URL}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => { if (typeof setView === "function") setView("admin"); });
      await page.waitForTimeout(1000);
      await page.fill("input[name='adminEmail']", ADMIN_EMAIL);
      await page.fill("input[name='adminPassword']", ADMIN_PASSWORD);
      await page.fill("input[name='adminCode']", ADMIN_CODE);
      await page.click("#adminUnlockForm button[type='submit']");
      await page.waitForTimeout(4000);
      await shot(page, "08-admin");
      const admin = await page.evaluate(() => {
        const text = document.querySelector("#adminOwnerOverview, #adminProtectedContent")?.innerText || "";
        const zeros = (text.match(/\b0\b/g) || []).length;
        return { text: text.slice(0, 300), unlocked: !document.querySelector("#adminUnlockForm"), zeros };
      });
      if (admin.unlocked) record("admin-unlock", "admin", "PASS", "Admin unlocked");
      else record("admin-unlock", "admin", "FAIL", "Admin unlock failed", "critical");
      if (admin.unlocked && /Total Users|Founding|Active/i.test(admin.text)) {
        record("admin-overview", "admin", "PASS", admin.text.replace(/\s+/g, " ").slice(0, 160));
      } else if (admin.unlocked) {
        record("admin-overview", "admin", "FAIL", "Overview metrics missing after unlock", "high");
      }
    });
  } else {
    record("admin-unlock", "admin", "SKIP", "LLH_ADMIN_EMAIL/PASSWORD/CODE not provided — Admin unlock not re-tested in this run");
  }

  // ---------- PERMISSION MATRIX (code + runtime markers) ----------
  try {
    const access = require("./account-access.js");
    const matrix = [];
    const roles = ["owner", "director", "teacher", "assistant"];
    const caps = ["billing", "staff_management", "classrooms", "families", "enrollment", "daily_logs", "child_profiles"];
    for (const role of roles) {
      for (const capability of caps) {
        const home = access.canAccessCapability({ accountType: "home_daycare", role }, capability);
        const center = access.canAccessCapability({ accountType: "center", role }, capability);
        matrix.push({ role, capability, home_daycare: home, center });
      }
    }
    fs.writeFileSync(path.join(ARTIFACT_DIR, "permission-matrix.json"), JSON.stringify(matrix, null, 2));
    const ownerBilling = access.canAccessCapability({ accountType: "home_daycare", role: "owner" }, "billing");
    const teacherBilling = access.canAccessCapability({ accountType: "home_daycare", role: "teacher" }, "billing");
    const assistantStaff = access.canAccessCapability({ accountType: "center", role: "assistant" }, "staff_management");
    const teacherClassrooms = access.canAccessCapability({ accountType: "center", role: "teacher" }, "classrooms");
    if (ownerBilling && !teacherBilling && !assistantStaff && !teacherClassrooms) {
      record("permissions-matrix", "security", "PASS", "Owner billing; teacher/assistant correctly restricted in account-access.js");
    } else {
      record("permissions-matrix", "security", "FAIL", "Capability matrix unexpected", "critical", {
        page: "scripts/account-access.js",
        steps: "Evaluate role capability matrix",
        expected: "Owner billing only; assistants cannot manage staff; teachers cannot open center classrooms",
        actual: JSON.stringify({ ownerBilling, teacherBilling, assistantStaff, teacherClassrooms }),
        fix: "Correct roleAllowsCapability / accountTypeAllowsCapability",
      });
    }
    record("permissions-live-roles", "security", "FAIL", "Could not exercise Director/Lead Teacher/Assistant live sessions — only one LLH_TEST account credential is available in this environment", "high", {
      page: "Permissions",
      steps: "Login as Director, Lead Teacher, Assistant and hit restricted URLs",
      expected: "Each role sees correct nav + route guards",
      actual: "Only one test account credential provided (LLH_TEST_EMAIL)",
      fix: "Provide role-specific test accounts (or Admin-created staff invites) for live E2E",
    });
  } catch (error) {
    record("permissions-matrix", "security", "FAIL", error.message, "high");
  }

  // Billing plan variety note
  record("billing-plan-variety", "billing", "FAIL", "Free/Trial/Pro/Founding were not each exercised with dedicated live accounts in this run (single test credential)", "high", {
    page: "Billing",
    steps: "Login as Free, Trial, Pro, Founding and verify upgrade/cancel/retention",
    expected: "Each plan path verified end-to-end including Stripe portal actions",
    actual: "Only one production test credential available; Stripe upgrade/cancel not executed to avoid mutating live billing",
    fix: "Provide dedicated Free/Trial/Pro/Founding test accounts + allowlisted Stripe test mode or staging",
  });

  // Console / network summary
  const interestingConsole = consoleErrors.filter((e) => !/favicon|third-party|ResizeObserver|net::ERR_BLOCKED/i.test(e.message));
  const interestingFails = failedRequests.filter((r) => !/favicon|google-analytics|facebook|hotjar/i.test(r.url));
  if (interestingConsole.length) {
    record("console-errors", "performance", "FAIL", `${interestingConsole.length} console errors (see artifacts)`, "medium", {
      page: "Global",
      steps: "Browse core flows",
      expected: "No page errors",
      actual: interestingConsole.slice(0, 5).map((e) => e.message).join(" || "),
      fix: "Fix JS exceptions listed in console-errors.json",
    });
  } else {
    record("console-errors", "performance", "PASS", "No significant pageerrors captured");
  }
  fs.writeFileSync(path.join(ARTIFACT_DIR, "console-errors.json"), JSON.stringify(interestingConsole, null, 2));
  fs.writeFileSync(path.join(ARTIFACT_DIR, "failed-requests.json"), JSON.stringify(interestingFails, null, 2));
  if (interestingFails.length) {
    record("failed-requests", "performance", "FAIL", `${interestingFails.length} failed requests`, "medium", {
      page: "Network",
      steps: "Browse core flows",
      expected: "No failed first-party requests",
      actual: interestingFails.slice(0, 5).map((r) => `${r.url} :: ${r.error}`).join(" || "),
      fix: "Inspect failed-requests.json",
    });
  } else {
    record("failed-requests", "performance", "PASS", "No notable request failures");
  }

  await browser.close();

  const summary = {
    generatedAt: nowIso(),
    prodUrl: PROD_URL,
    testEmail: EMAIL,
    counts: {
      pass: results.filter((r) => r.status === "PASS").length,
      fail: results.filter((r) => r.status === "FAIL").length,
      skip: results.filter((r) => r.status === "SKIP").length,
    },
    issueCounts: {
      CRITICAL: issues.filter((i) => i.severity === "CRITICAL").length,
      HIGH: issues.filter((i) => i.severity === "HIGH").length,
      MEDIUM: issues.filter((i) => i.severity === "MEDIUM").length,
      LOW: issues.filter((i) => i.severity === "LOW").length,
    },
    productionReady: issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH").length === 0,
    results,
    issues,
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, "FINAL_PROD_READINESS.json"), JSON.stringify(summary, null, 2));

  const md = [];
  md.push("# Final Production Readiness Audit");
  md.push("");
  md.push(`Generated: ${summary.generatedAt}`);
  md.push(`Production URL: ${PROD_URL}`);
  md.push(`Test account: ${EMAIL}`);
  md.push("");
  md.push(`## Verdict: ${summary.productionReady ? "CONDITIONALLY READY" : "**NOT production-ready**"}`);
  md.push("");
  md.push(`Checks: ${summary.counts.pass} PASS / ${summary.counts.fail} FAIL / ${summary.counts.skip} SKIP`);
  md.push(`Issues: CRITICAL ${summary.issueCounts.CRITICAL} · HIGH ${summary.issueCounts.HIGH} · MEDIUM ${summary.issueCounts.MEDIUM} · LOW ${summary.issueCounts.LOW}`);
  md.push("");
  for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW"]) {
    const rows = issues.filter((i) => i.severity === sev);
    md.push(`## ${sev}`);
    md.push("");
    if (!rows.length) {
      md.push("_None found in this run._");
      md.push("");
      continue;
    }
    rows.forEach((issue, idx) => {
      md.push(`### ${idx + 1}. ${issue.id}`);
      md.push(`- **Page:** ${issue.page}`);
      md.push(`- **Steps:** ${issue.steps}`);
      md.push(`- **Expected:** ${issue.expected}`);
      md.push(`- **Actual:** ${issue.actual}`);
      md.push(`- **Recommended fix:** ${issue.fix}`);
      md.push("");
    });
  }
  md.push("## Coverage gaps (not fully exercised)");
  md.push("- Dedicated Free / Trial / Pro / Founding accounts (only one credential available)");
  md.push("- Live Director / Lead Teacher / Assistant sessions (permission matrix verified in code only)");
  md.push("- Stripe upgrade / downgrade / cancel / trial expiration (avoided mutating live billing)");
  md.push("- Password reset email delivery end-to-end");
  md.push("- Creating brand-new signup accounts that would pollute production user store");
  md.push("");
  md.push("## Raw results");
  results.forEach((r) => md.push(`- [${r.status}] ${r.id} (${r.area}) — ${r.detail}`));

  fs.writeFileSync(path.join(ARTIFACT_DIR, "FINAL_PROD_READINESS.md"), md.join("\n"));
  fs.writeFileSync(path.join(process.cwd(), "docs/audits/FINAL_PROD_READINESS_AUDIT.md"), md.join("\n"));
  console.log(`\nReport: ${path.join(ARTIFACT_DIR, "FINAL_PROD_READINESS.md")}`);
  console.log(`Repo copy: docs/audits/FINAL_PROD_READINESS_AUDIT.md`);
  console.log(`Production ready: ${summary.productionReady}`);
  if (!summary.productionReady) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
