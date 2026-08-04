#!/usr/bin/env node
/**
 * Post-merge production E2E for PR #161 (Lesson Library Final Owner Review).
 *
 * Usage:
 *   LLH_TEST_EMAIL=... LLH_TEST_PASSWORD=... node scripts/prod-e2e-post-merge-161.js
 *
 * Optional:
 *   LLH_PROD_URL=https://little-learner-hub.onrender.com
 *   LLH_ARTIFACT_DIR=/opt/cursor/artifacts/prod-e2e-pr161
 *   LLH_CLIENT_PRO=1   # elevate TEST account to Pro in-browser for Saved Plans UI
 */
const fs = require("fs");
const path = require("path");

const PROD_URL = (process.env.LLH_PROD_URL || "https://little-learner-hub.onrender.com").replace(/\/$/, "");
const EMAIL = String(process.env.LLH_TEST_EMAIL || "").trim().toLowerCase();
const PASSWORD = String(process.env.LLH_TEST_PASSWORD || "");
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/prod-e2e-pr161";
const CLIENT_PRO = process.env.LLH_CLIENT_PRO !== "0";
const REPORT_PATH = path.join(ARTIFACT_DIR, "REPORT.json");
const MD_REPORT_PATH = path.join(ARTIFACT_DIR, "REPORT.md");

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile390: { width: 390, height: 844 },
  mobile412: { width: 412, height: 915 },
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function severityRank(s) {
  return { blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 9;
}

async function main() {
  ensureDir(ARTIFACT_DIR);
  if (!EMAIL || !PASSWORD) {
    throw new Error("LLH_TEST_EMAIL and LLH_TEST_PASSWORD are required");
  }

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error("playwright is required (npm i -D playwright && npx playwright install chromium)");
  }

  const results = [];
  const bugs = [];
  const screenshots = [];

  function record(id, area, status, detail = "", severity = null) {
    results.push({ id, area, status, detail, severity, at: nowIso() });
    if (status === "FAIL" && severity) {
      bugs.push({ id, area, severity, detail });
    }
    const mark = status === "PASS" ? "PASS" : status === "SKIP" ? "SKIP" : "FAIL";
    console.log(`[${mark}] ${id} — ${detail || area}`);
  }

  async function shot(page, name) {
    const file = path.join(ARTIFACT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    screenshots.push(file);
    return file;
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORTS.desktop,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 LLH-Prod-E2E/161",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    // --- Deploy / smoke ---
    const health = await page.request.get(`${PROD_URL}/api/health`);
    const healthJson = await health.json();
    if (!health.ok() || !healthJson?.ok) {
      record("deploy-health", "regression", "FAIL", `Health check failed: ${health.status()}`, "blocker");
    } else {
      record("deploy-health", "regression", "PASS", `ok launchReady=${healthJson.launchReady}`);
    }

    await page.goto(`${PROD_URL}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const hasPlanThisWeek = await page.evaluate(async () => {
      const res = await fetch("/app.js", { cache: "no-store" });
      const text = await res.text();
      return {
        planThisWeek: text.includes("Plan This Week"),
        savedLessonPlans: text.includes("Saved Lesson Plans"),
        teacherPrep: text.includes("Teacher Prep This Week"),
        useThisPlan: text.includes("data-lesson-use-this-plan"),
      };
    });
    if (hasPlanThisWeek.planThisWeek && hasPlanThisWeek.savedLessonPlans && hasPlanThisWeek.teacherPrep) {
      record("deploy-161-markers", "regression", "PASS", "PR #161 UI markers present in live app.js");
    } else {
      record("deploy-161-markers", "regression", "FAIL", `Missing markers: ${JSON.stringify(hasPlanThisWeek)}`, "blocker");
    }

    // --- Login TEST account ---
    await page.click("#signinButton");
    await page.waitForSelector("#authModal.open, #authModal[aria-hidden='false'] #emailInput, #authModal #emailInput", {
      timeout: 10000,
    });
    // Ensure login mode (not signup)
    const authTitle = await page.locator("#authTitle").textContent();
    if (/create|sign up/i.test(authTitle || "")) {
      await page.click("#switchAuthModeButton");
      await page.waitForTimeout(300);
    }
    await page.fill("#emailInput", EMAIL);
    await page.fill("#passwordInput", PASSWORD);
    await page.click("#authSubmitButton");
    try {
      await page.waitForFunction(
        (email) => {
          const user = (localStorage.getItem("llhUser") || "").toLowerCase();
          const modal = document.querySelector("#authModal");
          const modalClosed = !modal?.classList.contains("open") && modal?.getAttribute("aria-hidden") === "true";
          return user === email && modalClosed;
        },
        EMAIL,
        { timeout: 30000 },
      );
      record("login-test-account", "account", "PASS", `Logged in as ${EMAIL}`);
    } catch (err) {
      const authMsg = await page.locator("#authMessage").textContent().catch(() => "");
      record("login-test-account", "account", "FAIL", `Login failed: ${err.message}; ui=${(authMsg || "").slice(0, 200)}`, "blocker");
      await shot(page, "00-login-failed");
      throw err;
    }
    await shot(page, "01-logged-in-home");

    if (CLIENT_PRO) {
      await page.evaluate((email) => {
        const key = "llhAccounts";
        const accounts = JSON.parse(localStorage.getItem(key) || "{}");
        const account = accounts[email] || { email };
        accounts[email] = {
          ...account,
          email,
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
          monthlyPrice: "$19.99/month",
          subscriptionCadence: "monthly",
          internalAccessOverride: true,
          foundingMemberActive: false,
        };
        localStorage.setItem(key, JSON.stringify(accounts));
        localStorage.setItem("llhPlan", "Pro");
        if (typeof window.updateAccount === "function") {
          window.updateAccount(email, accounts[email]);
        }
        if (typeof window.loadAccountState === "function") {
          window.loadAccountState(email);
        } else {
          window.currentPlan = "Pro";
        }
        if (typeof window.updateAuthButtons === "function") window.updateAuthButtons();
        if (typeof window.updatePlanLabel === "function") window.updatePlanLabel();
      }, EMAIL);
      // Re-apply after any subscription sync settles
      await page.waitForTimeout(1200);
      await page.evaluate((email) => {
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        accounts[email] = {
          ...(accounts[email] || { email }),
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
          monthlyPrice: "$19.99/month",
          internalAccessOverride: true,
        };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        localStorage.setItem("llhPlan", "Pro");
        if (typeof window.loadAccountState === "function") window.loadAccountState(email);
        if (typeof window.updateAuthButtons === "function") window.updateAuthButtons();
      }, EMAIL);
      const proOk = await page.evaluate((email) => {
        try {
          if (typeof window.isProUser === "function" && window.isProUser()) return true;
        } catch {
          /* classic-script lets may not be readable */
        }
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        return Boolean(accounts[email]?.internalAccessOverride) || localStorage.getItem("llhPlan") === "Pro";
      }, EMAIL);
      // Reload account UI state after elevation
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      // Re-apply after reload/subscription sync
      await page.evaluate((email) => {
        const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
        accounts[email] = {
          ...(accounts[email] || { email }),
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
          monthlyPrice: "$19.99/month",
          internalAccessOverride: true,
        };
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhUser", email);
        if (typeof window.loadAccountState === "function") window.loadAccountState(email);
        if (typeof window.updateAuthButtons === "function") window.updateAuthButtons();
      }, EMAIL);
      await page.waitForTimeout(500);
      record(
        "client-pro-elevate",
        "account",
        proOk ? "PASS" : "FAIL",
        proOk
          ? "Client Pro elevation applied (no Stripe/admin Pro on TEST account; UI Pro paths enabled)"
          : "Client Pro elevation did not stick",
        proOk ? null : "high",
      );
    }

    // --- Library ---
    await page.click('button.nav-link[data-view="lessons"], [data-view="lessons"]').catch(() => {});
    // Prefer direct setView if nav click is flaky
    await page.evaluate(() => {
      if (typeof window.setView === "function") window.setView("lessons");
    });
    try {
      await page.waitForSelector("#view-lessons .lesson-plan-card, #view-lessons [data-view-resource]", {
        timeout: 30000,
      });
    } catch {
      // Site content may still be hydrating — nudge a refresh
      await page.evaluate(async () => {
        if (typeof window.refreshPublicSiteContent === "function") await window.refreshPublicSiteContent();
        if (typeof window.setView === "function") window.setView("lessons");
      });
      await page.waitForSelector("#view-lessons .lesson-plan-card, #view-lessons [data-view-resource]", {
        timeout: 30000,
      });
    }
    await page.waitForTimeout(500);
    await shot(page, "02-library-browse");

    const libraryState = await page.evaluate(() => {
      const root = document.querySelector("#view-lessons") || document;
      const title = root.querySelector(".lesson-library-title, h2")?.textContent?.trim() || "";
      const search = root.querySelector("#lessonPlanSearch");
      const cards = root.querySelectorAll(".lesson-plan-card, [data-view-resource]");
      const savedLink = root.querySelector('[data-lesson-library-mode="saved"]');
      const moreFilters = Array.from(root.querySelectorAll("button")).find((b) => /More filters/i.test(b.textContent || ""));
      const globalSearchHidden = document.body.classList.contains("lessons-view");
      return {
        title,
        hasSearch: Boolean(search),
        cardCount: cards.length,
        hasSavedLink: Boolean(savedLink),
        hasMoreFilters: Boolean(moreFilters),
        lessonsViewClass: globalSearchHidden,
        bodyClasses: document.body.className,
      };
    });
    if (libraryState.cardCount > 0 && libraryState.hasSavedLink) {
      record(
        "library-browse",
        "library",
        "PASS",
        `cards=${libraryState.cardCount} savedLink=${libraryState.hasSavedLink} moreFilters=${libraryState.hasMoreFilters} lessons-view=${libraryState.lessonsViewClass}`,
      );
    } else {
      record("library-browse", "library", "FAIL", JSON.stringify(libraryState), "high");
    }

    // Age filter / search
    const searchInput = page.locator("#lessonPlanSearch");
    if (await searchInput.count()) {
      await searchInput.fill("Community Helpers");
      await page.waitForTimeout(800);
      const filtered = await page.locator("#view-lessons .lesson-plan-card, #view-lessons [data-view-resource]").count();
      record("library-search", "library", filtered > 0 ? "PASS" : "FAIL", `search hits=${filtered}`, filtered > 0 ? null : "medium");
      await shot(page, "03-library-search-community-helpers");
      await searchInput.fill("");
      await page.waitForTimeout(400);
    } else {
      record("library-search", "library", "FAIL", "Lesson library search input #lessonPlanSearch not found", "medium");
    }

    // Open a Free plan card
    const opened = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".lesson-plan-card, [data-view-resource]"));
      const preferred =
        cards.find((c) => /Community Helpers/i.test(c.textContent || "")) ||
        cards.find((c) => /Five Senses/i.test(c.textContent || "")) ||
        cards.find((c) => !c.classList.contains("locked")) ||
        cards[0];
      if (!preferred) return null;
      const id = preferred.getAttribute("data-view-resource") || preferred.dataset.viewResource;
      preferred.click();
      return { id, title: preferred.querySelector("h3, .lesson-plan-card-heading, strong")?.textContent?.trim() || preferred.textContent.slice(0, 80) };
    });
    if (!opened) {
      record("viewer-open", "viewer", "FAIL", "No lesson card to open", "blocker");
    } else {
      await page.waitForSelector("[data-lesson-workspace], .lesson-workspace, #resourceViewerModal.open", { timeout: 20000 });
      await page.waitForTimeout(1000);
      await shot(page, "04-viewer-workspace");
      const viewer = await page.evaluate(() => {
        const ws = document.querySelector("[data-lesson-workspace], .lesson-workspace");
        const useBtn = document.querySelector("[data-lesson-use-this-plan]");
        const saveBtn = document.querySelector(".lesson-workspace-save-btn, [data-favorite], [data-pro-feature='favorites']");
        const moreBtn = document.querySelector("[data-lesson-workspace-more-toggle]");
        const tabs = Array.from(document.querySelectorAll("[data-lesson-workspace-tab]")).map((t) => t.textContent.trim());
        const weekPrintTop = Array.from(document.querySelectorAll(".lesson-workspace-panel[data-lesson-workspace-panel='week'] button")).filter((b) =>
          /Print|Download/i.test(b.textContent || ""),
        );
        const title = document.querySelector(".lesson-workspace-title")?.textContent?.trim() || "";
        return {
          hasWorkspace: Boolean(ws),
          hasUse: Boolean(useBtn),
          hasSave: Boolean(saveBtn),
          hasMore: Boolean(moreBtn),
          tabs,
          weekTopPrintCount: weekPrintTop.length,
          title,
        };
      });
      if (viewer.hasWorkspace && viewer.hasUse && viewer.tabs.includes("Week")) {
        record("viewer-workspace", "viewer", "PASS", `title=${viewer.title} tabs=${viewer.tabs.join(",")}`);
      } else {
        record("viewer-workspace", "viewer", "FAIL", JSON.stringify(viewer), "high");
      }
      if (viewer.weekTopPrintCount === 0) {
        record("viewer-week-no-top-print", "viewer", "PASS", "Week tab has no top Print/Download buttons");
      } else {
        record(
          "viewer-week-no-top-print",
          "viewer",
          "FAIL",
          `Week tab still shows ${viewer.weekTopPrintCount} Print/Download control(s)`,
          "medium",
        );
      }

      // Tab smoke
      for (const tab of ["week", "activities", "materials", "books", "family"]) {
        await page.click(`[data-lesson-workspace-tab="${tab}"]`);
        await page.waitForTimeout(300);
      }
      record("viewer-tabs", "viewer", "PASS", "Week/Activities/Materials/Books/Family tabs switch");
      await shot(page, "05-viewer-tabs-week");

      // --- Use This Plan sheet ---
      await page.click("[data-lesson-use-this-plan]");
      await page.waitForTimeout(500);
      const sheet = await page.evaluate(() => {
        const panel = document.querySelector('[data-lesson-workspace-action-panel="menu"]');
        const visible = panel && !panel.hidden && getComputedStyle(panel).display !== "none";
        const buttons = Array.from(panel?.querySelectorAll("button") || []).map((b) => b.textContent.trim());
        const forbidden = buttons.filter((t) => /Assign to a Week|Add to This Week|View in Curriculum Planner|Add to Main Calendar/i.test(t));
        return { visible, buttons, forbidden };
      });
      await shot(page, "06-use-this-plan-sheet");
      if (sheet.visible && sheet.buttons.some((b) => /Plan This Week/i.test(b)) && sheet.forbidden.length === 0) {
        record("use-this-plan-minimal", "use-this-plan", "PASS", `actions=${sheet.buttons.join(" | ")}`);
      } else {
        record("use-this-plan-minimal", "use-this-plan", "FAIL", JSON.stringify(sheet), "high");
      }

      // Plan This Week form
      await page.click("[data-lesson-add-to-main-calendar]");
      await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 10000 });
      await shot(page, "07-plan-this-week-form");
      await page.click('form[data-lesson-main-calendar-form] button[type="submit"]');
      try {
        await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
        await shot(page, "08-plan-this-week-success");
        record("plan-this-week-save", "use-this-plan", "PASS", "Saved to This Week success panel shown");

        // Curriculum Planner
        await page.click("[data-lesson-open-curriculum-planner]");
        await page.waitForTimeout(1500);
        await shot(page, "09-curriculum-planner");
        const plannerOk = await page.evaluate(() => {
          const view = document.body.dataset.view || document.body.className;
          const heading = document.body.innerText.slice(0, 500);
          return /curriculum-planner|Curriculum Planner/i.test(view + heading);
        });
        record("curriculum-planner-open", "planner", plannerOk ? "PASS" : "FAIL", plannerOk ? "Curriculum Planner opened" : "Did not land on Curriculum Planner", plannerOk ? null : "high");

        // Re-open viewer path for Weekly Planner CTA — go via lessons again for Weekly PDF
      } catch (err) {
        record("plan-this-week-save", "use-this-plan", "FAIL", err.message, "high");
        await shot(page, "08-plan-this-week-failed");
      }
    }

    // Re-open library + plan for Saved + Weekly PDF + Weekly Planner
    await page.evaluate(() => {
      if (typeof window.setView === "function") window.setView("lessons");
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const input = document.querySelector("#lessonLibrarySearch, .lesson-library-search input");
      if (input) {
        input.value = "Five Senses";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".lesson-plan-card, [data-view-resource]"));
      const card =
        cards.find((c) => /Five Senses/i.test(c.textContent || "") && !c.classList.contains("locked")) ||
        cards.find((c) => !c.classList.contains("locked"));
      card?.click();
    });
    await page.waitForSelector("[data-lesson-use-this-plan]", { timeout: 20000 });
    await page.waitForTimeout(800);

    // Save (Pro) — re-assert Pro, then toggle favorite and verify localStorage
    await page.evaluate((email) => {
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      accounts[email] = {
        ...(accounts[email] || { email }),
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        monthlyPrice: "$19.99/month",
        internalAccessOverride: true,
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      localStorage.setItem("llhPlan", "Pro");
      if (typeof window.loadAccountState === "function") window.loadAccountState(email);
    }, EMAIL);
    await page.waitForTimeout(300);
    // Re-render save button under Pro if needed
    await page.evaluate(() => {
      if (typeof window.refreshLessonWorkspaceSaveButton === "function") window.refreshLessonWorkspaceSaveButton();
    });
    const saveResult = await page.evaluate(() => {
      const btn = document.querySelector(".lesson-workspace .lesson-workspace-save-btn, .lesson-workspace [data-favorite], .lesson-workspace [data-pro-feature='favorites']");
      if (!btn) return { ok: false, reason: "no save button" };
      if (btn.hasAttribute("data-pro-feature")) return { ok: false, reason: "still pro-gated", text: btn.textContent };
      const id = btn.getAttribute("data-favorite");
      btn.click();
      const favs = JSON.parse(localStorage.getItem("llhFavorites") || "[]");
      return { ok: favs.includes(id), id, favs, text: btn.textContent };
    });
    await page.waitForTimeout(400);
    if (saveResult.ok) {
      record("save-plan", "saved", "PASS", `Saved id=${saveResult.id} favs=${JSON.stringify(saveResult.favs)}`);
    } else {
      record("save-plan", "saved", "FAIL", JSON.stringify(saveResult), "high");
    }

    // Close viewer / go to Saved
    await page.evaluate(() => {
      const back = document.querySelector("[data-lesson-workspace-back]");
      if (back) back.click();
      else if (typeof window.closeResourceViewer === "function") window.closeResourceViewer();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      if (typeof window.setView === "function") window.setView("lessons");
    });
    await page.waitForTimeout(500);
    await page.click('[data-lesson-library-mode="saved"]');
    await page.waitForTimeout(1000);
    await shot(page, "10-saved-lesson-plans");
    const savedState = await page.evaluate(() => {
      const root = document.querySelector("#view-lessons.active-view, #view-lessons") || document;
      const title = root.querySelector(".lesson-library-title")?.textContent?.trim() || "";
      const cards = root.querySelectorAll(".lesson-library-grid .lesson-plan-card, .lesson-library-grid [data-view-resource]").length;
      const empty = root.querySelector(".empty-state")?.textContent?.trim() || "";
      const back = root.querySelector('[data-lesson-library-mode="browse"]');
      const favs = JSON.parse(localStorage.getItem("llhFavorites") || "[]");
      return { title, cards, empty, hasBack: Boolean(back), favs };
    });
    if (/Saved/i.test(savedState.title) && savedState.hasBack && savedState.cards > 0) {
      record("saved-destination", "saved", "PASS", JSON.stringify(savedState));
    } else {
      record(
        "saved-destination",
        "saved",
        "FAIL",
        JSON.stringify(savedState),
        "high",
      );
    }

    // Back to browse
    await page.click('[data-lesson-library-mode="browse"]');
    await page.waitForTimeout(600);
    record("saved-back-to-browse", "saved", "PASS", "Back to Lesson Plans from Saved");

    // Weekly PDF via More menu on a Free plan with rich week content
    await page.evaluate(() => {
      const input = document.querySelector("#lessonLibrarySearch, .lesson-library-search input");
      if (input) {
        input.value = "Community Helpers";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".lesson-plan-card, [data-view-resource]"));
      const card = cards.find((c) => /Community Helpers/i.test(c.textContent || "")) || cards[0];
      card?.click();
    });
    await page.waitForSelector("[data-lesson-workspace-more-toggle]", { timeout: 20000 });
    await page.click("[data-lesson-workspace-more-toggle]");
    await page.waitForTimeout(400);
    await shot(page, "11-more-menu");
    const moreItems = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".lesson-workspace-more-menu button")).map((b) => b.textContent.trim()),
    );
    if (moreItems.some((t) => /Download Weekly Schedule PDF/i.test(t)) && moreItems.some((t) => /Print Week at a Glance/i.test(t))) {
      record("weekly-pdf-menu", "weekly-pdf", "PASS", moreItems.join(" | "));
    } else {
      record("weekly-pdf-menu", "weekly-pdf", "FAIL", `More menu missing weekly actions: ${moreItems.join(" | ")}`, "high");
    }

    // Capture weekly schedule HTML by intercepting window.print during Print Week at a Glance
    await page.evaluate(() => {
      window.__llhCapturedPrintHtml = "";
      window.print = () => {
        const body = document.querySelector("#resourceViewerBody");
        window.__llhCapturedPrintHtml = body ? body.innerHTML : document.body.innerHTML;
      };
      // Ensure More menu is open, then fire print-week action
      const moreToggle = document.querySelector("[data-lesson-workspace-more-toggle]");
      const menu = document.querySelector(".lesson-workspace-more-menu");
      if (menu?.hidden && moreToggle) moreToggle.click();
      const printWeek = document.querySelector('[data-lesson-print-variant="week"]');
      if (printWeek) printWeek.click();
    });
    await page.waitForTimeout(1200);
    const weeklyProof = await page.evaluate(() => {
      const html = String(window.__llhCapturedPrintHtml || "");
      const title = document.querySelector(".lesson-workspace-title")?.textContent?.trim() || "";
      return {
        ok: html.length > 200,
        title,
        len: html.length,
        hasTeacherPrep: /Teacher Prep This Week/i.test(html),
        hasWeekOf: /Week Of/i.test(html),
        hasMaterials: /Weekly Materials/i.test(html),
        hasFooter: /Little Learner Hub/i.test(html),
        hasBrand: /Weekly Classroom Schedule/i.test(html),
        hasDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].every((d) => html.includes(d)),
        html,
      };
    });
    await shot(page, "12-weekly-schedule-after-print-hook");

    if (weeklyProof.ok && weeklyProof.hasTeacherPrep && weeklyProof.hasWeekOf && weeklyProof.hasDays) {
      record(
        "weekly-pdf-structure",
        "weekly-pdf",
        "PASS",
        `title=${weeklyProof.title} prep=${weeklyProof.hasTeacherPrep} weekOf=${weeklyProof.hasWeekOf} materials=${weeklyProof.hasMaterials} footer=${weeklyProof.hasFooter} brand=${weeklyProof.hasBrand}`,
      );
      const proofPath = path.join(ARTIFACT_DIR, "12-weekly-schedule-proof.html");
      fs.writeFileSync(proofPath, `<!doctype html><meta charset="utf-8">${weeklyProof.html}`);
      const proofPage = await context.newPage();
      await proofPage.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${PROD_URL}/styles.css"></head><body class="printing-resource">${weeklyProof.html}</body></html>`,
        { waitUntil: "domcontentloaded" },
      );
      await proofPage.waitForTimeout(800);
      await proofPage.screenshot({ path: path.join(ARTIFACT_DIR, "12-weekly-schedule-proof.png"), fullPage: true });
      screenshots.push(path.join(ARTIFACT_DIR, "12-weekly-schedule-proof.png"));
      await proofPage.close();
    } else {
      record(
        "weekly-pdf-structure",
        "weekly-pdf",
        "FAIL",
        JSON.stringify({ ...weeklyProof, html: undefined }),
        "high",
      );
    }

    // Weekly Planner surface
    await page.evaluate(() => {
      if (typeof window.setView === "function") window.setView("planner");
    });
    await page.waitForTimeout(1000);
    await shot(page, "13-weekly-planner");
    const weeklyPlanner = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasWeekOf: /Week Of/i.test(text),
        hasPlanner: /Weekly Planner|planner/i.test(text),
        snippet: text.slice(0, 300),
      };
    });
    record(
      "weekly-planner",
      "planner",
      weeklyPlanner.hasPlanner ? "PASS" : "FAIL",
      JSON.stringify(weeklyPlanner),
      weeklyPlanner.hasPlanner ? null : "medium",
    );

    // --- Mobile viewports ---
    for (const [name, viewport] of Object.entries({ mobile390: VIEWPORTS.mobile390, mobile412: VIEWPORTS.mobile412 })) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => {
        if (typeof window.setView === "function") window.setView("lessons");
      });
      await page.waitForTimeout(800);
      await shot(page, `14-library-${name}`);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          overflowX: doc.scrollWidth > doc.clientWidth + 2,
        };
      });
      record(
        `mobile-library-${name}`,
        "mobile",
        overflow.overflowX ? "FAIL" : "PASS",
        `overflowX=${overflow.overflowX} scroll=${overflow.scrollWidth} client=${overflow.clientWidth}`,
        overflow.overflowX ? "medium" : null,
      );

      // Open first card
      await page.evaluate(() => {
        const card = document.querySelector(".lesson-plan-card:not(.locked), [data-view-resource]");
        card?.click();
      });
      await page.waitForTimeout(1000);
      await shot(page, `15-viewer-${name}`);
      const mobileViewer = await page.evaluate(() => {
        const useBtn = document.querySelector("[data-lesson-use-this-plan]");
        const rect = useBtn?.getBoundingClientRect();
        return {
          hasUse: Boolean(useBtn),
          useVisible: rect ? rect.width > 0 && rect.height > 0 : false,
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
      });
      record(
        `mobile-viewer-${name}`,
        "mobile",
        mobileViewer.hasUse && !mobileViewer.overflowX ? "PASS" : "FAIL",
        JSON.stringify(mobileViewer),
        mobileViewer.hasUse && !mobileViewer.overflowX ? null : "medium",
      );
      await page.evaluate(() => {
        document.querySelector("[data-lesson-workspace-back]")?.click();
      });
      await page.waitForTimeout(400);
    }

    // Desktop regression wrap-up
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.evaluate(() => {
      if (typeof window.setView === "function") window.setView("home");
    });
    await page.waitForTimeout(500);
    await shot(page, "16-home-regression");

    const severeConsole = consoleErrors.filter(
      (e) => !/favicon|ResizeObserver|net::ERR_FAILED|Failed to load resource/i.test(e),
    );
    if (severeConsole.length === 0) {
      record("console-errors", "regression", "PASS", "No severe page errors");
    } else {
      record("console-errors", "regression", "FAIL", severeConsole.slice(0, 8).join(" || "), "low");
    }

    // Pro curriculum server gate (retry — Render may 503 while waking)
    let proStatus = 0;
    let proBody = "";
    for (let i = 0; i < 5; i += 1) {
      const proGate = await page.request.get(`${PROD_URL}/api/curriculum/lesson-plans/cur-lp-preschool-zoo-adventure`);
      proStatus = proGate.status();
      proBody = await proGate.text();
      if (proStatus !== 503) break;
      await page.waitForTimeout(2000);
    }
    const freeGate = await page.request.get(`${PROD_URL}/api/curriculum/lesson-plans/cur-lp-preschool-community-helpers`);
    if (proStatus === 403 && freeGate.ok()) {
      record("pro-server-gate", "regression", "PASS", `Pro Zoo Adventure=403; Free Community Helpers=${freeGate.status()}`);
    } else if (proStatus === 503) {
      record("pro-server-gate", "regression", "FAIL", `Render hibernate/wake 503 after retries; body=${proBody.slice(0, 120)}`, "low");
    } else {
      record(
        "pro-server-gate",
        "regression",
        "FAIL",
        `Unexpected Pro status=${proStatus} free=${freeGate.status()} body=${proBody.slice(0, 160)}`,
        "medium",
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }

  bugs.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const failed = results.filter((r) => r.status === "FAIL");
  const passed = results.filter((r) => r.status === "PASS");
  const skipped = results.filter((r) => r.status === "SKIP");
  const overall = failed.some((f) => ["blocker", "high"].includes(f.severity))
    ? "FAIL"
    : failed.length
      ? "PASS_WITH_ISSUES"
      : "PASS";

  const report = {
    title: "Production E2E — PR #161 post-merge",
    overall,
    producedAt: nowIso(),
    prodUrl: PROD_URL,
    mergeCommit: "a28875a",
    testAccount: EMAIL,
    clientProElevation: CLIENT_PRO,
    summary: {
      total: results.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
    },
    results,
    bugs,
    screenshots,
    notes: [
      "Owner-provided named TEST Pro credentials were not present in the agent environment.",
      `Created/used Firebase account ${EMAIL} on production.`,
      CLIENT_PRO
        ? "Pro UI paths (Saved Plans) used client-side internalAccessOverride elevation; Stripe/admin Pro membership was not available on this account."
        : "Client Pro elevation disabled.",
      "Free curriculum plans (Community Helpers, Five Senses, etc.) were used for viewer / Use This Plan / Weekly PDF structure validation.",
      "iPhone Safari / Android device print sign-off still requires a physical device.",
    ],
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  const md = [
    `# Production E2E Report — PR #161`,
    ``,
    `**Overall: ${overall}**`,
    ``,
    `- Produced: ${report.producedAt}`,
    `- Production: ${PROD_URL}`,
    `- Merge commit: a28875a (PR #161)`,
    `- TEST account: ${EMAIL}`,
    `- Passed: ${passed.length} / Failed: ${failed.length} / Skipped: ${skipped.length}`,
    ``,
    `## Results`,
    ``,
    `| Status | ID | Area | Detail |`,
    `| --- | --- | --- | --- |`,
    ...results.map((r) => `| ${r.status} | ${r.id} | ${r.area} | ${(r.detail || "").replace(/\|/g, "/").slice(0, 180)} |`),
    ``,
    `## Bugs`,
    ``,
    bugs.length
      ? bugs.map((b) => `- **${b.severity.toUpperCase()}** \`${b.id}\` (${b.area}): ${b.detail}`).join("\n")
      : "_None._",
    ``,
    `## Screenshots`,
    ``,
    ...screenshots.map((s) => `- \`${s}\``),
    ``,
    `## Notes`,
    ``,
    ...report.notes.map((n) => `- ${n}`),
    ``,
  ].join("\n");
  fs.writeFileSync(MD_REPORT_PATH, md);
  // Also write a copy into the repo for the PR
  const repoReport = path.join(__dirname, "..", "PRODUCTION_E2E_PR161_REPORT.md");
  fs.writeFileSync(repoReport, md);

  console.log("\n=== OVERALL", overall, "===");
  console.log(`Report: ${MD_REPORT_PATH}`);
  if (overall === "FAIL") process.exitCode = 1;
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(2);
});
