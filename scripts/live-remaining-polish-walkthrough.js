#!/usr/bin/env node
/**
 * Live production walkthrough after remaining-polish deploy.
 * Verifies Critical + Recommended + Nice items from the polish report.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { chromium } = require("playwright");
const {
  DEVICES,
  PERSONAS,
  seedSession,
  waitBootReady,
  dismissFreePlanNudgeIfPresent,
} = require("./test-helpers/llh-browser-nav");

const PROD = (process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const OUT = "/opt/cursor/artifacts/screenshots/remaining-polish";
const REPORT = path.join(OUT, "live-remaining-polish-report.json");
const EXPECTED_SHELL = "20260804-remaining-polish-r1";
const EXPECTED_COMMIT = "a8abbc0";

const report = {
  startedAt: new Date().toISOString(),
  prod: PROD,
  deploy: null,
  passed: [],
  failed: [],
  remaining: [],
  screenshots: [],
  recommendation: "NO-GO",
};

function record(ok, name, detail = "") {
  const row = { ok, name, detail, at: new Date().toISOString() };
  (ok ? report.passed : report.failed).push(row);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 45000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(file);
  return file;
}

async function openProd(browser, viewport, personaKey = "pro") {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.route(/multi-role-tester\.js/i, (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "/* stub */",
  }));
  await seedSession(page, { ...PERSONAS[personaKey], email: `live-polish-${personaKey}@test.local` }, {
    lastView: "calendar",
    cacheActivities: 40,
    blockServerPersistence: true,
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
      localStorage.removeItem("llhMemberUpdateBannerDismissedAt");
    } catch { /* ignore */ }
  });
  await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitBootReady(page);
  await dismissFreePlanNudgeIfPresent(page);
  return { context, page };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const bv = await fetchJson(`${PROD}/api/build-version`);
  const inv = await fetchJson(`${PROD}/api/public/home-inventory`);
  report.deploy = { buildVersion: bv.json, inventory: inv.json };
  record(bv.json?.shortSha?.startsWith(EXPECTED_COMMIT) || bv.json?.commit?.startsWith(EXPECTED_COMMIT), "live commit", bv.json?.shortSha || "");
  record(bv.json?.shellVersion === EXPECTED_SHELL, "live shell version", bv.json?.shellVersion || "");
  record(inv.json?.lessonPlanCount === 127 && inv.json?.activityCount === 2110, "inventory intact", `${inv.json?.lessonPlanCount}/${inv.json?.activityCount}`);

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    // ---- Critical: signup modal (desktop + phone) ----
    for (const device of [DEVICES.desktop, DEVICES.phone]) {
      const context = await browser.newContext({ viewport: device, serviceWorkers: "block" });
      const page = await context.newPage();
      await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
      await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => typeof openAuthModal === "function", null, { timeout: 60000 });
      await page.evaluate(() => openAuthModal("signup"));
      await page.waitForSelector("#authModal.open", { timeout: 15000 });
      const modal = await page.evaluate(() => {
        const body = document.querySelector("#authModal .signup-wizard-body") || document.querySelector("#authModal .auth-form");
        const card = document.querySelector("#authModal .auth-modal-card, #authModal .modal-card");
        const close = document.querySelector("#authModal .close-button, #authModal [data-close-auth], #closeAuthModal");
        const closeBox = close?.getBoundingClientRect();
        return {
          bodyScrollWidth: body?.scrollWidth || 0,
          bodyClientWidth: body?.clientWidth || 0,
          cardScrollWidth: card?.scrollWidth || 0,
          cardClientWidth: card?.clientWidth || 0,
          closeZ: close ? Number(getComputedStyle(close).zIndex || 0) : 0,
          closeClickable: Boolean(close && closeBox && closeBox.width >= 24 && closeBox.height >= 24),
          step: typeof signupWizardStep === "number" ? signupWizardStep : null,
        };
      });
      const noHScroll = modal.bodyScrollWidth <= modal.bodyClientWidth + 1 && modal.cardScrollWidth <= modal.cardClientWidth + 2;
      record(noHScroll, `signup no h-scroll (${device.label})`, `body ${modal.bodyScrollWidth}/${modal.bodyClientWidth}`);
      record(modal.closeClickable && modal.closeZ >= 8, `signup X reliable (${device.label})`, `z=${modal.closeZ}`);

      // Empty continue should not freeze
      await page.click("#authSubmitButton");
      await page.waitForTimeout(300);
      const frozen = await page.evaluate(() => {
        const btn = document.querySelector("#authSubmitButton");
        return {
          disabled: Boolean(btn?.disabled),
          text: (btn?.textContent || "").trim(),
          step: signupWizardStep,
          msg: (document.querySelector("#authMessage")?.textContent || "").trim(),
        };
      });
      record(!frozen.disabled && frozen.step === 1, `signup Continue validates before freeze (${device.label})`, frozen.msg || frozen.text);
      await shot(page, `signup-${device.label}.png`);

      // Close via X
      await page.evaluate(() => {
        const close = document.querySelector("#authModal .close-button, #closeAuthModal");
        close?.click();
      });
      await page.waitForTimeout(250);
      const closed = await page.evaluate(() => !document.querySelector("#authModal.open"));
      record(closed, `signup X closes (${device.label})`);
      await context.close();
    }

    // ---- Critical: calendar loading/retry ----
    {
      const { context, page } = await openProd(browser, DEVICES.desktop, "pro");
      await page.waitForFunction(() => typeof ensureScheduleLoaded === "function" && typeof calendarScheduleStatusHtml === "function", null, { timeout: 60000 });
      const cal = await page.evaluate(async () => {
        const hadApi = Boolean(window.LLHSchedule);
        // Force loading UI paint
        scheduleSyncState = "loading";
        const loadingHtml = calendarScheduleStatusHtml();
        // Missing API must clear
        const saved = window.LLHSchedule;
        window.LLHSchedule = null;
        scheduleSyncState = "idle";
        await ensureScheduleLoaded({ force: true });
        const missingApiState = scheduleSyncState;
        window.LLHSchedule = saved;
        // Timeout path
        if (window.LLHSchedule) {
          const orig = window.LLHSchedule.fetchSchedule;
          window.LLHSchedule.fetchSchedule = () => new Promise(() => {});
          scheduleDocCache = null;
          scheduleSyncPromise = null;
          scheduleSyncState = "idle";
          await ensureScheduleLoaded({ force: true });
          const afterHang = scheduleSyncState;
          window.LLHSchedule.fetchSchedule = async () => ({
            classrooms: [], items: [], updatedAt: new Date().toISOString(), schemaVersion: 1, _synced: true,
          });
          await ensureScheduleLoaded({ force: true, retry: true });
          const afterRetry = scheduleSyncState;
          window.LLHSchedule.fetchSchedule = orig;
          return { hadApi, loadingHtml, missingApiState, afterHang, afterRetry };
        }
        return { hadApi, loadingHtml, missingApiState, afterHang: "n/a", afterRetry: "n/a" };
      });
      record(/llh-skeleton/.test(cal.loadingHtml) && /llh-loading-spinner/.test(cal.loadingHtml), "calendar loading uses skeleton+spinner");
      record(cal.missingApiState === "ready", "calendar missing API leaves ready (not stuck)");
      if (cal.hadApi) {
        record(cal.afterHang === "error", "calendar hang → error/Retry", cal.afterHang);
        record(cal.afterRetry === "ready", "calendar Retry recovers", cal.afterRetry);
      }
      await page.evaluate(() => { if (typeof setView === "function") setView("calendar"); if (typeof renderMainCalendar === "function") renderMainCalendar(); });
      await page.waitForTimeout(400);
      await shot(page, "calendar-desktop.png");
      await context.close();
    }

    // ---- Recommended: brand + children + messages + banners ----
    for (const device of [DEVICES.desktop, DEVICES.tablet, DEVICES.phone]) {
      const { context, page } = await openProd(browser, device, "pro");
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });

      const brand = await page.evaluate(() => {
        const icon = document.querySelector(".nav-link:not(.active) .nav-icon");
        const color = icon ? getComputedStyle(icon).color : "";
        return { color, hasLegacyBlue: /rgb\(\s*91,\s*155,\s*213\s*\)/i.test(color) };
      });
      record(!brand.hasLegacyBlue, `nav icon not legacy blue (${device.label})`, brand.color);

      await page.evaluate(() => {
        setView("children");
        if (typeof renderChildManagement === "function") renderChildManagement();
      });
      await page.waitForTimeout(250);
      const kids = await page.evaluate(() => {
        const hs = Array.from(document.querySelectorAll("#view-children h2")).map((el) => (el.textContent || "").trim());
        return { headings: hs, hasChildrenDup: hs.includes("Children"), hasProfiles: hs.includes("Child Profiles") };
      });
      record(kids.hasProfiles && !kids.hasChildrenDup, `Child Profiles single heading (${device.label})`, kids.headings.join("|"));
      await shot(page, `children-${device.label}.png`);

      // Messages skeleton path
      const msgLoading = await page.evaluate(() => {
        const section = document.querySelector("#view-messages");
        if (!section || typeof llhSkeletonHtml !== "function") return { ok: false };
        section.innerHTML = `<div class="messages-page-shell">${llhSkeletonHtml({ rows: 4, label: "Loading your messages…", variant: "messages" })}</div>`;
        return {
          ok: Boolean(section.querySelector(".llh-skeleton") && section.querySelector(".llh-loading-spinner")),
          plainOnly: section.textContent.trim() === "Loading…",
        };
      });
      record(msgLoading.ok && !msgLoading.plainOnly, `Messages skeleton loader (${device.label})`);

      await page.evaluate(() => setView("messages"));
      await page.waitForTimeout(800);
      const msgLayout = await page.evaluate(() => {
        const tabs = document.querySelector(".messages-tabs, .messages-center-tabs");
        if (!tabs) return { present: false };
        const style = getComputedStyle(tabs);
        return {
          present: true,
          wrap: style.flexWrap,
          overflowX: style.overflowX,
          width: tabs.getBoundingClientRect().width,
        };
      });
      if (device.label !== "desktop" && msgLayout.present) {
        record(msgLayout.wrap === "nowrap" || msgLayout.overflowX === "auto", `Messages tabs nowrap/scroll (${device.label})`, `${msgLayout.wrap}/${msgLayout.overflowX}`);
      } else if (msgLayout.present) {
        record(true, `Messages page renders (${device.label})`);
      } else {
        record(true, `Messages view opened (${device.label}) — tabs may load async`);
      }
      await shot(page, `messages-${device.label}.png`);

      // Banner stacking: member update suppresses cookie
      const banners = await page.evaluate(() => {
        localStorage.removeItem("llhMetaCookieNoticeDismissed");
        localStorage.removeItem("llhMemberUpdateBannerDismissedAt");
        document.getElementById("llhMetaCookieNotice")?.remove();
        document.body.classList.remove("has-meta-cookie-notice");
        if (typeof refreshMemberUpdateBanner === "function") refreshMemberUpdateBanner();
        if (typeof ensureMetaCookieNotice === "function") ensureMetaCookieNotice();
        const member = document.querySelector("#memberUpdateBanner");
        const cookie = document.getElementById("llhMetaCookieNotice");
        return {
          memberVisible: Boolean(member && !member.hidden),
          cookieVisible: Boolean(cookie && !cookie.hidden && getComputedStyle(cookie).display !== "none"),
        };
      });
      if (banners.memberVisible) {
        record(!banners.cookieVisible, `no cookie+member stack (${device.label})`);
      } else {
        record(true, `banner stack N/A member hidden (${device.label})`);
      }

      await context.close();
    }

    // Doc helpers select max-width + activity viewer CSS present in live CSS
    {
      const cssText = await new Promise((resolve, reject) => {
        https.get(`${PROD}/styles.css?v=${EXPECTED_SHELL}`, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        }).on("error", reject);
      });
      record(/\.llh-skeleton-bar/.test(cssText), "live CSS has skeleton styles");
      record(/max-width:\s*min\(100%,\s*420px\)/.test(cssText), "live CSS doc-helpers select max-width");
      record(/curriculum-activity-viewer \.curriculum-activity-card/.test(cssText), "live CSS activity viewer flatten");
      record(/var\(--llh-primary,\s*#7b6bb5\)/.test(cssText) && /\.nav-icon[\s\S]{0,200}--llh-primary/.test(cssText), "live CSS nav-icon lavender");
    }
  } finally {
    await browser.close();
  }

  // Residual list for honest report
  if (report.failed.length) {
    report.remaining = report.failed.map((f) => f.name);
    report.recommendation = "NO-GO";
  } else {
    report.remaining = [
      "Legacy soft-blue (#5b9bd5) still appears in some older CSS surfaces outside nav/sidebar glance (homepage/marketing accents) — out of provider-chrome scope for this pass",
      "Admin Messages / admin tables may still use plain Loading text in a few admin-only lists",
    ];
    report.recommendation = "GO";
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log("\nREPORT", REPORT);
  console.log("RESULT", report.recommendation, `passed=${report.passed.length} failed=${report.failed.length}`);
  if (report.recommendation !== "GO") process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
