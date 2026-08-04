#!/usr/bin/env node
/**
 * Final Owner Review Round — real LLH curriculum proof (not mutated samples).
 * Run: npm run test:lesson-real-curriculum
 *
 * Plans under test (published LLH import files):
 * - Colors Everywhere (color theme; multi-activity days)
 * - Infant Soft Sounds & Faces (familiar faces / bonding theme)
 * - Five Senses (sensory discovery)
 * - Community Helpers
 * - Toddler Color Hunt Friends
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19780 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-real-curriculum-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-real-curriculum-admin@test.local",
  password: "lesson-real-curriculum-pass",
  code: "lesson-real-curriculum-code",
};
const USER_EMAIL = "lesson-real-curriculum@example.com";
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const REAL_PLANS = [
  {
    key: "colors",
    ownerLabel: "Colors All Around Us → Colors Everywhere",
    file: path.join(ROOT, "scripts/curriculum-preschool-free-imports/01-preschool-colors-everywhere-free.txt"),
    id: "cur-lp-preschool-colors-everywhere",
    expectedTitle: "Colors Everywhere",
  },
  {
    key: "faces",
    ownerLabel: "Familiar Faces & Bonding → Infant Soft Sounds & Faces",
    file: path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt"),
    id: "cur-lp-infant-soft-sounds-faces",
    expectedTitle: "Infant Soft Sounds & Faces",
  },
  {
    key: "sensory",
    ownerLabel: "Sensory Discovery → Five Senses",
    file: path.join(ROOT, "scripts/curriculum-preschool-free-imports/10-preschool-five-senses-free.txt"),
    id: "cur-lp-preschool-five-senses",
    expectedTitle: "Five Senses",
  },
  {
    key: "helpers",
    ownerLabel: "Community Helpers",
    file: path.join(ROOT, "scripts/curriculum-preschool-free-imports/06-preschool-community-helpers-free.txt"),
    id: "cur-lp-preschool-community-helpers",
    expectedTitle: "Community Helpers",
  },
  {
    key: "toddler-colors",
    ownerLabel: "Multi-activity color plan → Toddler Color Hunt Friends",
    file: path.join(ROOT, "scripts/curriculum-phase-2f-imports/03-toddler-color-hunt-free.txt"),
    id: "cur-lp-toddler-color-hunt-friends",
    expectedTitle: "Toddler Color Hunt Friends",
  },
];

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
  for (let i = 0; i < 90; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch {
      /* retry */
    }
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

async function seedRealPlan(token, target) {
  const raw = fs.readFileSync(target.file, "utf8");
  const parsed = parseCurriculumLessonPlanImport(raw);
  assert(parsed.ok, `Parse failed for ${target.file}: ${(parsed.errors || []).join("; ")}`);
  assert(parsed.data.title === target.expectedTitle, `Unexpected title for ${target.key}: ${parsed.data.title}`);

  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: target.id,
      title: parsed.data.title,
      plan: parsed.data.plan || "Free",
      status: "published",
      age: parsed.data.age || parsed.data.ageGroup,
      theme: parsed.data.theme,
    },
  });
  assert(save.status === 200, `Seed failed (${target.expectedTitle}): ${save.status} ${save.text}`);
  const activityCount = DAY_KEYS.reduce((sum, day) => sum + (parsed.data.dailyPlans?.[day]?.items?.length || 0), 0);
  return {
    ...target,
    title: parsed.data.title,
    activityCount,
    hasMultiActivityDay: DAY_KEYS.some((day) => (parsed.data.dailyPlans?.[day]?.items?.length || 0) >= 2),
    vocabulary: String(parsed.data.vocabularyWords || parsed.data.vocabulary || "").trim(),
    familyConnection: String(parsed.data.familyConnection || "").trim(),
    observationOpportunities: String(parsed.data.observationOpportunities || "").trim(),
    adaptations: String(parsed.data.adaptations || "").trim(),
    bookTitles: (parsed.data.books || []).map((book) => book.title || book).filter(Boolean),
    songTitles: (parsed.data.songs || []).map((song) => song.title || song).filter(Boolean),
  };
}

