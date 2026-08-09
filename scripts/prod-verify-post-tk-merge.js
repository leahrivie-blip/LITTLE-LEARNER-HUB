#!/usr/bin/env node
/**
 * Post-merge production verification (read-only curriculum; disposable calendar only).
 * Covers: shell boot → login → lesson library → Farm Animals TK binder summary,
 * previous live-audit calendar create, and console/network smoke.
 *
 * Run: node scripts/prod-verify-post-tk-merge.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.PROD_BASE_URL || "https://littlelearnershubbyleah.com";
const ARTIFACT = "/opt/cursor/artifacts/prod-verify-post-tk-merge";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForLiveCommit(expectedPrefix, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      const json = await res.json();
      // health may not include commit; probe cache-busted script presence instead
      const html = await fetch(`${BASE}/?_=${Date.now()}`).then((r) => r.text());
      if (html.includes("tk-binder-pdf-fix-r1") || html.includes("20260809-tk-binder-pdf-fix")) {
        return true;
      }
    } catch (_err) { /* retry */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD required for signed-in verify");
  }

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  record("GET /api/health ok", health?.ok === true, health?.service || "");

  const liveShell = await waitForLiveCommit("6dd80c8");
  record("Production shell includes TK binder fix cache bust", liveShell, "tk-binder-pdf-fix-r1");

  const farmTk = await fetch(`${BASE}/api/curriculum/lesson-plans/cur-lp-preschool-farm-animals/teaching-kit`)
    .then((r) => r.json());
  record("Farm Animals teaching-kit API ok", Boolean(farmTk?.teachingKit?.ok), farmTk?.teachingKit?.title || "");
  const songs = farmTk?.teachingKit?.companion?.songs || [];
  record("Farm Animals has 5 songs", songs.length === 5, songs.map((s) => s.title).join(" | "));

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.url()}`);
  });

  try {
    // --- Public shell / signup entry ---
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    // Dismiss cookie banner if present (can intercept clicks).
    const cookieBtn = page.locator('button:has-text("Got it"), button:has-text("Accept")').first();
    if (await cookieBtn.isVisible().catch(() => false)) {
      await cookieBtn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(ARTIFACT, "01-homepage.png"), fullPage: false });
    const loginBtn = page.locator('button.llh-btn:has-text("Log In"), a.llh-btn:has-text("Log In"), button:has-text("Log In")').first();
    const signupVisible = await loginBtn.isVisible().catch(() => false)
      || await page.locator('button:has-text("Sign Up")').first().isVisible().catch(() => false);
    record("Homepage shows auth entry", signupVisible);

    // Marketing header Log In → #authModal (legacy #signinButton may be zero-sized).
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click({ timeout: 10000 });
    } else {
      await page.evaluate(() => document.getElementById("signinButton")?.click());
    }
    await page.locator("#authModal").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(400);

    // Prefer the visible auth-form fields (avoid hidden force-password currentPassword).
    await page.locator("#emailInput").fill(ADMIN_EMAIL, { timeout: 10000 });
    await page.locator("#passwordInput").fill(ADMIN_PASSWORD, { timeout: 10000 });
    await page.locator("#authSubmitButton").click({ timeout: 10000 });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(ARTIFACT, "02-after-login.png"), fullPage: false });

    const loggedIn = await page.evaluate(() => {
      const user = localStorage.getItem("llhUser") || sessionStorage.getItem("llhUser") || "";
      const body = document.body?.innerText || "";
      const signedOutHidden = document.getElementById("signOutButton")
        ? !document.getElementById("signOutButton").hidden
        : /Sign out|Log out/i.test(body);
      return {
        user,
        hasAccountUi: signedOutHidden || /Lesson Library|Calendar|My Hub|Dashboard/i.test(body),
      };
    });
    record("Login established signed-in session", Boolean(loggedIn.user) || loggedIn.hasAccountUi, loggedIn.user || "ui-signal");

    // --- Lesson library / Farm Animals Teaching Kit ---
    const lessonNav = page.getByRole("button", { name: /Lesson Library|Lesson Plans/i })
      .or(page.getByRole("link", { name: /Lesson Library|Lesson Plans/i }))
      .or(page.locator('[data-nav="lesson-library"], [data-nav="lessons"]'))
      .first();
    if (await lessonNav.isVisible().catch(() => false)) {
      await lessonNav.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      // Signed-in shell often uses hash/nav handlers; try common entry points.
      await page.evaluate(() => {
        const candidates = [...document.querySelectorAll("button, a, [role='button']")];
        const hit = candidates.find((el) => /Lesson Library|Lesson Plans|Curriculum/i.test(el.textContent || ""));
        hit?.click();
      });
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: path.join(ARTIFACT, "03-lesson-library.png"), fullPage: false });

    // Dismiss upgrade banner if it covers cards.
    const dismiss = page.getByRole("button", { name: /^Dismiss$/i }).first();
    if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.click().catch(() => {});
      await page.waitForTimeout(300);
    }
    const search = page.locator('input[placeholder*="Search lesson plans" i], input[type="search"], input[placeholder*="Search" i]').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill("Farm Animals");
      await page.waitForTimeout(1200);
    }
    const farmCard = page.locator(".resource-card, .lesson-card, [data-resource-id], article, li, button, a")
      .filter({ hasText: /^Farm Animals$|Farm Animals/i })
      .filter({ hasNotText: /Request a Lesson Plan/i })
      .first();
    // Prefer a visible card title in the library grid.
    const farmVisible = page.getByRole("heading", { name: /Farm Animals/i })
      .or(page.locator(".resource-card-title, .lesson-plan-card, [data-lesson-title]").filter({ hasText: /Farm Animals/i }))
      .or(page.getByText("Farm Animals", { exact: true }))
      .first();
    // Reliable open: signed-in app exposes openResourceViewer for curriculum lessons.
    const openedFarm = await page.evaluate(async () => {
      try {
        if (typeof window.openResourceViewer === "function") {
          await window.openResourceViewer("cur-lp-preschool-farm-animals");
          return true;
        }
      } catch (_err) { /* fall through */ }
      const match = [...document.querySelectorAll(".resource-card, .lesson-plan-card, [data-resource-id]")]
        .find((el) => /Farm Animals/i.test(el.textContent || "") && el.offsetParent);
      if (match) {
        match.click();
        return true;
      }
      return false;
    });
    record("Farm Animals opened from signed-in library", openedFarm);
    await page.waitForTimeout(3200);
    await page.screenshot({ path: path.join(ARTIFACT, "04-farm-open.png"), fullPage: false });

    if (openedFarm) {
      const lessonButtons = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return {
          weeklyPlanner: /Download Teacher Weekly Planner/i.test(text),
          fullLesson: /Download Full Lesson Plan/i.test(text),
          buildPrint: /Build\s*\/\s*Print|Print Center|Build My Kit/i.test(text),
          teachingKit: /Teaching Kit|Digital Binder/i.test(text),
        };
      });
      record("Download Teacher Weekly Planner control present", lessonButtons.weeklyPlanner);
      record("Download Full Lesson Plan control present", lessonButtons.fullLesson);
      record("Teaching Kit / Build surface present", lessonButtons.buildPrint || lessonButtons.teachingKit);

      // Open Build / Print
      const buildTab = page.locator('[data-tk-goto="build"]').or(page.getByRole("button", { name: /Build\s*\/\s*Print/i })).first();
      if (await buildTab.isVisible().catch(() => false)) {
        await buildTab.click({ timeout: 8000 });
        await page.waitForTimeout(1200);
      } else {
        await page.evaluate(() => {
          const hit = [...document.querySelectorAll("button, [data-tk-goto]")]
            .find((el) => el.getAttribute("data-tk-goto") === "build" || /Build\s*\/\s*Print/i.test(el.textContent || ""));
          hit?.click();
        });
        await page.waitForTimeout(1200);
      }
      await page.screenshot({ path: path.join(ARTIFACT, "05-build-print.png"), fullPage: true });

      // Ensure Entire Binder via LABEL TEXT click (the fixed bug)
      const songsRadio = page.locator('label.tk-radio-row:has-text("Songs")').first();
      if (await songsRadio.isVisible().catch(() => false)) {
        await songsRadio.locator("span").click();
        await page.waitForTimeout(400);
      }
      const entireLabel = page.locator('label.tk-radio-row:has-text("Entire Binder Kit")').first();
      record("Entire Binder Kit radio visible", await entireLabel.isVisible().catch(() => false));
      if (await entireLabel.isVisible().catch(() => false)) {
        await entireLabel.locator("span").click();
        await page.waitForTimeout(600);
      }

      const summary = await page.locator("[data-tk-print-summary]").innerText().catch(() => "");
      record("Summary says Entire Binder Kit selected", /Entire Binder Kit selected/i.test(summary), summary.slice(0, 180));
      record("Summary lists binder sections not songs-only", /Branded cover|Weekly overview|Activity cards/i.test(summary), summary.slice(0, 180));
      record("Summary does not list only Farm song titles", !(/^Entire Binder Kit selected\s*[—-]\s*Old MacDonald/i.test(summary)), summary.slice(0, 180));

      const readyTitle = await page.locator("[data-tk-ready-title]").innerText().catch(() => "");
      record("Ready to print shown for resolved Entire Binder", /Ready to print/i.test(readyTitle), readyTitle);

      // Preview selection
      const previewBtn = page.locator("[data-tk-preview-print]");
      record("Preview selection enabled", await previewBtn.isEnabled().catch(() => false));
      if (await previewBtn.isEnabled().catch(() => false)) {
        await previewBtn.click();
        await page.waitForTimeout(2500);
      }
      const previewInfo = await page.evaluate(() => {
        const last = window.__llhLastTeachingKitPrint || null;
        const host = document.querySelector("[data-tk-print-preview-host]");
        const previewText = host ? host.innerText : "";
        return {
          ok: Boolean(last),
          mode: last?.documentMode || "",
          pages: last?.pageCount || 0,
          previewHasDaily: /Monday|Daily Plans|Weekly Plan/i.test(previewText),
          previewSongsOnly: /Old MacDonald/i.test(previewText) && !/Daily Plans|Activity/i.test(previewText),
          fileName: last?.fileName || last?.mergedPdfFileName || "",
        };
      });
      record("Preview built entire_binder document", previewInfo.mode === "entire_binder", previewInfo.mode);
      record("Preview page count substantial", previewInfo.pages >= 8, String(previewInfo.pages));
      record("Preview includes daily/week content", previewInfo.previewHasDaily && !previewInfo.previewSongsOnly);
      await page.screenshot({ path: path.join(ARTIFACT, "06-preview-entire-binder.png"), fullPage: false });

      // Download PDF — expect preparing / started feedback (may take a while)
      const downloadBtn = page.locator("[data-tk-download-binder]");
      record("Download PDF enabled", await downloadBtn.isEnabled().catch(() => false));
      let download = null;
      if (await downloadBtn.isEnabled().catch(() => false)) {
        const downloadPromise = page.waitForEvent("download", { timeout: 120000 }).catch(() => null);
        await downloadBtn.click();
        const statusDuring = await page.locator("[data-tk-download-status], [data-tk-ready-title]").allInnerTexts().catch(() => []);
        record("Download shows preparing/busy feedback", statusDuring.some((t) => /Preparing your PDF|Working|Download started|failed/i.test(t)), statusDuring.join(" | ").slice(0, 160));
        download = await downloadPromise;
      }
      if (download) {
        const suggested = download.suggestedFilename();
        record("Download produced a file", true, suggested);
        record("Filename is branded Teacher Binder", /Little-Learner-Hub-Farm-Animals-Teacher-Binder\.pdf/i.test(suggested), suggested);
        const savePath = path.join(ARTIFACT, suggested || "farm-binder.pdf");
        await download.saveAs(savePath);
        const size = fs.statSync(savePath).size;
        record("Downloaded PDF non-empty", size > 1000, `${size} bytes`);
      } else {
        const after = await page.evaluate(() => {
          const last = window.__llhLastTeachingKitPrint || {};
          const status = document.querySelector("[data-tk-download-status]")?.textContent || "";
          const toast = document.body?.innerText || "";
          return {
            mergeOk: last.mergeOk,
            reason: last.mergeReason || last.intent,
            fileName: last.mergedPdfFileName || last.fileName || "",
            status,
            hasStarted: /Download started/i.test(status) || /Download started/i.test(toast),
            hasError: /failed|unavailable|try again/i.test(status),
          };
        });
        record("Download feedback visible without silent fail", after.mergeOk === true || after.hasStarted || after.hasError, JSON.stringify(after).slice(0, 220));
      }
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(ARTIFACT, "07-after-download.png"), fullPage: false });

      const statusAfter = await page.locator("[data-tk-download-status]").innerText().catch(() => "");
      record("Post-download status visible", /Download started|failed|Preparing/i.test(statusAfter) || Boolean(download), statusAfter.slice(0, 160));

      // Open Digital Binder
      const binderBtn = page.locator('[data-tk-goto="binder"]').or(page.getByRole("button", { name: /Open Digital Binder/i })).first();
      if (await binderBtn.isVisible().catch(() => false)) {
        await binderBtn.click({ timeout: 8000 });
        await page.waitForTimeout(1000);
      }
      const binderOpen = await page.locator(".tk-binder-section-tab, [data-tk-binder-tab]").first().isVisible().catch(() => false)
        || await page.getByText(/Weekly Plan|Overview/i).first().isVisible().catch(() => false);
      record("Open Digital Binder works", binderOpen);
      await page.screenshot({ path: path.join(ARTIFACT, "08-digital-binder.png"), fullPage: false });

      // Close viewer before calendar checks
      const closeBtn = page.locator("#closeResourceViewer, button:has-text(\"Close lesson plan\"), button:has-text(\"Close\")").first();
      if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});
      await page.waitForTimeout(600);
    }

    // --- Calendar create (disposable) from prior live-audit fix ---
    const calNav = page.getByRole("button", { name: /^Calendar$/i })
      .or(page.getByRole("link", { name: /^Calendar$/i }))
      .or(page.locator('[data-nav="calendar"]'))
      .first();
    if (await calNav.isVisible().catch(() => false)) {
      await calNav.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      await page.evaluate(() => {
        const hit = [...document.querySelectorAll("button, a, [role='button']")]
          .find((el) => /^Calendar$/i.test((el.textContent || "").trim()));
        hit?.click();
      });
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: path.join(ARTIFACT, "09-calendar.png"), fullPage: false });

    const disposableTitle = `TK-VERIFY ${Date.now()} disposable`;
    const created = await page.evaluate((title) => {
      const addBtn = [...document.querySelectorAll("button, a, [role='button']")]
        .find((el) => /Add (Lesson Plan|event)|New event|Create/i.test((el.textContent || "").trim()));
      return {
        hasScheduleUi: /Calendar|Schedule|PLANNING HOME|Add Lesson Plan/i.test(document.body?.innerText || ""),
        hasAddControl: Boolean(addBtn),
        title,
      };
    }, disposableTitle);
    record("Calendar surface reachable when signed in", created.hasScheduleUi);
    record("Calendar Add Lesson Plan control present", created.hasAddControl);

    // Try UI create: click add → fill title → save once (idempotency regression)
    let calendarCreateOk = false;
    try {
      const addCandidates = [
        'button:has-text("Add event")',
        'button:has-text("New event")',
        'button:has-text("Add to calendar")',
        'button:has-text("Create")',
        '[data-schedule-create]',
        '[data-add-schedule-item]',
      ];
      for (const sel of addCandidates) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click({ timeout: 3000 });
          break;
        }
      }
      await page.waitForTimeout(600);
      const titleInput = page.locator('input[name="title"], input[placeholder*="title" i], input[aria-label*="title" i], #scheduleTitle').first();
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill(disposableTitle);
        const saveBtn = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save"), [data-schedule-save]').first();
        if (await saveBtn.isVisible().catch(() => false)) {
          // Double-click quickly to validate idempotency guard
          await saveBtn.click();
          await saveBtn.click({ timeout: 500 }).catch(() => {});
          await page.waitForTimeout(2500);
          const bodyText = await page.locator("body").innerText();
          calendarCreateOk = bodyText.includes(disposableTitle);
          // Cleanup disposable if delete control exists near the item
          const item = page.locator(`text=${disposableTitle}`).first();
          if (await item.isVisible().catch(() => false)) {
            await item.click({ timeout: 2000 }).catch(() => {});
            const del = page.locator('button:has-text("Delete"), button:has-text("Remove")').first();
            if (await del.isVisible().catch(() => false)) {
              await del.click().catch(() => {});
              await page.waitForTimeout(800);
              // confirm dialogs
              page.once("dialog", (d) => d.accept().catch(() => {}));
              await page.locator('button:has-text("Delete"), button:has-text("Confirm")').first().click({ timeout: 2000 }).catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      record("Calendar create attempt error (non-fatal)", false, err.message);
    }
    record("Calendar disposable create visible after save", calendarCreateOk, disposableTitle);

    // Mobile viewport pass for TK summary
    await page.setViewportSize({ width: 390, height: 844 });
    // Return to Farm build if possible
    const farmAgain = page.locator('text=/Farm Animals/i').first();
    if (await farmAgain.isVisible().catch(() => false)) {
      await farmAgain.click().catch(() => {});
      await page.waitForTimeout(1000);
      const buildAgain = page.locator('button:has-text("Build / Print"), [data-tk-goto="build"]').first();
      if (await buildAgain.isVisible().catch(() => false)) await buildAgain.click().catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: path.join(ARTIFACT, "10-mobile-build.png"), fullPage: false });

    const seriousConsole = consoleErrors.filter((line) => (
      !/favicon|third-party|ResizeObserver|net::ERR_BLOCKED|401|Failed to load resource/i.test(line)
    ));
    record("No serious console errors during verify", seriousConsole.length === 0, seriousConsole.slice(0, 3).join(" || "));
    record("No HTTP 500s during verify", failedRequests.length === 0, failedRequests.slice(0, 3).join(" || "));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const summary = {
    base: BASE,
    passed,
    failed: failed.length,
    total: results.length,
    failures: failed,
    consoleErrorCount: consoleErrors.length,
    failedRequestCount: failedRequests.length,
    artifacts: ARTIFACT,
  };
  fs.writeFileSync(path.join(ARTIFACT, "summary.json"), JSON.stringify({ summary, results }, null, 2));
  console.log("\n" + JSON.stringify(summary, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
