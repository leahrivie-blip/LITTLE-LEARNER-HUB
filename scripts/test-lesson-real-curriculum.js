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

    console.log("1) Real plans expose Mon-Fri activities and Plan tab support sections");
    for (const plan of seeded) {
      await openLesson(page, plan.title);
      await page.click('[data-lesson-workspace-tab="plan"]');
      await page.waitForSelector('[data-lesson-workspace-panel="plan"].is-active', { timeout: 5000 });
      const proof = await page.evaluate((expected) => {
        const planPanel = document.querySelector('[data-lesson-workspace-panel="plan"]');
        const weekPanel = document.querySelector('[data-lesson-workspace-panel="week"]');
        const sectionLabels = [...planPanel.querySelectorAll("[data-lesson-plan-section]")].map((el) => el.dataset.lessonPlanSection);
        const text = planPanel.textContent || "";
        const weekDays = [...weekPanel.querySelectorAll("[data-lesson-workspace-week-day]")].map((el) => el.textContent.trim());
        return {
          title: document.querySelector(".lesson-workspace-title")?.textContent.trim() || "",
          weekDays,
          activityRows: document.querySelectorAll(".lesson-workspace-activity-row").length,
          sectionLabels,
          hasVocabulary: /Vocabulary/i.test(text) && text.includes(expected.vocabularySnippet),
          hasBooks: expected.bookTitles.every((title) => text.includes(title)),
          hasSongs: expected.songTitles.every((title) => text.includes(title)),
          hasFamily: /Family Connection/i.test(text) && (!expected.familySnippet || text.includes(expected.familySnippet)),
          hasObservation: /Observation Opportunities/i.test(text) && (!expected.observationSnippet || text.includes(expected.observationSnippet)),
          hasAdaptations: /Adaptations/i.test(text) && (!expected.adaptationsSnippet || text.includes(expected.adaptationsSnippet)),
        };
      }, {
        vocabularySnippet: (plan.vocabulary || "").split(/[,\n]/)[0]?.trim() || "",
        bookTitles: plan.bookTitles.slice(0, 2),
        songTitles: plan.songTitles.slice(0, 2),
        familySnippet: (plan.familyConnection || "").slice(0, 24),
        observationSnippet: (plan.observationOpportunities || "").slice(0, 24),
        adaptationsSnippet: (plan.adaptations || "").slice(0, 24),
      });
      assert(proof.title === plan.title, `${plan.key} title wrong: ${proof.title}`);
      assert(proof.weekDays.join(",") === "Mon,Tue,Wed,Thu,Fri", `${plan.key} week days wrong: ${proof.weekDays.join(",")}`);
      assert(proof.activityRows >= Math.max(1, Math.min(plan.activityCount, 3)), `${plan.key} missing activities (${proof.activityRows}/${plan.activityCount})`);
      assert(proof.sectionLabels.includes("Vocabulary"), `${plan.key} Vocabulary section missing`);
      assert(proof.sectionLabels.includes("Books"), `${plan.key} Books section missing`);
      assert(proof.sectionLabels.includes("Songs and Fingerplays"), `${plan.key} Songs section missing`);
      assert(proof.sectionLabels.includes("Family Connection"), `${plan.key} Family Connection missing`);
      assert(proof.sectionLabels.includes("Observation Opportunities"), `${plan.key} Observation Opportunities missing`);
      assert(proof.sectionLabels.includes("Adaptations"), `${plan.key} Adaptations missing`);
      assert(proof.hasVocabulary, `${plan.key} vocabulary content missing`);
      assert(proof.hasBooks, `${plan.key} book titles missing`);
      assert(proof.hasSongs, `${plan.key} song titles missing`);
      assert(proof.hasFamily, `${plan.key} family connection content missing`);
      assert(proof.hasObservation, `${plan.key} observation content missing`);
      assert(proof.hasAdaptations, `${plan.key} adaptations content missing`);

      const printProof = await page.evaluate(() => {
        const weekHtml = resourcePrintableHtml(activeResourceViewerResource, { mode: "print", printVariant: "week" });
        const fullHtml = resourcePrintableHtml(activeResourceViewerResource, { mode: "print", printVariant: "full" });
        return { weekHtml, fullHtml };
      });
      assert(printProof.weekHtml.includes("Monday–Friday Classroom Schedule") || printProof.weekHtml.includes("Monday-Friday Classroom Schedule"), `${plan.key} weekly schedule heading missing`);
      assert(printProof.weekHtml.includes("Classroom Support Notes"), `${plan.key} weekly support notes missing`);
      assert(printProof.weekHtml.includes("Vocabulary"), `${plan.key} weekly print missing Vocabulary`);
      assert(printProof.fullHtml.includes("Vocabulary") || printProof.fullHtml.includes("vocabulary"), `${plan.key} full print missing Vocabulary`);
      await closeViewer(page);
      console.log(`   ✓ ${plan.ownerLabel}`);
    }

    console.log("2) Use This Plan final actions only");
    await openLesson(page, primary.title);
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector(".lesson-workspace-action-sheet:not([hidden])", { timeout: 5000 });
    const sheet = await page.evaluate(() => [...document.querySelectorAll('[data-lesson-workspace-action-panel="menu"] button')].map((el) => el.textContent.trim()));
    assert(sheet[0] === "Plan This Week", `Plan This Week first: ${sheet.join(" | ")}`);
    assert(sheet[1] === "Print Full Lesson Plan", `Print Full Lesson Plan second: ${sheet.join(" | ")}`);
    assert(sheet[2] === "Download PDF", `Download PDF third: ${sheet.join(" | ")}`);
    assert(sheet[3] === "Cancel", `Cancel last: ${sheet.join(" | ")}`);
    assert(sheet.length === 4, `extra Use This Plan actions: ${sheet.join(" | ")}`);
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");

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