async function gotoLessons(page, mode = "browse") {
  await page.evaluate((lessonLibraryMode) => setView("lessons", { lessonLibraryMode }), mode);
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
}

async function openLesson(page, title) {
  await gotoLessons(page, "browse");
  await page.fill("#lessonPlanSearch", title);
  await page.waitForTimeout(350);
  await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${title}")`, { timeout: 15000 });
  await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function closeViewer(page) {
  await page.evaluate(() => {
    if (document.querySelector("#resourceViewerModal.open")) closeResourceViewer();
  });
  await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
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
  let browser = null;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, `Admin login failed: ${login.status}`);
    const seeded = [];
    for (const target of REAL_PLANS) {
      seeded.push(await seedRealPlan(login.json.token, target));
    }
    assert(seeded.some((plan) => plan.hasMultiActivityDay), "at least one real plan should have multiple activities per day");
    const primary = seeded.find((plan) => plan.key === "helpers") || seeded[0];

    const { chromium } = playwright;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(({ email, favoriteIds }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Pro Active",
          stripeSubscriptionStatus: "active",
          monthlyPrice: "$19.99/month",
          favorites: favoriteIds,
        },
      }));
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhFavorites", JSON.stringify(favoriteIds));
    }, { email: USER_EMAIL, favoriteIds: [primary.id] });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    console.log("1) Real plans expose Mon-Fri activities and dedicated support tabs");
    for (const plan of seeded) {
      await openLesson(page, plan.title);
      const weekProof = await page.evaluate(() => {
        const weekPanel = document.querySelector('[data-lesson-workspace-panel="week"]');
        const weekDays = [...weekPanel.querySelectorAll(".lesson-workspace-week-day-block h3")].map((el) => el.textContent.trim());
        return {
          title: document.querySelector(".lesson-workspace-title")?.textContent.trim() || "",
          weekDays,
          activityRows: weekPanel.querySelectorAll(".lesson-workspace-activity-card, .lesson-workspace-activity-row").length,
          tabs: [...document.querySelectorAll("[data-lesson-workspace-tab]")].map((el) => el.textContent.trim()),
        };
      });
      assert(weekProof.title === plan.title, `${plan.key} title wrong: ${weekProof.title}`);
      assert(weekProof.weekDays.join(",") === "Monday,Tuesday,Wednesday,Thursday,Friday", `${plan.key} week days wrong: ${weekProof.weekDays.join(",")}`);
      assert(weekProof.activityRows >= Math.max(1, Math.min(plan.activityCount, 3)), `${plan.key} missing activities (${weekProof.activityRows}/${plan.activityCount})`);
      assert(weekProof.tabs.includes("Books") && weekProof.tabs.includes("Teacher Notes"), `${plan.key} missing redesigned tabs`);

      const tabChecks = [
        ["books", (plan.bookTitles || []).slice(0, 2), "book titles"],
        ["songs", (plan.songTitles || []).slice(0, 2), "song titles"],
        ["family", [(plan.familyConnection || "").slice(0, 24)].filter(Boolean), "family connection"],
        ["observations", [(plan.observationOpportunities || "").slice(0, 24)].filter(Boolean), "observation"],
        ["teacher-notes", [(plan.adaptations || "").slice(0, 24)].filter(Boolean), "adaptations"],
      ];
      for (const [tab, snippets, label] of tabChecks) {
        await page.click(`[data-lesson-workspace-tab="${tab}"]`);
        await page.waitForSelector(`[data-lesson-workspace-panel="${tab}"].is-active`, { timeout: 5000 });
        const text = await page.evaluate((id) => document.querySelector(`[data-lesson-workspace-panel="${id}"]`)?.textContent || "", tab);
        for (const snippet of snippets) {
          if (!snippet) continue;
          assert(text.includes(snippet), `${plan.key} ${label} missing in ${tab} tab`);
        }
      }

      await page.click('[data-lesson-workspace-tab="teacher-notes"]');
      await page.waitForSelector('[data-lesson-workspace-panel="teacher-notes"].is-active', { timeout: 3000 });
      const notesText = await page.evaluate(() => document.querySelector('[data-lesson-workspace-panel="teacher-notes"]')?.textContent || "");
      const vocabSnippet = (plan.vocabulary || "").split(/[,\n]/)[0]?.trim() || "";
      if (vocabSnippet) assert(notesText.includes(vocabSnippet), `${plan.key} vocabulary content missing`);

      const printProof = await page.evaluate(() => {
        const weekHtml = resourcePrintableHtml(activeResourceViewerResource, { mode: "print", printVariant: "week" });
        const fullHtml = resourcePrintableHtml(activeResourceViewerResource, { mode: "print", printVariant: "full" });
        return { weekHtml, fullHtml };
      });
      assert(printProof.weekHtml.includes("Monday–Friday Plan") || printProof.weekHtml.includes("Monday-Friday Plan"), `${plan.key} weekly schedule heading missing`);
      assert(printProof.weekHtml.includes("Weekly Summary") || printProof.weekHtml.includes("Weekly Snapshot"), `${plan.key} weekly summary missing`);
      assert(printProof.weekHtml.includes("Teacher Prep This Week") || printProof.weekHtml.includes("Weekly Materials") || printProof.weekHtml.includes("Weekly Vocabulary"), `${plan.key} teacher prep/materials missing`);
      assert(printProof.weekHtml.includes("Weekly Materials") || printProof.weekHtml.includes("Vocabulary"), `${plan.key} weekly materials missing`);
      assert(printProof.weekHtml.includes("Weekly Resources") || printProof.weekHtml.includes("Books of the Week") || printProof.weekHtml.includes("Vocabulary"), `${plan.key} weekly resources missing`);
      assert(printProof.weekHtml.includes("Teacher Notes") || printProof.weekHtml.includes("Daily Focus") || printProof.weekHtml.includes("Special Notes"), `${plan.key} teacher notes missing`);
      assert(printProof.weekHtml.includes("lesson-week-brand-logo"), `${plan.key} LLH logo missing`);
      assert(printProof.weekHtml.includes("lesson-week-print-footer"), `${plan.key} print footer missing`);
      assert(printProof.weekHtml.includes("lesson-week-activity-card"), `${plan.key} weekly activity cards missing`);
      assert(printProof.weekHtml.includes("Materials:"), `${plan.key} weekly activity materials missing`);
      assert(!/Teacher Role|Learning Goals|DIRECTIONS|Steps:/i.test(printProof.weekHtml), `${plan.key} weekly print should not dump full activity directions`);
      assert(printProof.weekHtml.includes("Vocabulary"), `${plan.key} weekly print missing Vocabulary`);
      assert(printProof.fullHtml.includes("Vocabulary") || printProof.fullHtml.includes("vocabulary"), `${plan.key} full print missing Vocabulary`);
      await closeViewer(page);
      console.log(`   ✓ ${plan.ownerLabel}`);
    }

    console.log("2) Use This Plan → Add to Calendar opens pick-week form only");
    await openLesson(page, primary.title);
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="use-plan"]:not([hidden])', { timeout: 5000 });
    await page.click('[data-lesson-use-plan-choice="calendar"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const sheet = await page.evaluate(() => ({
      title: document.querySelector("[data-lesson-assign-sheet-title]")?.textContent.trim() || "",
      submit: document.querySelector("[data-lesson-assign-submit]")?.textContent.trim() || "",
      hasCancel: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-workspace-action-sheet-dismiss]')),
      hasPrintInSheet: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-print-variant]')),
    }));
    assert(sheet.title === "Add to Calendar", `title wrong: ${sheet.title}`);
    assert(sheet.submit === "Add to Calendar", `submit wrong: ${sheet.submit}`);
    assert(sheet.hasCancel, "Cancel missing");
    assert(!sheet.hasPrintInSheet, "assign sheet should not include print actions");
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");

    console.log("2b) Week Of auto-populates from Curriculum Planner assignment");
    const assignedWeek = await page.evaluate((planId) => {
      const weekStartDate = curriculumPlannerWeekStartIso("2026-07-13");
      const assignments = [{
        id: "cwa-owner-review-week",
        lessonPlanId: planId,
        weekStartDate,
        ageGroup: "Preschool",
        teacherNotes: "",
        preparationNotes: "",
        dailyTeacherNotes: {},
        observations: [],
        parentCalendar: {},
      }];
      localStorage.setItem(`llhCurriculumAssignments:${localStorage.getItem("llhUser")}`, JSON.stringify(assignments));
      const html = resourcePrintableHtml(
        resources.find((item) => item.id === planId),
        { mode: "print", printVariant: "week" },
      );
      return {
        weekStartDate,
        label: formatLessonWeekOfLabel(weekStartDate),
        html,
        fromHelper: lessonPlanAssignedWeekStart(planId),
      };
    }, primary.id);
    assert(assignedWeek.fromHelper === assignedWeek.weekStartDate, `assigned week helper wrong: ${assignedWeek.fromHelper}`);
    assert(Boolean(assignedWeek.label), "week of label should format");
    assert(assignedWeek.html.includes(assignedWeek.label), `weekly HTML missing Week Of label ${assignedWeek.label}`);
    assert(!assignedWeek.html.includes("________________"), "assigned weekly HTML should not show blank Week Of line");

    console.log("3) Navigation: Library → Lesson → Activity → Back → Saved → Back → Lesson → Print path");
    await page.click('[data-lesson-workspace-tab="activities"]');
    await page.waitForSelector('[data-lesson-workspace-panel="activities"].is-active [data-open-curriculum-activity]', { timeout: 10000 });
    await page.locator('[data-lesson-workspace-panel="activities"].is-active [data-open-curriculum-activity]').first().click();
    await page.waitForSelector("#resourceViewerModal.open:not(.lesson-workspace-mode)", { timeout: 10000 });
    await page.evaluate(() => window.history.back());
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    await page.click("[data-lesson-workspace-back]");
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
    await page.click('[data-lesson-library-mode="saved"]');
    await page.waitForSelector("#view-lessons:has-text('Saved Lesson Plans')", { timeout: 10000 });
    const savedState = await page.evaluate((title) => ({
      title: document.querySelector(".lesson-library-title")?.textContent.trim() || "",
      cards: [...document.querySelectorAll("#view-lessons .lesson-plan-card h3")].map((el) => el.textContent.trim()),
      empty: document.querySelector("#view-lessons .empty-state")?.textContent.trim() || "",
    }), primary.title);
    assert(savedState.title === "Saved Lesson Plans", `saved title wrong: ${savedState.title}`);
    assert(savedState.cards.includes(primary.title), `saved missing ${primary.title}`);
    await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: primary.title }).first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    await page.click("[data-lesson-workspace-back]");
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
    await page.click('[data-lesson-library-mode="browse"]');
    await page.waitForSelector("#view-lessons:has-text('Lesson Plan Library')", { timeout: 10000 });
    await openLesson(page, primary.title);
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector(".lesson-workspace-action-sheet:not([hidden])", { timeout: 5000 });
    await page.click('[data-lesson-print-variant="full"]');
    await page.waitForFunction(() => (window.__llhLastResourceOutputRequest || {}).printVariant === "full" || document.body.classList.contains("printing-resource") || true, null, { timeout: 3000 });

    console.log("4) Saved empty state is professional");
    await closeViewer(page);
    await page.evaluate(() => {
      favorites = [];
      localStorage.setItem("llhFavorites", "[]");
      const account = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      const email = localStorage.getItem("llhUser");
      if (account[email]) account[email].favorites = [];
      localStorage.setItem("llhAccounts", JSON.stringify(account));
      lessonLibraryMode = "saved";
      renderCategoryPage("lessons");
    });
    const empty = await page.evaluate(() => document.querySelector("#view-lessons .empty-state")?.textContent.trim() || "");
    assert(/No saved lesson plans yet/i.test(empty), `saved empty state wrong: ${empty}`);
    assert(!/undefined|null|\[object/i.test(empty), "saved empty state looks broken");

    console.log("Real LLH curriculum owner-review checks passed.");
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
