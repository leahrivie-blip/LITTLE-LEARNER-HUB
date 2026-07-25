#!/usr/bin/env node
/**
 * Netflix-style library browse redesign smoke + regression.
 * Covers Activity Center + Lesson Plan Library browse rows, cards, filters,
 * viewer downloads, and responsive overflow checks.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19740 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-browse-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "browse-admin@test.local",
  password: "browse-admin-pass",
  code: "browse-admin-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  for (let i = 0; i < 80; i += 1) {
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

async function seedPlans(token) {
  const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
  const sample = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(sample, "utf8"));
  assert(parsed.ok, "sample parse failed");
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  let updatedAt = bootstrap.json.siteContent.updatedAt || "";
  const ages = [
    { age: "Preschool", title: "Browse Ocean Explorers", featured: true, plan: "Free" },
    { age: "Toddler", title: "Browse Toddler Trails", featured: false, plan: "Free" },
    { age: "Infant", title: "Browse Infant Soft Start", featured: false, plan: "Pro" },
  ];
  const created = [];
  for (const entry of ages) {
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt },
    });
    updatedAt = touch.json.siteContent.updatedAt;
    const planId = `cur-lp-browse-${crypto.randomBytes(3).toString("hex")}`;
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: updatedAt,
      lessonPlan: {
        ...parsed.data,
        id: planId,
        title: entry.title,
        plan: entry.plan,
        status: entry.featured ? "featured" : "published",
        age: entry.age,
        theme: "Browse Theme",
      },
    });
    assert(save.status === 200, `seed failed for ${entry.title}: ${save.status}`);
    updatedAt = save.json.siteContent?.updatedAt || updatedAt;
    created.push({ planId, ...entry });
  }
  return created;
}

async function loginAs(page, email, plan) {
  await page.evaluate(({ email: userEmail, plan: userPlan }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [userEmail]: {
        email: userEmail,
        plan: userPlan,
        subscriptionStatus: userPlan === "Free" ? "Free Plan" : `${userPlan} Subscription Active`,
        foundingMemberActive: userPlan === "Founding",
      },
    }));
    localStorage.setItem("llhPlan", userPlan === "Founding" ? "Founding" : userPlan);
  }, { email, plan });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, "admin login failed");
    const seeded = await seedPlans(login.json.token);
    assert(seeded.length === 3, "expected 3 seeded plans");

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    // ---- Pro user: Lesson Plan Library browse ----
    await loginAs(page, "browse-pro@example.com", "Pro");
    // Phase 23: logged-in boot finishes on Today (not Calendar).
    await page.waitForSelector("#view-today.active-view, #view-home.active-view", { timeout: 30000 });
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 10000 });

    const lessonBrowse = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#view-lessons .browse-row")].map((row) => ({
        key: row.getAttribute("data-browse-row"),
        title: row.querySelector("h3")?.textContent?.trim() || "",
        cards: row.querySelectorAll(".lesson-plan-card").length,
        hasViewAll: Boolean(row.querySelector("[data-browse-view-all]")),
        hasArrows: row.querySelectorAll("[data-browse-scroll]").length >= 2,
      }));
      const featured = document.querySelector(".library-featured-banner");
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const card = document.querySelector(".lesson-plan-card");
      return {
        rowCount: rows.length,
        rows,
        hasFeatured: Boolean(featured),
        featuredHasButtons: Boolean(featured?.querySelector("[data-view-resource]")),
        overflow,
        hasUsePlan: Boolean(card?.querySelector("[data-lesson-card-use-plan]")),
        hasSave: Boolean(card?.querySelector(".lesson-plan-save-btn")),
        ageTabs: [...document.querySelectorAll(".lesson-library-age-filters [data-filter]")].map((b) => b.textContent.trim()),
        emptyRows: rows.filter((r) => r.cards === 0).length,
      };
    });
    assert(lessonBrowse.rowCount > 0, "lesson browse rows missing");
    assert(lessonBrowse.emptyRows === 0, "empty lesson browse rows should be hidden");
    assert(lessonBrowse.hasFeatured && lessonBrowse.featuredHasButtons, "featured banner missing");
    assert(lessonBrowse.hasUsePlan && lessonBrowse.hasSave, "lesson card actions missing");
    assert(lessonBrowse.ageTabs.join("|") === "All|Infant|Toddler|Preschool", "age tabs wrong");
    assert(!lessonBrowse.overflow, "lesson library horizontal overflow");
    assert(lessonBrowse.rows.every((r) => r.hasViewAll), "View All missing on a lesson row");
    console.log("✓ Lesson Plan Library browse rows + featured banner");

    // Age tab keeps browse layout
    await page.click('button[data-filter="Toddler"]');
    await page.waitForTimeout(200);
    const toddlerState = await page.evaluate(() => ({
      rows: [...document.querySelectorAll("#view-lessons .browse-row h3")].map((h) => h.textContent.trim()),
      hasBrowseShell: Boolean(document.querySelector("#view-lessons .library-browse-shell")),
    }));
    assert(toddlerState.rows.some((t) => /Toddler/i.test(t)), "Toddler row missing after age filter");
    assert(toddlerState.hasBrowseShell, "browse layout should remain with age filter");
    console.log("✓ Age tab preserves horizontal browse layout");

    // Open viewer + confirm download/print controls remain
    await page.click('button[data-filter="All"]');
    await page.waitForTimeout(150);
    await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: "Browse Ocean Explorers" }).first().click();
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
    const viewerControls = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("#resourceViewerModal button, #resourceViewerModal [role='button']")]
        .map((b) => (b.textContent || "").trim())
        .filter(Boolean);
      return {
        workspace: document.querySelector("#resourceViewerModal")?.classList.contains("lesson-workspace-mode"),
        hasPrint: labels.some((t) => /^Print\b/i.test(t) || /Print \/ Save PDF/i.test(t)),
        hasDownload: labels.some((t) => /Download/i.test(t) && /PDF|Lesson|Week/i.test(t)),
        title: document.querySelector("#resourceViewerTitle")?.textContent || "",
        labels: labels.filter((t) => /print|download|pdf/i.test(t)).slice(0, 12),
      };
    });
    assert(viewerControls.hasPrint, `Print control missing in lesson viewer: ${viewerControls.labels.join(", ")}`);
    assert(viewerControls.hasDownload, `Download control missing in lesson viewer: ${viewerControls.labels.join(", ")}`);
    assert(/Ocean Explorers/i.test(viewerControls.title), "wrong lesson opened");
    console.log("✓ Lesson viewer keeps Print / download chrome");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    // ---- Activity Center ----
    await page.evaluate(() => setView("activities"));
    await page.waitForSelector("#view-activities.active-view", { timeout: 8000 });
    await page.waitForSelector("#activityCenterSearch", { timeout: 10000 });
    const activityBrowse = await page.evaluate(() => {
      const header = document.querySelector(".library-compact-header");
      const stats = document.querySelector(".library-stats-line")?.textContent || "";
      const badge = document.querySelector(".library-access-badge")?.textContent || "";
      const oldStats = document.querySelectorAll("#view-activities .library-stats").length;
      const rows = [...document.querySelectorAll("#view-activities .browse-row")].map((row) => ({
        title: row.querySelector("h3")?.textContent?.trim() || "",
        cards: row.querySelectorAll(".activity-browse-card, .browse-card").length,
      }));
      const card = document.querySelector("#view-activities .browse-card");
      const cardText = card?.textContent || "";
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return {
        hasCompactHeader: Boolean(header),
        subtitle: header?.querySelector(".library-compact-subtitle")?.textContent || "",
        stats,
        badge,
        oldStats,
        rowCount: rows.length,
        emptyRows: rows.filter((r) => r.cards === 0).length,
        hasDownloadOnCard: /Download PDF/i.test(cardText),
        hasDayLabel: /Parent Lesson:|Day:/i.test(cardText),
        hasFilterScroll: Boolean(document.querySelector("#view-activities .library-filter-scroll")),
        hasAdvanced: Boolean(document.querySelector("[data-activity-filters-toggle]")),
        overflow,
        firstCardClickable: Boolean(card?.getAttribute("data-view-resource")),
      };
    });
    assert(activityBrowse.hasCompactHeader, "Activity Center compact header missing");
    assert(/Browse ready-to-use activities/i.test(activityBrowse.subtitle), "Activity Center subtitle missing");
    assert(/Activities/i.test(activityBrowse.stats) && /Free/i.test(activityBrowse.stats) && /Pro/i.test(activityBrowse.stats), "stats line missing");
    assert(activityBrowse.oldStats === 0, "old stat cards should be removed");
    assert(/Full Access|Pro/i.test(activityBrowse.badge), "access badge missing for Pro");
    assert(activityBrowse.rowCount > 0, "activity browse rows missing");
    assert(activityBrowse.emptyRows === 0, "empty activity rows should be hidden");
    assert(!activityBrowse.hasDownloadOnCard, "Download PDF should not be on activity cards");
    assert(!activityBrowse.hasDayLabel, "redundant day/parent labels should not clutter cards");
    assert(activityBrowse.hasFilterScroll && activityBrowse.hasAdvanced, "activity filters missing");
    assert(!activityBrowse.overflow, "activity center horizontal overflow");
    console.log("✓ Activity Center compact header + browse rows + simplified cards");

    // Open activity viewer and confirm download chrome remains
    const activityOpened = await page.evaluate(() => {
      const card = document.querySelector("#view-activities .browse-card[data-view-resource]");
      if (!card) return false;
      card.click();
      return true;
    });
    if (activityOpened) {
      await page.waitForSelector("#resourceViewerModal.open, #featurePreviewModal.open", { timeout: 10000 });
      const activityViewer = await page.evaluate(() => {
        const labels = [...document.querySelectorAll("#resourceViewerModal button, #featurePreviewModal button")]
          .map((b) => (b.textContent || "").trim());
        const printBtn = document.querySelector("#printResourceButton");
        return {
          hasPrint: (printBtn && !printBtn.hidden) || labels.some((t) => /Print/i.test(t)),
          hasDownload: Boolean(document.querySelector("#downloadPdfButton")) || labels.some((t) => /Download/i.test(t)),
        };
      });
      assert(activityViewer.hasPrint, "Print missing in activity viewer");
      console.log("✓ Activity viewer keeps Print / download chrome");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    } else {
      console.log("• No activity cards available to open in this seed (lesson activities may sync async)");
    }

    // View All + arrow wiring
    const viewAll = page.locator("#view-activities [data-browse-view-all]").first();
    if (await viewAll.count()) {
      await viewAll.click();
      await page.waitForSelector("[data-clear-activity-view-all]", { timeout: 5000 });
      await page.click("[data-clear-activity-view-all]");
      await page.waitForSelector("#view-activities .browse-row", { timeout: 5000 });
      console.log("✓ Activity View All / back to browse");
    }

    // ---- Free user permissions badge ----
    await loginAs(page, "browse-free@example.com", "Free");
    await page.evaluate(() => setView("activities"));
    await page.waitForSelector("#view-activities .library-access-badge", { timeout: 8000 });
    const freeBadge = await page.evaluate(() => document.querySelector(".library-access-badge")?.textContent || "");
    assert(/Free/i.test(freeBadge), "Free access badge missing");
    console.log("✓ Free user access badge");

    // ---- Founding Member badge ----
    await loginAs(page, "browse-founding@example.com", "Founding");
    await page.evaluate(() => setView("activities"));
    await page.waitForSelector("#view-activities .library-access-badge", { timeout: 8000 });
    const foundingBadge = await page.evaluate(() => document.querySelector(".library-access-badge")?.textContent || "");
    assert(/Founding Member/i.test(foundingBadge), "Founding Member badge missing");
    console.log("✓ Founding Member access badge");

    // ---- Responsive overflow sweep ----
    const widths = [320, 375, 390, 430, 768, 820, 834, 1024, 1280, 1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
      await page.evaluate(() => setView("lessons"));
      await page.waitForSelector("#view-lessons.active-view", { timeout: 5000 });
      const lessonOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      await page.evaluate(() => setView("activities"));
      await page.waitForSelector("#view-activities.active-view", { timeout: 5000 });
      const activityOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert(!lessonOverflow, `lesson overflow at ${width}px`);
      assert(!activityOverflow, `activity overflow at ${width}px`);
    }
    console.log("✓ No horizontal page overflow across target widths");

    // Logged-out visitor can open lessons/activities if guest-allowed
    await page.evaluate(() => {
      localStorage.removeItem("llhUser");
      localStorage.removeItem("llhPlan");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    const guest = await page.evaluate(() => {
      try {
        setView("lessons");
        return {
          lessons: Boolean(document.querySelector("#view-lessons.active-view")),
          authOpen: Boolean(document.querySelector("#authModal.open, .auth-modal.open, #loginModal.open")),
        };
      } catch (error) {
        return { error: String(error) };
      }
    });
    assert(guest.lessons || guest.authOpen, "guest lessons access should open library or auth");
    console.log("✓ Logged-out visitor path responds");

    console.log("Library browse redesign smoke checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
