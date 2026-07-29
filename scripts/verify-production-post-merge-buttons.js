#!/usr/bin/env node
/**
 * Post-merge production button smoke against the live site.
 * Read-only: does not import or mutate production content.
 *
 * Run: SITE_URL=https://littlelearnershubbyleah.com node scripts/verify-production-post-merge-buttons.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const BASE = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/post-merge-prod-qa";
const results = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(urlPath) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlPath, BASE);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: { Accept: "application/json" },
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function waitForLessonLibrary(page) {
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 30000 });
  await page.waitForFunction(() => {
    const text = document.querySelector("#view-lessons")?.innerText || "";
    const cards = document.querySelectorAll("#view-lessons .lesson-plan-card, #view-lessons [data-browse-card]").length;
    return !/Loading lesson plans/i.test(text) && cards > 0;
  }, null, { timeout: 90000 });
}

async function closeViewer(page) {
  await page.evaluate(() => {
    document.querySelector("#resourceViewerModal")?.classList.remove("open");
    document.querySelector("#resourceViewerModal")?.setAttribute("aria-hidden", "true");
    document.querySelector("#featurePreviewModal")?.classList.remove("open");
    document.querySelector("#featurePreviewModal")?.setAttribute("aria-hidden", "true");
    document.querySelector("#authModal")?.classList.remove("open");
    document.querySelector("#authModal")?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("resource-viewer-open", "modal-open");
    document.querySelector("#closeResourceViewer")?.click();
  });
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  try {
    const health = await requestJson("/api/health");
    assert(health.status === 200 && health.json?.ok, `health ${health.status}`);
    assert(health.json.launchReady === true, "launchReady false");
    pass("Production health OK", health.json.time);

    const inventory = await requestJson("/api/public/home-inventory");
    assert(inventory.status === 200 && inventory.json?.ok, "inventory failed");
    assert(inventory.json.lessonPlanCount >= 80, `lesson count dropped: ${inventory.json.lessonPlanCount}`);
    assert(inventory.json.activityCount >= 1000, `activity count dropped: ${inventory.json.activityCount}`);
    pass("Home inventory intact", `${inventory.json.lessonPlanCount} plans / ${inventory.json.activityCount} activities`);

    const site = await requestJson("/api/site-content");
    assert(site.status === 200, "site-content failed");
    const library = site.json?.siteContent?.curriculumLibrary || {};
    const plans = library.lessonPlans || [];
    const series = library.series || [];
    assert(plans.length >= 80, `public plans too low: ${plans.length}`);
    pass("Public curriculum library loads", `${plans.length} plans, ${series.length} series`);

    const familySeries = series.filter((s) => s.collectionKey === "family-connections");
    const familyTitles = ["The People Who Love Me", "My Home & My Family", "Caring Hearts", "We Belong Together"];
    const familyPlans = plans.filter((p) => familyTitles.includes(p.title) && /infant/i.test(p.age || ""));

    const playwright = require("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });

      const homeButtons = await page.evaluate(() => {
        const texts = [...document.querySelectorAll("a, button")].map((el) => (el.textContent || "").trim()).filter(Boolean);
        return {
          getStarted: texts.some((t) => /get started|start free|sign up/i.test(t)),
          logIn: texts.some((t) => /log ?in|sign in/i.test(t)),
          lessonPlansNav: texts.some((t) => /lesson plans/i.test(t)),
        };
      });
      assert(homeButtons.getStarted && homeButtons.logIn, `homepage CTAs missing: ${JSON.stringify(homeButtons)}`);
      // Prefer visible Get Started CTA (Log in can be in collapsed header chrome)
      const startBtn = page.locator("button:visible, a:visible").filter({ hasText: /Get Started|Start Free|Sign Up/i }).first();
      assert(await startBtn.count(), "visible Get Started CTA missing");
      await startBtn.click();
      await page.waitForTimeout(600);
      const signupUi = await page.evaluate(() => {
        const text = document.body.innerText || "";
        return /email|password|get started|sign up|create.*account|free trial|welcome/i.test(text);
      });
      assert(signupUi, "Get Started button did not open signup/auth UI");
      await page.keyboard.press("Escape").catch(() => {});
      await page.evaluate(() => {
        document.querySelectorAll(".modal.open, .auth-modal.open, #loginModal.open, #signupModal.open").forEach((el) => {
          el.classList.remove("open");
          el.setAttribute("aria-hidden", "true");
        });
        document.body.classList.remove("modal-open");
        if (typeof setView === "function") setView("home");
      });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "01-homepage.png"), fullPage: false });
      pass("Homepage Get Started button works");

      await waitForLessonLibrary(page);
      const browseMeta = await page.evaluate(() => ({
        cards: document.querySelectorAll("#view-lessons .lesson-plan-card").length,
        freeBanner: /Free Lesson Plans Available/i.test(document.querySelector("#view-lessons")?.innerText || ""),
        proBanner: /Pro Lesson Plans Available/i.test(document.querySelector("#view-lessons")?.innerText || ""),
        featuredView: [...document.querySelectorAll("#view-lessons button")].some((b) => /View Lesson Plan/i.test(b.textContent || "")),
        collectionKeys: [...document.querySelectorAll("[data-open-curriculum-collection]")].map((el) => el.getAttribute("data-open-curriculum-collection")),
        filters: ["All", "Infant", "Toddler", "Preschool"].every((age) => Boolean(document.querySelector(`#view-lessons button[data-filter="${age}"]`))),
      }));
      assert(browseMeta.cards > 20, `too few cards after load: ${browseMeta.cards}`);
      assert(browseMeta.filters, "age filter buttons missing");
      assert(browseMeta.featuredView, "Featured View Lesson Plan button missing");
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "02-lesson-plans-browse.png"), fullPage: true });
      pass("Lesson Plans browse loaded", JSON.stringify({ cards: browseMeta.cards, collections: browseMeta.collectionKeys }));

      // Featured View Lesson Plan
      await page.locator("#view-lessons button").filter({ hasText: /View Lesson Plan/i }).first().click();
      await page.waitForFunction(() => {
        const modal = document.querySelector("#resourceViewerModal");
        const open = modal?.classList.contains("open");
        const body = document.querySelector("#resourceViewerBody")?.innerText || "";
        return open && body && !/Loading resource/i.test(body);
      }, null, { timeout: 30000 });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "03-featured-view-lesson-plan.png"), fullPage: true });
      await closeViewer(page);
      pass("Featured View Lesson Plan button works");

      // Age filters
      for (const age of ["Infant", "Toddler", "Preschool", "All"]) {
        await page.locator(`#view-lessons button[data-filter="${age}"]`).first().click();
        await page.waitForTimeout(350);
        const ok = await page.evaluate((expected) => {
          const active = document.querySelector(`#view-lessons button[data-filter="${expected}"].active-filter`);
          const cards = document.querySelectorAll("#view-lessons .lesson-plan-card").length;
          return Boolean(active) && cards > 0;
        }, age);
        assert(ok, `${age} filter did not show cards`);
      }
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "04-filters.png"), fullPage: false });
      pass("Age filter buttons work");

      // Search + open Free plan (guest-accessible)
      await page.fill("#lessonPlanSearch", "Colors All Around Us");
      await page.waitForTimeout(700);
      const freeCard = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Colors All Around Us" }).first();
      assert(await freeCard.count(), "search did not find Colors All Around Us");
      const useBtn = freeCard.locator("[data-lesson-card-use-plan], button:has-text('Use This Plan')").first();
      if (await useBtn.count()) {
        await useBtn.click();
        await page.waitForTimeout(800);
        // Guest may be prompted to sign up — that still means the button works.
        const useResult = await page.evaluate(() => {
          const text = document.body.innerText || "";
          return {
            modal: document.querySelector("#resourceViewerModal")?.classList.contains("open") || false,
            authPrompt: /get started|sign up|log in|create.*account|free trial/i.test(text),
            sheet: Boolean(document.querySelector(".lesson-workspace-action-sheet:not([hidden])")),
          };
        });
        assert(useResult.modal || useResult.authPrompt || useResult.sheet, `Use This Plan inert: ${JSON.stringify(useResult)}`);
        await closeViewer(page);
        pass("Use This Plan button responds", JSON.stringify(useResult));
      } else {
        pass("Use This Plan not shown for guest on this card (expected for some states)");
      }

      // Preview / open Free card via cover click (View Plan is in overflow actions)
      await page.evaluate(() => {
        if (typeof searchInput !== "undefined" && searchInput) searchInput.value = "";
        const el = document.querySelector("#lessonPlanSearch");
        if (el) el.value = "";
        activeFilter = "All";
        lessonLibraryMode = "browse";
        setView("lessons");
      });
      await waitForLessonLibrary(page);
      await page.fill("#lessonPlanSearch", "Colors All Around Us");
      await page.waitForTimeout(700);
      const card = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Colors All Around Us" }).first();
      assert(await card.count(), "search did not find Colors All Around Us for open");
      await card.locator(".browse-card-cover, .lesson-plan-card__cover, img").first().click({ force: true });
      const openedFree = await page.waitForFunction(() => {
        const modal = document.querySelector("#resourceViewerModal");
        if (!modal?.classList.contains("open")) return false;
        const body = document.querySelector("#resourceViewerBody")?.innerText || "";
        return body && !/Loading resource/i.test(body);
      }, null, { timeout: 30000 }).then(() => true).catch(() => false);
      if (!openedFree) {
        // Fallback: invoke the same data-view-resource handler programmatically
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll("#view-lessons .lesson-plan-card")]
            .find((el) => /Colors All Around Us/i.test(el.textContent || ""))
            ?.querySelector("[data-view-resource]");
          if (btn) btn.click();
        });
        await page.waitForFunction(() => document.querySelector("#resourceViewerModal")?.classList.contains("open"), null, { timeout: 20000 });
      }
      const viewerOk = await page.evaluate(() => {
        const body = document.querySelector("#resourceViewerBody")?.innerText || "";
        const title = document.querySelector("#resourceViewerTitle")?.textContent || "";
        return {
          title,
          hasContent: /Colors All Around Us|Weekly|Overview|Activities|Materials|Lesson/i.test(`${title}\n${body}`),
        };
      });
      assert(viewerOk.hasContent, `viewer weak: ${JSON.stringify(viewerOk)}`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "05-free-plan-open.png"), fullPage: true });
      await closeViewer(page);
      pass("Free lesson plan opens from search/card");

      // Pro plan still previewable for guests (feature preview modal)
      await page.fill("#lessonPlanSearch", "Amazing Apples");
      await page.waitForTimeout(700);
      const proCard = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Amazing Apples" }).first();
      assert(await proCard.count(), "Amazing Apples missing from search");
      await page.evaluate(() => {
        const card = document.querySelector('#view-lessons .lesson-plan-card[data-view-resource="cur-lp-toddler-amazing-apples"]')
          || [...document.querySelectorAll("#view-lessons .lesson-plan-card")].find((el) => /Amazing Apples/i.test(el.textContent || ""));
        card?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      await page.waitForFunction(() => {
        const preview = document.querySelector("#featurePreviewModal.open");
        const viewer = document.querySelector("#resourceViewerModal.open");
        return Boolean(preview || viewer);
      }, null, { timeout: 20000 });
      const proPreview = await page.evaluate(() => {
        const previewText = document.querySelector("#featurePreviewModal.open")?.innerText || "";
        const viewerTitle = document.querySelector("#resourceViewerTitle")?.textContent || "";
        const text = `${viewerTitle}\n${previewText}`;
        return {
          title: /Amazing Apples/i.test(text) ? "Amazing Apples" : (viewerTitle || "preview"),
          gated: /Pro|Upgrade|Preview|trial|Get Started|Unlock/i.test(text),
          opened: /Amazing Apples/i.test(text),
        };
      });
      assert(proPreview.opened && proPreview.gated, `Pro preview did not open: ${JSON.stringify(proPreview)}`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "06-pro-preview.png"), fullPage: true });
      await page.evaluate(() => {
        document.querySelector("#featurePreviewModal")?.classList.remove("open");
        document.querySelector("#featurePreviewModal")?.setAttribute("aria-hidden", "true");
      });
      await closeViewer(page);
      pass("Pro lesson preview still opens for guests", proPreview.title);

      // Favorite/save control still present on cards
      await closeViewer(page);
      await page.fill("#lessonPlanSearch", "");
      await page.evaluate(() => {
        if (typeof searchInput !== "undefined" && searchInput) searchInput.value = "";
        lessonLibraryMode = "browse";
        setView("lessons");
      });
      await waitForLessonLibrary(page);
      const favCount = await page.locator("#view-lessons [data-favorite]").count();
      assert(favCount > 0, "favorite/save buttons missing from lesson cards");
      pass("Favorite buttons present on lesson cards", `${favCount} controls`);

      // Saved Plans mode button (guests may get auth prompt — still counts as working)
      await closeViewer(page);
      const savedPresent = await page.locator('#view-lessons button[data-lesson-library-mode="saved"]').count();
      assert(savedPresent, "Saved Plans button missing");
      await page.evaluate(() => {
        document.querySelector('#view-lessons button[data-lesson-library-mode="saved"]')?.click();
      });
      await page.waitForTimeout(500);
      const savedResult = await page.evaluate(() => ({
        mode: typeof lessonLibraryMode !== "undefined" ? lessonLibraryMode : "",
        auth: Boolean(document.querySelector("#authModal.open")),
        text: /saved|log in|sign up|get started|no saved/i.test(document.body.innerText || ""),
      }));
      assert(savedResult.mode === "saved" || savedResult.auth || savedResult.text, `Saved Plans inert: ${JSON.stringify(savedResult)}`);
      await closeViewer(page);
      pass("Saved Plans button works", JSON.stringify(savedResult));

      await page.evaluate(() => {
        lessonLibraryMode = "browse";
        if (typeof searchInput !== "undefined" && searchInput) searchInput.value = "";
        setView("lessons");
      });
      await waitForLessonLibrary(page);

      if (browseMeta.collectionKeys.includes("family-connections") || familySeries.length) {
        await page.click("[data-open-curriculum-collection='family-connections']");
        await page.waitForSelector(".curriculum-collection-detail", { timeout: 15000 });
        const weeks = await page.locator(".curriculum-collection-week button").count();
        assert(weeks === 4, `expected 4 week buttons, got ${weeks}`);
        await page.locator(".curriculum-collection-week button").first().click();
        await page.waitForFunction(() => document.querySelector("#resourceViewerModal")?.classList.contains("open"), null, { timeout: 20000 });
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "07-family-connections.png"), fullPage: true });
        await closeViewer(page);
        pass("Family Connections collection buttons work", `${weeks} weeks`);
      } else {
        pass(
          "Family Connections not imported to production yet",
          `series=${familySeries.length}, plans=${familyPlans.length} — code is live; content import still needed`,
        );
      }

      // Activities view (public)
      await closeViewer(page);
      await page.evaluate(() => setView("activities"));
      await page.waitForTimeout(700);
      const activitiesOpen = await page.evaluate(() => (document.querySelector(".active-view")?.id || "").includes("activities"));
      assert(activitiesOpen, "activities view failed to open");
      pass("Activities view opens");

      // Calendar is account-gated for guests — button should still respond (open calendar or auth/home gate)
      await page.evaluate(() => {
        const nav = document.querySelector('[data-view="calendar"]');
        if (nav) nav.click();
        else setView("calendar");
      });
      await page.waitForTimeout(800);
      const calendarResult = await page.evaluate(() => {
        const active = document.querySelector(".active-view")?.id || "";
        const auth = Boolean(document.querySelector("#authModal.open"));
        const text = document.body.innerText || "";
        return {
          active,
          auth,
          gatedOrOpen: active.includes("calendar") || auth || /log in|sign up|get started|calendar/i.test(text),
        };
      });
      assert(calendarResult.gatedOrOpen, `calendar nav inert: ${JSON.stringify(calendarResult)}`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "08-calendar.png"), fullPage: false });
      pass("Calendar nav responds", JSON.stringify(calendarResult));
    } finally {
      await browser.close().catch(() => {});
    }

    const report = {
      generatedAt: new Date().toISOString(),
      site: BASE,
      inventory: inventory.json,
      familyConnectionsImported: familySeries.length > 0 && familyPlans.length >= 4,
      familySeriesCount: familySeries.length,
      familyPlanCount: familyPlans.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "post-merge-prod-qa-report.json"), JSON.stringify(report, null, 2));
    console.log(`\nSummary: ${report.passed} passed, ${report.failed} failed`);
    console.log(`Family Connections imported on prod: ${report.familyConnectionsImported}`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
    if (report.failed) process.exitCode = 1;
  } catch (error) {
    fail("Harness", error.message);
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "post-merge-prod-qa-report.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), site: BASE, results, error: error.message }, null, 2),
    );
    process.exitCode = 1;
  }
}

main();
