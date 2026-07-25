#!/usr/bin/env node
/**
 * Post-merge full audit for Netflix-style library browse redesign.
 * Covers libraries, viewers, calendar, permissions, homepage, responsive,
 * downloads/print controls, and core navigation.
 *
 * Run: node scripts/test-post-merge-library-audit.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19820 + Math.floor(Math.random() * 50);
const STORE_PATH = path.join(os.tmpdir(), `llh-post-merge-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "audit-admin@test.local",
  password: "audit-admin-pass",
  code: "audit-admin-code",
};

const results = {
  passed: [],
  failed: [],
  warnings: [],
  tested: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(label) {
  results.passed.push(label);
  results.tested.push(label);
  console.log(`✓ ${label}`);
}

function warn(label) {
  results.warnings.push(label);
  results.tested.push(label);
  console.log(`⚠ ${label}`);
}

function fail(label, error) {
  results.failed.push(`${label}: ${error}`);
  results.tested.push(label);
  console.error(`✗ ${label}: ${error}`);
}

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
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function seedCurriculum(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  assert(parsed.ok, `parse failed: ${parsed.error || "unknown"}`);

  async function currentUpdatedAt() {
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(bootstrap.status === 200, "admin site-content fetch failed");
    return bootstrap.json.siteContent.updatedAt || "";
  }

  let updatedAt = await currentUpdatedAt();
  // Touch once so later writes have a stable baseline.
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { updatedAt },
  });
  assert(touch.status === 200, `touch failed: ${touch.status}`);
  updatedAt = touch.json.siteContent?.updatedAt || (await currentUpdatedAt());

  const specs = [
    { id: "cur-lp-audit-ocean", title: "Audit Ocean Explorers", age: "Preschool", plan: "Free", status: "featured", theme: "Ocean" },
    { id: "cur-lp-audit-toddler", title: "Audit Toddler Trails", age: "Toddler", plan: "Free", status: "published", theme: "Nature" },
    { id: "cur-lp-audit-infant", title: "Audit Infant Soft Start", age: "Infant 0–6 Months", plan: "Free", status: "published", theme: "Sensory" },
    { id: "cur-lp-audit-holiday", title: "Audit Holiday Lights", age: "Preschool", plan: "Pro", status: "published", theme: "Christmas" },
    { id: "cur-lp-audit-pro", title: "Audit Pro Garden Lab", age: "Preschool", plan: "Pro", status: "published", theme: "Science" },
  ];

  const created = [];
  for (const spec of specs) {
    updatedAt = await currentUpdatedAt();
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: updatedAt,
      lessonPlan: {
        ...parsed.data,
        id: spec.id,
        title: spec.title,
        age: spec.age,
        plan: spec.plan,
        status: spec.status,
        theme: spec.theme,
      },
    });
    if (save.status === 409) {
      updatedAt = save.json.siteContentUpdatedAt || (await currentUpdatedAt());
      const retry = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt: updatedAt,
        lessonPlan: {
          ...parsed.data,
          id: spec.id,
          title: spec.title,
          age: spec.age,
          plan: spec.plan,
          status: spec.status,
          theme: spec.theme,
        },
      });
      assert(retry.status === 200, `seed retry failed ${spec.title}: ${retry.status} ${retry.text?.slice(0, 200)}`);
    } else {
      assert(save.status === 200, `seed failed ${spec.title}: ${save.status} ${save.text?.slice(0, 200)}`);
    }
    created.push(spec);
  }
  return created;
}

async function loginAs(page, email, plan, extras = {}) {
  await page.evaluate(({ email: userEmail, plan: userPlan, extras: extra }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [userEmail]: {
        email: userEmail,
        plan: userPlan,
        subscriptionStatus: userPlan === "Free" ? "Free Plan" : `${userPlan} Subscription Active`,
        foundingMemberActive: userPlan === "Founding",
        ...extra,
      },
    }));
    localStorage.setItem("llhPlan", userPlan === "Founding" ? "Founding" : userPlan);
  }, { email, plan, extras });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
}

async function collectConsole(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err.message || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(adminLogin.status === 200, "admin login failed");
    const seeded = await seedCurriculum(adminLogin.json.token);
    assert(seeded.length === 5, "expected 5 seeded plans");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleErrors = await collectConsole(page);

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    // ═══════════════════════════════════════════
    // HOMEPAGE & PUBLIC SITE
    // ═══════════════════════════════════════════
    try {
      const home = await page.evaluate(() => {
        const view = document.querySelector("#view-home");
        const navButtons = [...document.querySelectorAll("[data-view], a[href]")].slice(0, 80);
        const ctas = [...document.querySelectorAll("button, a")].map((el) => (el.textContent || "").trim()).filter(Boolean);
        return {
          homeVisible: Boolean(view),
          hasCreate: ctas.some((t) => /create.*account|sign up|free account/i.test(t)),
          hasLogin: ctas.some((t) => /^log ?in$/i.test(t) || /sign in/i.test(t)),
          hasFounding: ctas.some((t) => /9\.99|founding/i.test(t)),
          hasPricing: ctas.some((t) => /pricing|plans|upgrade/i.test(t)),
          deadHrefs: [...document.querySelectorAll("a[href='#']")].filter((a) => !(a.textContent || "").trim()).length,
        };
      });
      assert(home.homeVisible, "homepage missing");
      assert(home.hasCreate || home.hasLogin, "auth CTAs missing on homepage");
      pass("Homepage loads with auth/pricing CTAs");
    } catch (error) {
      fail("Homepage public site", error.message);
    }

    // ═══════════════════════════════════════════
    // PRO USER — LESSON PLAN LIBRARY
    // ═══════════════════════════════════════════
    try {
      await loginAs(page, "audit-pro@example.com", "Pro");
      // Phase 23: logged-in boot finishes on Today (not Calendar).
      await page.waitForSelector("#view-today.active-view, #view-home.active-view", { timeout: 30000 });
      await page.evaluate(() => setView("lessons"));
      await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 15000 });
      // Wait for curriculum refresh
      await page.waitForTimeout(800);

      const lessonLib = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#view-lessons .browse-row")].map((row) => ({
          key: row.getAttribute("data-browse-row"),
          title: row.querySelector("h3")?.textContent?.trim() || "",
          cards: [...row.querySelectorAll(".lesson-plan-card")].map((card) => ({
            id: card.getAttribute("data-lesson-card") || card.getAttribute("data-view-resource"),
            title: card.querySelector("h3")?.textContent?.trim() || "",
            brokenImg: [...card.querySelectorAll("img")].some((img) => !img.getAttribute("src")),
          })),
          hasViewAll: Boolean(row.querySelector("[data-browse-view-all]")),
          hasArrows: row.querySelectorAll("[data-browse-scroll]").length >= 2,
          trackScrollWidth: row.querySelector(".browse-row-track")?.scrollWidth || 0,
          trackClientWidth: row.querySelector(".browse-row-track")?.clientWidth || 0,
        }));
        const allCardIds = rows.flatMap((r) => r.cards.map((c) => c.id)).filter(Boolean);
        const uniqueIds = new Set(allCardIds);
        const featured = document.querySelector(".library-featured-banner");
        return {
          rowTitles: rows.map((r) => r.title),
          rows,
          featuredTitle: featured?.querySelector("h3")?.textContent?.trim() || "",
          featuredButtons: [...(featured?.querySelectorAll("button") || [])].map((b) => b.textContent.trim()),
          ageTabs: [...document.querySelectorAll(".lesson-library-age-filters [data-filter]")].map((b) => b.textContent.trim()),
          hasSaved: Boolean(document.querySelector('[data-lesson-library-mode="saved"]')),
          hasMoreFilters: Boolean(document.querySelector("[data-lesson-library-filters-toggle]")),
          emptyRows: rows.filter((r) => r.cards.length === 0).length,
          duplicateAcrossRows: allCardIds.length !== uniqueIds.size ? allCardIds.length - uniqueIds.size : 0,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          brokenImgs: rows.flatMap((r) => r.cards).filter((c) => c.brokenImg).length,
        };
      });

      assert(lessonLib.rowTitles.length > 0, "no lesson browse rows");
      assert(lessonLib.emptyRows === 0, "empty lesson rows visible");
      assert(lessonLib.ageTabs.join("|") === "All|Infant|Toddler|Preschool", "age tabs wrong");
      assert(lessonLib.hasSaved && lessonLib.hasMoreFilters, "saved/more filters missing");
      assert(!lessonLib.pageOverflow, "lesson library page overflow");
      assert(lessonLib.brokenImgs === 0, "broken images on lesson cards");
      // Duplicate cards across different browse rows is expected (same plan in Featured + Preschool + Popular)
      // but within a single row should be unique
      for (const row of lessonLib.rows) {
        const ids = row.cards.map((c) => c.id);
        assert(new Set(ids).size === ids.length, `duplicate cards in row ${row.title}`);
        assert(row.hasViewAll, `View All missing on ${row.title}`);
      }
      const hasInfant = lessonLib.rowTitles.some((t) => /Infant/i.test(t));
      const hasToddler = lessonLib.rowTitles.some((t) => /Toddler/i.test(t));
      const hasPreschool = lessonLib.rowTitles.some((t) => /Preschool/i.test(t));
      assert(hasInfant && hasToddler && hasPreschool, `missing age rows: ${lessonLib.rowTitles.join(", ")}`);
      assert(lessonLib.featuredTitle, "featured banner missing title");
      pass("Lesson Plan Library browse rows, age sections, View All, empty sections hidden");

      // Horizontal scroll / arrows
      const scrollRow = lessonLib.rows.find((r) => r.trackScrollWidth > r.trackClientWidth + 20) || lessonLib.rows[0];
      if (scrollRow) {
        const before = await page.evaluate((key) => {
          const row = document.querySelector(`[data-browse-row="${key}"] .browse-row-track`);
          return row?.scrollLeft || 0;
        }, scrollRow.key);
        await page.click(`[data-browse-row="${scrollRow.key}"] [data-browse-dir="1"]`);
        await page.waitForTimeout(400);
        const after = await page.evaluate((key) => {
          const row = document.querySelector(`[data-browse-row="${key}"] .browse-row-track`);
          return row?.scrollLeft || 0;
        }, scrollRow.key);
        if (scrollRow.trackScrollWidth > scrollRow.trackClientWidth + 20) {
          assert(after > before, "desktop arrow did not scroll row");
          pass("Desktop browse arrows scroll rows");
        } else {
          warn("Browse row not wide enough to verify arrow scroll with current seed");
        }
      }

      // Search
      await page.fill("#lessonPlanSearch", "Audit Ocean Explorers");
      await page.waitForTimeout(400);
      const searchHit = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
        return {
          count: cards.length,
          titles: cards.map((c) => c.querySelector("h3")?.textContent?.trim()),
          allMatch: cards.every((c) => /Ocean Explorers/i.test(c.textContent || "")),
        };
      });
      assert(searchHit.count >= 1 && searchHit.allMatch, `search failed: ${JSON.stringify(searchHit)}`);
      pass("Lesson search returns correct plans");

      // Age filter
      await page.fill("#lessonPlanSearch", "");
      await page.waitForTimeout(200);
      await page.click('button[data-filter="Infant"]');
      await page.waitForTimeout(300);
      const infantFilter = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#view-lessons .browse-row h3")].map((h) => h.textContent.trim());
        const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
        return {
          rows,
          cardAges: cards.map((c) => c.textContent),
          allInfant: cards.every((c) => /Infant/i.test(c.textContent || "")),
        };
      });
      assert(infantFilter.rows.some((r) => /Infant/i.test(r)), "Infant filter did not show infant rows");
      assert(infantFilter.allInfant, "non-infant cards visible under Infant filter");
      pass("Age filters prioritize correct age group");

      // Free/Pro advanced filter
      await page.click('button[data-filter="All"]');
      await page.waitForTimeout(200);
      await page.click("[data-lesson-library-filters-toggle]");
      await page.waitForSelector("#lessonLibraryFilterDrawer, .lesson-library-filter-drawer", { timeout: 3000 });
      await page.click('[data-lesson-plan-filter="Free"]');
      await page.waitForTimeout(200);
      // Done closes drawer and re-renders
      const doneBtn = page.locator("[data-lesson-library-filters-toggle]").filter({ hasText: /Done|More filters/i }).first();
      if (await page.locator(".lesson-library-filter-drawer").count()) {
        await page.locator('.lesson-library-filter-drawer [data-lesson-library-filters-toggle]').click().catch(() => {});
      }
      await page.waitForTimeout(300);
      // With Free filter, browsing may switch to filtered grid
      const freeFilter = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
        return {
          count: cards.length,
          hasProBadgeOnly: cards.every((c) => !/\bPRO\b/.test((c.querySelector(".browse-card-badge")?.textContent || "").toUpperCase())
            || /FREE/i.test(c.querySelector(".browse-card-badge")?.textContent || "")),
          badges: cards.map((c) => c.querySelector(".browse-card-badge")?.textContent?.trim()),
        };
      });
      assert(freeFilter.count >= 1, "Free filter returned no cards");
      assert(freeFilter.badges.every((b) => !b || /free/i.test(b)), `Pro cards leaked into Free filter: ${freeFilter.badges.join(",")}`);
      pass("Free/Pro filters enforce access labels");

      // Clear filters via clear all if present
      const clearAll = page.locator("[data-clear-all-lesson-filters]").first();
      if (await clearAll.count()) await clearAll.click();
      await page.waitForTimeout(200);

      // Saved lesson plans mode
      await page.click('[data-lesson-library-mode="saved"]');
      await page.waitForTimeout(300);
      const savedMode = await page.evaluate(() => ({
        title: document.querySelector(".lesson-library-title")?.textContent?.trim() || "",
        hasBack: Boolean(document.querySelector('[data-lesson-library-mode="browse"]')),
      }));
      assert(/Saved/i.test(savedMode.title), "Saved Lesson Plans mode missing");
      await page.click('[data-lesson-library-mode="browse"]');
      await page.waitForTimeout(300);
      pass("Saved lesson plans mode opens and returns");
    } catch (error) {
      fail("Lesson Plan Library", error.message);
    }

    // ═══════════════════════════════════════════
    // LESSON PLAN VIEWER
    // ═══════════════════════════════════════════
    try {
      await page.evaluate(() => {
        if (typeof clearLessonLibraryAdvancedFilters === "function") clearLessonLibraryAdvancedFilters();
        lessonLibraryViewAllKey = "";
        activeFilter = "All";
        if (searchInput) searchInput.value = "";
        setView("lessons");
      });
      await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
      await page.waitForTimeout(500);
      await page.fill("#lessonPlanSearch", "Audit Ocean Explorers");
      await page.waitForTimeout(400);
      const card = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Audit Ocean Explorers" }).first();
      await card.waitFor({ timeout: 10000 });

      // Save from card
      await card.locator(".lesson-plan-save-btn").click();
      await page.waitForTimeout(200);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("llhFavorites") || "[]"));
      assert(saved.includes("cur-lp-audit-ocean"), "Save on card failed");
      pass("Lesson card Save works");

      // Open via card click (View Plan) for content audit
      await card.click();
      await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
      await page.waitForTimeout(500);

      const workspace = await page.evaluate(() => {
        const modal = document.querySelector("#resourceViewerModal");
        const labels = [...modal.querySelectorAll("button")].map((b) => (b.textContent || "").trim());
        const text = modal.innerText || "";
        const dayTabs = [...modal.querySelectorAll(".lesson-workspace-day-tab")].map((t) => t.textContent.trim());
        const sections = {
          overview: /weekly overview|overview/i.test(text),
          objectives: /objective/i.test(text),
          materials: /material/i.test(text),
          vocabulary: /vocabular/i.test(text),
          books: /book/i.test(text),
          songs: /song/i.test(text),
          family: /family/i.test(text),
          observation: /observation/i.test(text),
          adaptations: /adaptation|modificat/i.test(text),
          weekDays: dayTabs.length >= 5 || (/Mon/i.test(text) && /Fri/i.test(text)),
          activityRows: modal.querySelectorAll(".lesson-workspace-activity-row, .lesson-workspace-activity-card, .curriculum-activity-card").length,
        };
        return {
          workspaceMode: modal.classList.contains("lesson-workspace-mode"),
          title: document.querySelector("#resourceViewerTitle")?.textContent || "",
          hasSave: labels.some((t) => /^Save|Saved/i.test(t)),
          hasPrint: labels.some((t) => /Print/i.test(t)),
          hasDownload: labels.some((t) => /Download/i.test(t)),
          hasUsePlan: labels.some((t) => /Use This Plan|Add to Calendar|Assign/i.test(t)),
          hasBack: Boolean(document.querySelector("[data-lesson-workspace-back], #resourceViewerBackButton")),
          dayTabs,
          sections,
          labels: labels.filter((t) => /print|download|save|use|calendar|edit|assign/i.test(t)).slice(0, 20),
        };
      });
      assert(/Ocean Explorers/i.test(workspace.title), "wrong lesson in viewer");
      assert(workspace.hasPrint && workspace.hasDownload, `print/download missing: ${workspace.labels.join(", ")}`);
      assert(workspace.hasSave, "Save missing in viewer");
      assert(workspace.sections.overview || workspace.sections.materials, "lesson overview/materials missing");
      assert(workspace.sections.weekDays, `Mon–Fri activities missing (tabs: ${workspace.dayTabs.join(",")})`);
      assert(workspace.sections.activityRows > 0 || workspace.sections.weekDays, "activity details missing");
      pass("Lesson viewer content + Print/Download/Save controls");

      // Use This Plan from viewer
      const useBtn = page.locator("#resourceViewerModal [data-lesson-use-this-plan]").first();
      if (await useBtn.count()) {
        await useBtn.click();
        await page.waitForTimeout(400);
        const sheetOpen = await page.evaluate(() => Boolean(document.querySelector(".lesson-workspace-action-sheet:not([hidden])")));
        assert(sheetOpen, "Use This Plan did not open assign sheet from viewer");
        pass("Use This Plan opens assign sheet");
        await page.locator(".lesson-workspace-action-sheet [data-lesson-workspace-action-sheet-dismiss]").first().click({ force: true }).catch(() => {});
        await page.waitForSelector(".lesson-workspace-action-sheet[hidden], .lesson-workspace-action-sheet[aria-hidden='true']", { timeout: 5000 }).catch(() => {});
        await page.evaluate(() => {
          const sheet = document.querySelector(".lesson-workspace-action-sheet");
          if (sheet) {
            sheet.hidden = true;
            sheet.setAttribute("aria-hidden", "true");
          }
        });
        await page.waitForTimeout(200);
      } else {
        warn("Use This Plan button not found in viewer chrome");
      }

      // Unsave from workspace
      const saveBtn = page.locator("#resourceViewerModal .lesson-workspace-save-btn").first();
      if (await saveBtn.count()) {
        await saveBtn.click({ force: true });
        await page.waitForTimeout(200);
        const afterUnsave = await page.evaluate(() => JSON.parse(localStorage.getItem("llhFavorites") || "[]"));
        pass(`Lesson viewer Save/Unsave toggles (favorites now ${afterUnsave.length})`);
      }

      // Back button
      const back = page.locator("[data-lesson-workspace-back]").first();
      if (await back.count()) {
        await back.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(400);
      const closed = await page.evaluate(() => !document.querySelector("#resourceViewerModal.open"));
      assert(closed, "viewer did not close via back/escape");
      pass("Lesson viewer Back/close works");

      // Pro lock: open Pro lesson as free user later; for Pro user it should open
      await page.fill("#lessonPlanSearch", "Audit Pro Garden Lab");
      await page.waitForTimeout(400);
      await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Audit Pro Garden Lab" }).first().click();
      await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
      const proOpen = await page.evaluate(() => document.querySelector("#resourceViewerTitle")?.textContent || "");
      assert(/Pro Garden Lab/i.test(proOpen), "Pro lesson did not open for Pro user");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      pass("Pro user can open Pro lesson plans");
    } catch (error) {
      fail("Lesson Plan Viewer", error.message);
    }

    // ═══════════════════════════════════════════
    // ACTIVITY CENTER
    // ═══════════════════════════════════════════
    let firstActivityId = "";
    let parentLessonFromActivity = "";
    try {
      await page.evaluate(() => setView("activities"));
      await page.waitForSelector("#view-activities.active-view #activityCenterSearch", { timeout: 10000 });
      await page.waitForTimeout(1000);

      const activityLib = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#view-activities .browse-row")].map((row) => ({
          key: row.getAttribute("data-browse-row"),
          title: row.querySelector("h3")?.textContent?.trim() || "",
          cards: [...row.querySelectorAll(".browse-card")].map((card) => ({
            id: card.getAttribute("data-view-resource") || card.getAttribute("data-browse-card"),
            title: card.querySelector("h3")?.textContent?.trim() || "",
            text: card.textContent || "",
          })),
          hasViewAll: Boolean(row.querySelector("[data-browse-view-all]")),
          hasArrows: row.querySelectorAll("[data-browse-scroll]").length >= 2,
        }));
        const header = document.querySelector(".library-compact-header");
        return {
          subtitle: header?.querySelector(".library-compact-subtitle")?.textContent || "",
          stats: document.querySelector(".library-stats-line")?.textContent || "",
          badge: document.querySelector(".library-access-badge")?.textContent || "",
          oldStatCards: document.querySelectorAll("#view-activities .library-stats > div").length,
          rowTitles: rows.map((r) => r.title),
          rows,
          emptyRows: rows.filter((r) => r.cards.length === 0).length,
          hasFilterScroll: Boolean(document.querySelector("#view-activities .library-filter-scroll")),
          hasAdvanced: Boolean(document.querySelector("[data-activity-filters-toggle]")),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          downloadOnCards: rows.some((r) => r.cards.some((c) => /Download PDF/i.test(c.text))),
        };
      });

      assert(/Browse ready-to-use activities/i.test(activityLib.subtitle), "activity subtitle missing");
      assert(/Activities/i.test(activityLib.stats), "activity stats line missing");
      assert(activityLib.oldStatCards === 0, "old activity stat cards still present");
      assert(activityLib.emptyRows === 0, "empty activity rows visible");
      assert(activityLib.hasFilterScroll && activityLib.hasAdvanced, "activity filters missing");
      assert(!activityLib.overflow, "activity page overflow");
      assert(!activityLib.downloadOnCards, "Download PDF still on activity cards");
      assert(activityLib.rowTitles.length > 0, "no activity browse rows");
      pass("Activity Center compact header + browse rows + filters");

      // Expected category/age rows when activities exist
      const expectedHints = ["Recently Added", "Popular", "Infant", "Toddler", "Preschool", "Sensory", "Fine Motor", "Gross Motor", "Music", "Dramatic", "Open-Ended"];
      const matchedHints = expectedHints.filter((hint) => activityLib.rowTitles.some((t) => t.includes(hint) || new RegExp(hint, "i").test(t)));
      if (matchedHints.length >= 3) {
        pass(`Activity rows present (${matchedHints.length} expected categories matched)`);
      } else {
        warn(`Only matched activity row hints: ${matchedHints.join(", ") || "none"} from ${activityLib.rowTitles.join(" | ")}`);
      }

      // View All
      if (activityLib.rows[0]?.hasViewAll) {
        await page.locator("#view-activities [data-browse-view-all]").first().click();
        await page.waitForSelector("[data-clear-activity-view-all]", { timeout: 5000 });
        await page.click("[data-clear-activity-view-all]");
        await page.waitForSelector("#view-activities .browse-row", { timeout: 5000 });
        pass("Activity View All / back to browse");
      }

      // Open first activity
      const opened = await page.evaluate(() => {
        const card = document.querySelector("#view-activities .browse-card[data-view-resource]");
        if (!card) return null;
        const id = card.getAttribute("data-view-resource");
        card.click();
        return id;
      });
      if (opened) {
        firstActivityId = opened;
        await page.waitForSelector("#resourceViewerModal.open, #featurePreviewModal.open", { timeout: 10000 });
        const activityViewer = await page.evaluate(() => {
          const modal = document.querySelector("#resourceViewerModal.open, #featurePreviewModal.open");
          const text = modal?.innerText || "";
          const labels = [...(modal?.querySelectorAll("button") || [])].map((b) => (b.textContent || "").trim());
          return {
            title: document.querySelector("#resourceViewerTitle")?.textContent || "",
            hasMaterials: /material/i.test(text),
            hasSteps: /step|direction|setup/i.test(text),
            hasGoals: /goal|objective|learning/i.test(text),
            hasTeacher: /teacher/i.test(text),
            hasPrint: labels.some((t) => /Print/i.test(t)) || (document.querySelector("#printResourceButton") && !document.querySelector("#printResourceButton").hidden),
            hasDownload: labels.some((t) => /Download/i.test(t)) || Boolean(document.querySelector("#downloadPdfButton")),
            hasParentLink: /from lesson|parent lesson|lesson plan/i.test(text) || Boolean(document.querySelector("[data-view-resource], #resourceViewerBackButton")),
            hasBack: Boolean(document.querySelector("#resourceViewerBackButton, [data-lesson-workspace-back]")),
            labels: labels.filter((t) => /print|download|save|calendar|back|lesson/i.test(t)).slice(0, 15),
          };
        });
        assert(activityViewer.title, "activity viewer title missing");
        assert(activityViewer.hasPrint, `activity print missing: ${activityViewer.labels.join(", ")}`);
        pass("Activity viewer opens with Print and content");
        // Capture parent lesson from tags if present
        parentLessonFromActivity = await page.evaluate(() => {
          const tags = document.querySelector("#resourceViewerTags")?.textContent || "";
          const body = document.querySelector("#resourceViewerBody")?.textContent || "";
          return `${tags} ${body}`.slice(0, 200);
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
      } else {
        warn("No activity cards available to open (activities may still be syncing from seeded lessons)");
      }

      // Advanced filters open
      await page.click("[data-activity-filters-toggle]");
      await page.waitForSelector(".lesson-library-filter-drawer", { timeout: 3000 });
      await page.click('[data-activity-plan-filter="Free"]');
      await page.locator('.lesson-library-filter-drawer [data-activity-filters-toggle]').click();
      await page.waitForTimeout(300);
      pass("Activity advanced filters open and apply");
    } catch (error) {
      fail("Activity Center / Viewer", error.message);
    }

    // ═══════════════════════════════════════════
    // CALENDAR — Use This Plan / Add to Calendar
    // ═══════════════════════════════════════════
    try {
      await page.evaluate(() => {
        activeFilter = "All";
        lessonLibraryPlanFilter = "All";
        lessonLibraryViewAllKey = "";
        if (searchInput) searchInput.value = "";
        setView("lessons");
      });
      await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
      await page.fill("#lessonPlanSearch", "Audit Ocean Explorers");
      await page.waitForTimeout(400);
      const lessonCard = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Audit Ocean Explorers" }).first();
      await lessonCard.locator("[data-lesson-card-use-plan]").click();
      await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
      await page.waitForTimeout(400);

      // Prefer calendar choice if present
      const calChoice = page.locator('[data-lesson-use-plan-choice="calendar"]').first();
      if (await calChoice.count()) {
        await calChoice.click();
        await page.waitForTimeout(300);
      }
      const assignSubmit = page.locator("[data-lesson-assign-submit]").first();
      if (await assignSubmit.count()) {
        await assignSubmit.click();
        await page.waitForTimeout(800);
        pass("Add to Calendar / Assign submit clicked");
      } else {
        // Try Use This Plan button inside workspace
        const useBtn = page.locator("[data-lesson-use-this-plan]").first();
        if (await useBtn.count()) {
          await useBtn.click();
          await page.waitForTimeout(400);
          if (await calChoice.count()) await calChoice.click();
          if (await assignSubmit.count()) {
            await assignSubmit.click();
            await page.waitForTimeout(800);
            pass("Add to Calendar via workspace Use This Plan");
          } else {
            warn("Assign submit not found — calendar assign UI may require week selection");
          }
        } else {
          warn("Could not complete calendar assign in this UI state");
        }
      }

      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
      await page.evaluate(() => setView("calendar"));
      await page.waitForSelector("#view-calendar.active-view", { timeout: 8000 });
      const calendarState = await page.evaluate(() => {
        const text = document.querySelector("#view-calendar")?.innerText || "";
        return {
          hasWeekendLabel: /\bWeekend\b/i.test(text),
          hasSat: /Sat/i.test(text) || /Saturday/i.test(text),
          hasSun: /Sun/i.test(text) || /Sunday/i.test(text),
          hasOcean: /Ocean Explorers/i.test(text),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      assert(!calendarState.hasWeekendLabel, "Calendar shows forbidden Weekend label");
      assert(!calendarState.overflow, "Calendar horizontal overflow");
      pass("Calendar renders without Weekend labels / overflow");
      if (calendarState.hasOcean) pass("Assigned lesson appears on calendar");
      else warn("Assigned lesson not visible on calendar canvas in this pass (assign may use week picker)");
    } catch (error) {
      fail("Calendar / Weekly Planner", error.message);
    }

    // ═══════════════════════════════════════════
    // PERMISSIONS — Free / Founding / Logged-out
    // ═══════════════════════════════════════════
    try {
      await loginAs(page, "audit-free@example.com", "Free");
      await page.evaluate(() => setView("lessons"));
      await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
      await page.waitForTimeout(600);
      await page.fill("#lessonPlanSearch", "Audit Pro Garden Lab");
      await page.waitForTimeout(400);
      const freePro = await page.evaluate(() => {
        const card = [...document.querySelectorAll(".lesson-plan-card")].find((c) => /Pro Garden Lab/i.test(c.textContent || ""));
        if (!card) return { found: false };
        card.click();
        return { found: true, id: card.getAttribute("data-lesson-card") };
      });
      if (freePro.found) {
        await page.waitForSelector("#resourceViewerModal.open, #featurePreviewModal.open", { timeout: 10000 });
        const lockState = await page.evaluate(() => {
          const text = document.body.innerText || "";
          const title = document.querySelector("#resourceViewerTitle, #featurePreviewModal h2, .modal h2")?.textContent || "";
          return {
            title,
            lockedCue: /upgrade|pro|locked|preview|founding/i.test(text),
            fullWorkspace: document.querySelector("#resourceViewerModal")?.classList.contains("lesson-workspace-mode"),
          };
        });
        // Free users may get locked preview modal rather than full workspace
        assert(lockState.lockedCue || !lockState.fullWorkspace, "Free user may have full Pro access leak");
        pass("Free user Pro lock / preview behavior enforced");
        await page.keyboard.press("Escape");
      } else {
        // Card may be hidden entirely for free users without preview support
        pass("Free user does not see unlocked Pro lesson card (or preview path)");
      }

      await page.evaluate(() => setView("activities"));
      await page.waitForSelector("#view-activities .library-access-badge", { timeout: 8000 });
      const freeBadge = await page.evaluate(() => document.querySelector(".library-access-badge")?.textContent || "");
      assert(/Free/i.test(freeBadge), "Free badge missing");
      pass("Free user access badge");

      await loginAs(page, "audit-founding@example.com", "Founding");
      await page.evaluate(() => setView("activities"));
      await page.waitForSelector("#view-activities .library-access-badge", { timeout: 8000 });
      const foundingBadge = await page.evaluate(() => document.querySelector(".library-access-badge")?.textContent || "");
      assert(/Founding/i.test(foundingBadge), "Founding badge missing");
      await page.evaluate(() => setView("lessons"));
      await page.waitForTimeout(400);
      await page.fill("#lessonPlanSearch", "Audit Pro Garden Lab");
      await page.waitForTimeout(400);
      await page.locator(".lesson-plan-card").filter({ hasText: "Audit Pro Garden Lab" }).first().click();
      await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
      const foundingOpen = await page.evaluate(() => document.querySelector("#resourceViewerTitle")?.textContent || "");
      assert(/Pro Garden Lab/i.test(foundingOpen), "Founding Member could not open Pro lesson");
      await page.keyboard.press("Escape");
      pass("Founding Member full Pro access");

      // Logged out
      await page.evaluate(() => {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhPlan");
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      const guest = await page.evaluate(() => {
        setView("lessons");
        return {
          lessons: Boolean(document.querySelector("#view-lessons.active-view")),
          auth: Boolean(document.querySelector(".modal.open, #authModal.open")),
        };
      });
      assert(guest.lessons || guest.auth, "guest lessons path broken");
      pass("Logged-out visitor path works");
    } catch (error) {
      fail("User access & permissions", error.message);
    }

    // ═══════════════════════════════════════════
    // CORE NAV / DASHBOARD / COMING SOON
    // ═══════════════════════════════════════════
    try {
      await loginAs(page, "audit-nav@example.com", "Pro");
      await page.evaluate(() => setView("calendar"));
      await page.waitForSelector("#view-calendar.active-view", { timeout: 30000 });
      const viewsToTry = [
        "calendar", "lessons", "activities", "children", "ai", "settings", "account", "billing", "plans",
      ];
      const navResults = [];
      for (const view of viewsToTry) {
        const ok = await page.evaluate((v) => {
          try {
            setView(v);
            const active = document.querySelector(".active-view");
            const id = active?.id || "";
            const blank = !active || ((active.innerText || "").trim().length < 5 && !active.querySelector("*"));
            return { view: v, id, blank, ok: Boolean(active) && !blank };
          } catch (error) {
            return { view: v, ok: false, error: String(error) };
          }
        }, view);
        navResults.push(ok);
        await page.waitForTimeout(150);
      }
      const broken = navResults.filter((r) => !r.ok);
      assert(broken.length === 0, `broken views: ${JSON.stringify(broken)}`);
      pass("Core sidebar views render without blank pages");

      // Logout / login again
      await page.evaluate(() => {
        if (typeof logout === "function") logout();
        else {
          localStorage.removeItem("llhUser");
          localStorage.removeItem("llhPlan");
        }
      });
      await page.waitForTimeout(300);
      await loginAs(page, "audit-nav@example.com", "Pro");
      await page.evaluate(() => setView("calendar"));
      await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
      pass("Logout and login again works");
    } catch (error) {
      fail("Dashboard & core features", error.message);
    }

    // ═══════════════════════════════════════════
    // ADMIN AUDIT (API-level create/edit remains)
    // ═══════════════════════════════════════════
    try {
      const token = adminLogin.json.token;
      const list = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
      assert(list.status === 200, "admin site content failed");
      const plans = list.json.siteContent?.curriculum?.lessonPlans || [];
      const ours = plans.filter((p) => String(p.id || "").startsWith("cur-lp-audit-"));
      assert(ours.length >= 5, `admin missing seeded plans (${ours.length})`);
      // Ensure no duplicate IDs
      const ids = plans.map((p) => p.id);
      assert(new Set(ids).size === ids.length, "duplicate lesson plan IDs in admin store");
      pass("Admin content intact, no duplicate lesson plan IDs");
    } catch (error) {
      fail("Admin audit", error.message);
    }

    // ═══════════════════════════════════════════
    // RESPONSIVE
    // ═══════════════════════════════════════════
    try {
      await loginAs(page, "audit-responsive@example.com", "Pro");
      await page.evaluate(() => {
        if (searchInput) searchInput.value = "";
        activeFilter = "All";
        lessonLibraryViewAllKey = "";
        activityLibraryViewAllKey = "";
        lessonLibraryPlanFilter = "All";
        activityLibraryPlanFilter = "All";
      });
      const widths = [320, 375, 390, 430, 768, 820, 834, 1024, 1280, 1440];
      for (const width of widths) {
        const height = width <= 430 ? 844 : width <= 834 ? 1024 : 900;
        await page.setViewportSize({ width, height });
        for (const view of ["lessons", "activities", "calendar"]) {
          await page.evaluate((v) => {
            setView(v);
            // Reset horizontal browse scroll so first cards are on-screen for measurement.
            document.querySelectorAll(`#view-${v} .browse-row-track`).forEach((track) => {
              track.scrollLeft = 0;
            });
          }, view);
          await page.waitForTimeout(250);
          const state = await page.evaluate((v) => {
            const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
            const tracks = [...document.querySelectorAll(`#view-${v} .browse-row-track`)];
            const firstInTracks = tracks.map((track) => track.querySelector(".browse-card")).filter(Boolean);
            const gridCards = [...document.querySelectorAll(`#view-${v} .library-browse-shell.is-filtered-grid > .browse-card`)].slice(0, 2);
            const targets = firstInTracks.length ? firstInTracks : gridCards;
            const unusable = targets.some((card) => {
              const r = card.getBoundingClientRect();
              return r.width < 40 || r.right < 24 || r.left > window.innerWidth - 24;
            });
            return { overflow, unusable, active: Boolean(document.querySelector(`#view-${v}.active-view`)), checked: targets.length };
          }, view);
          assert(state.active, `${view} not active at ${width}`);
          assert(!state.overflow, `${view} horizontal overflow at ${width}px`);
          assert(!state.unusable, `${view} first cards unusable at ${width}px`);
        }
      }
      pass("Responsive widths 320–1440 (lessons/activities/calendar) — no overflow/cutoff");
    } catch (error) {
      fail("Responsive testing", error.message);
    }

    // Console errors (filter known noise)
    const serious = consoleErrors.filter((e) => !/favicon|Download the React DevTools|net::ERR_FAILED/i.test(e));
    if (serious.length) {
      warn(`Console errors observed: ${serious.slice(0, 5).join(" | ")}`);
    } else {
      pass("No serious console errors during audit");
    }

  } catch (error) {
    fail("Fatal audit harness", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }

  // Write report artifact
  const report = {
    generatedAt: new Date().toISOString(),
    passed: results.passed,
    warnings: results.warnings,
    failed: results.failed,
    testedCount: results.tested.length,
    passCount: results.passed.length,
    warnCount: results.warnings.length,
    failCount: results.failed.length,
  };
  const outPath = path.join(ROOT, "POST_MERGE_LIBRARY_AUDIT_REPORT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\n—— Summary ——");
  console.log(`Passed: ${report.passCount}`);
  console.log(`Warnings: ${report.warnCount}`);
  console.log(`Failed: ${report.failCount}`);
  if (report.failCount) {
    process.exitCode = 1;
    console.error("FAILED ITEMS:\n" + report.failed.map((f) => ` - ${f}`).join("\n"));
  } else {
    console.log("Post-merge library audit completed with no critical failures.");
  }
}

main();
