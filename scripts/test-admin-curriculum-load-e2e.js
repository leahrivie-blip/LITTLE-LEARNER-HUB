#!/usr/bin/env node
/**
 * Production-equivalent browser E2E: Admin curriculum load fix (PR #442).
 * Does NOT use live production writes — isolated server + temp JSON store.
 *
 * Run: npm run test:admin-curriculum-load-e2e
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4780 + Math.floor(Math.random() * 120);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-curriculum-e2e-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots/admin-curriculum-load-e2e";
const REPORT_PATH = "/opt/cursor/artifacts/admin-curriculum-load-e2e-report.json";

const ADMIN = {
  email: "admin-curriculum-e2e@example.com",
  password: "admin-curriculum-e2e-pass",
  code: "admin-curriculum-e2e-code",
};

const TEST_PLAN_ID = "cur-lp-e2e-load-fix-target";
const CONTROL_PLAN_A = "cur-lp-e2e-load-fix-control-a";
const CONTROL_PLAN_B = "cur-lp-e2e-load-fix-control-b";
const MARKER = `E2E-LOAD-FIX-${Date.now()}`;

const report = {
  command: "npm run test:admin-curriculum-load-e2e",
  startedAt: new Date().toISOString(),
  port: PORT,
  testLessonId: TEST_PLAN_ID,
  screenshots: [],
  steps: [],
  before: null,
  afterEdit: null,
  afterRestore: null,
  lessonCount: null,
  pass: false,
  error: null,
};

function step(name, ok, detail = "") {
  report.steps.push({ name, ok, detail, at: new Date().toISOString() });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(detail || name);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: reqHeaders, timeout: 45000 },
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

function buildPlan(id, title, weeklyOverview, status = "draft") {
  const item = (suffix, activityTitle) => ({
    itemId: `${id}-${suffix}`,
    activityCategory: "Circle Time",
    title: activityTitle,
    objective: "Observe and participate.",
    description: "E2E fixture activity.",
    materials: "Blocks",
    setup: "Prepare space.",
    steps: "Guide children through play.",
    teacherRole: "Model language.",
    learningGoals: ["Engagement"],
  });
  return {
    id,
    title,
    age: "Preschool",
    theme: "E2E Load Fix",
    plan: "Free",
    status,
    weeklyOverview,
    objectives: "E2E objectives.",
    weeklyMaterials: "E2E materials.",
    learningDomains: ["Approaches to Learning"],
    books: [],
    songs: [],
    dailyPlans: {
      monday: { theme: "Mon", items: [item("mon", `${title} Mon`)] },
      tuesday: { theme: "Tue", items: [item("tue", `${title} Tue`)] },
      wednesday: { theme: "Wed", items: [item("wed", `${title} Wed`)] },
      thursday: { theme: "Thu", items: [item("thu", `${title} Thu`)] },
      friday: { theme: "Fri", items: [item("fri", `${title} Fri`)] },
    },
    resourceIds: [],
    activityIds: [],
    updatedAt: "2026-08-03T10:00:00.000Z",
    publishedAt: status === "published" ? "2026-08-03T10:00:00.000Z" : "",
  };
}

function planSnapshot(curriculum) {
  return (curriculum?.lessonPlans || []).map((plan) => ({
    id: plan.id,
    title: plan.title,
    status: plan.status,
    weeklyOverview: plan.weeklyOverview,
    updatedAt: plan.updatedAt,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function startServer(initialStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Admin Curriculum E2E",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      LLH_STORE_RECORD_ID: "admin-curriculum-e2e",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.stderr?.read?.() || ""}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLoginToken() {
  const res = await requestJson("POST", "/api/admin/login", ADMIN);
  assert(res.status === 200 && res.json?.token, `Admin login failed: ${res.status}`);
  return res.json.token;
}

async function fetchAdminCurriculum(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  assert(res.status === 200, `Admin site-content failed: ${res.status}`);
  return res.json.siteContent?.curriculum || { lessonPlans: [], activities: [] };
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  }, { Authorization: `Bearer ${token}` });
}

async function screenshot(page, name) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
  return file;
}

async function readLessonCountLabel(page) {
  return page.locator("#adminCurriculumLessonPlanApp p.muted-copy", { hasText: "lesson plans shown" }).first().textContent();
}

async function dismissCookieBanner(page) {
  const gotIt = page.locator("button", { hasText: "Got it" });
  if (await gotIt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await gotIt.click();
  }
}

async function waitForLessonListPopulated(page, testPlanId) {
  await page.waitForFunction((id) => {
    const root = document.querySelector("#adminCurriculumLessonPlanApp");
    if (!root) return false;
    const countLine = [...root.querySelectorAll("p.muted-copy")]
      .map((el) => el.textContent || "")
      .find((text) => /lesson plans shown/.test(text)) || "";
    const match = countLine.match(/(\d+)\s+of\s+(\d+)\s+lesson plans shown/);
    const edit = root.querySelector(`[data-curriculum-lesson-edit="${id}"]`);
    return Boolean(edit) && match && Number(match[2]) > 0 && !/0\s+of\s+0/.test(countLine);
  }, testPlanId, { timeout: 60000 });
}

async function runBrowserWorkflow(token, baselineSnapshot) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: undefined,
  });
  const page = await context.newPage();
  page.on("dialog", async (dialog) => { await dialog.accept(); });

  try {
  let admin503Hits = 0;
  let admin503Mode = false;
  let reload503Attempts = 0;

  await page.route("**/api/admin/site-content**", async (route) => {
    if (admin503Mode && route.request().method() === "GET") {
      admin503Hits += 1;
      reload503Attempts += 1;
      if (reload503Attempts <= 2) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated cold-start 503", retryAfter: 1 }),
          headers: { "Retry-After": "1" },
        });
        return;
      }
    }
    await route.continue();
  });

  // 1) Clean session
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  step("Clean application session", true);

  // 2) Unlock Admin
  await page.evaluate(() => setView("admin"));
  await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
  await screenshot(page, "01-admin-unlock-screen");

  await page.fill('input[name="adminEmail"]', ADMIN.email);
  await page.fill('input[name="adminPassword"]', ADMIN.password);
  await page.fill('input[name="adminCode"]', ADMIN.code);

  const adminContentPromise = page.waitForResponse(
    (res) => res.url().includes("/api/admin/site-content") && res.request().method() === "GET",
    { timeout: 45000 },
  );
  await page.click("#adminUnlockForm button[type='submit']");
  const adminContentResponse = await adminContentPromise;
  step("Admin unlock submitted", adminContentResponse.ok(), `status=${adminContentResponse.status()}`);

  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 30000 });
  await dismissCookieBanner(page);
  await page.evaluate(() => {
    if (typeof setAdminSectionTab === "function") {
      setAdminSectionTab("content-home");
      setAdminSectionTab("curriculum-lesson-plans");
    }
    if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
    if (typeof renderAdminCurriculumLessonPlanManager === "function") renderAdminCurriculumLessonPlanManager();
  });

  // 3–4) Wait for curriculum + confirm count
  await waitForLessonListPopulated(page, TEST_PLAN_ID);
  const countLabel = await readLessonCountLabel(page);
  report.lessonCount = countLabel;
  assert(!/0\s+of\s+0/.test(countLabel), `Lesson list shows zero: ${countLabel}`);
  step("Lesson Plans list populated", true, countLabel);
  await screenshot(page, "02-lesson-list-populated-after-unlock");

  // 5–7) Open test lesson, harmless draft edit
  await page.evaluate((id) => {
    if (typeof openAdminCurriculumLessonEditor === "function") openAdminCurriculumLessonEditor(id, { scroll: true });
  }, TEST_PLAN_ID);
  await page.waitForSelector("#adminCurriculumLessonPlanForm", { timeout: 20000 });
  await screenshot(page, "03-lesson-editor-before-edit");

  const originalOverview = await page.inputValue('textarea[name="weeklyOverview"]');
  const editedOverview = `${originalOverview} ${MARKER}`;
  await page.selectOption('select[name="status"]', "draft");
  await page.fill('textarea[name="weeklyOverview"]', editedOverview);

  const saveResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/admin/curriculum/lesson-plans") && res.request().method() === "POST",
    { timeout: 45000 },
  );
  await page.click('#adminCurriculumLessonPlanForm button[type="submit"]');
  const saveResponse = await saveResponsePromise;
  const saveJson = await saveResponse.json().catch(() => ({}));
  step("Draft save request", saveResponse.ok(), `status=${saveResponse.status()}`);
  await page.waitForFunction(() => {
    const banner = document.querySelector("#adminCurriculumLessonPlanBanner");
    const msg = document.querySelector("#adminCurriculumLessonPlanMessage");
    const text = `${banner?.textContent || ""} ${msg?.textContent || ""}`;
    return /saved|success|updated/i.test(text);
  }, null, { timeout: 30000 }).catch(() => {});
  await screenshot(page, "04-lesson-editor-after-save");

  // 8) Confirm only test lesson changed (API)
  const afterEditCurriculum = await fetchAdminCurriculum(token);
  report.afterEdit = {
    snapshot: planSnapshot(afterEditCurriculum),
    saveStatus: saveResponse.status(),
  };
  const edited = afterEditCurriculum.lessonPlans.find((p) => p.id === TEST_PLAN_ID);
  assert(edited?.weeklyOverview?.includes(MARKER), "Test lesson weeklyOverview missing marker after save");
  const othersUnchanged = baselineSnapshot
    .filter((p) => p.id !== TEST_PLAN_ID)
    .every((beforePlan) => {
      const afterPlan = afterEditCurriculum.lessonPlans.find((p) => p.id === beforePlan.id);
      return afterPlan
        && afterPlan.weeklyOverview === beforePlan.weeklyOverview
        && afterPlan.updatedAt === beforePlan.updatedAt;
    });
  step("Only test lesson changed", othersUnchanged, `marker=${MARKER}`);

  // 9–10) Activity Center then back to Admin Lesson Plans
  await page.evaluate(() => setView("activities"));
  await page.waitForSelector("#view-activities.active-view", { timeout: 20000 });
  await page.waitForFunction(() => {
    const grid = document.querySelector("#view-activities .category-grid, #view-activities .resource-grid, #view-activities");
    return grid && !/could not load/i.test(grid.textContent || "");
  }, null, { timeout: 30000 }).catch(() => {});
  await screenshot(page, "05-activity-center");

  await page.evaluate(() => {
    setView("admin");
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
  });
  await waitForLessonListPopulated(page, TEST_PLAN_ID);
  const countAfterNav = await readLessonCountLabel(page);
  assert(!/0\s+of\s+0/.test(countAfterNav), `Count wiped after navigation: ${countAfterNav}`);
  step("Curriculum still loaded after Activity Center round-trip", true, countAfterNav);
  await screenshot(page, "06-lesson-list-after-navigation");

  // 11–12) Simulate empty admin curriculum + 503 on reload, then recover via Reload curriculum
  await page.evaluate(() => {
    if (siteContentState && typeof siteContentState === "object") {
      siteContentState = {
        ...siteContentState,
        curriculum: {
          lessonPlans: [],
          activities: [],
          resources: [],
          series: [],
          updatedAt: "",
        },
      };
    }
    adminCurriculumLoadFailed = true;
    adminCurriculumLoadError = "Simulated admin curriculum load failure.";
    if (typeof renderAdminDashboard === "function") renderAdminDashboard();
  });
  await page.waitForSelector("[data-retry-admin-curriculum]", { timeout: 20000 });
  const emptyLabel = await readLessonCountLabel(page).catch(() => "");
  assert(/0\s+of\s+0/.test(emptyLabel), `Expected temporary 0 of 0 before reload, got: ${emptyLabel}`);
  await screenshot(page, "07-mismatch-banner-after-simulated-failure");

  admin503Mode = true;
  reload503Attempts = 0;
  const reloadPromise = page.waitForResponse(
    (res) => res.url().includes("/api/admin/site-content") && res.request().method() === "GET" && res.ok(),
    { timeout: 60000 },
  );
  await page.click("[data-retry-admin-curriculum]");
  await reloadPromise;
  admin503Mode = false;
  await waitForLessonListPopulated(page, TEST_PLAN_ID);
  const countAfterReload = await readLessonCountLabel(page);
  step(
    "Reload curriculum recovered after simulated failure/503",
    !/0\s+of\s+0/.test(countAfterReload),
    `503Hits=${reload503Attempts} label=${countAfterReload}`,
  );
  await screenshot(page, "08-lesson-list-after-reload");

  // 13) Public refresh must not wipe admin curriculum
  const preservation = await page.evaluate(async () => {
    const before = (typeof curriculumLessonPlansForAdmin === "function") ? curriculumLessonPlansForAdmin().length : 0;
    if (typeof refreshPublicCurriculumLibrary === "function") {
      await refreshPublicCurriculumLibrary();
    }
    const after = (typeof curriculumLessonPlansForAdmin === "function") ? curriculumLessonPlansForAdmin().length : 0;
    const library = (typeof effectiveCurriculumLibrary === "function") ? effectiveCurriculumLibrary().lessonPlans.length : 0;
    return { before, after, library };
  });
  step(
    "Public refresh preserves admin curriculum",
    preservation.before > 0 && preservation.after === preservation.before,
    JSON.stringify(preservation),
  );

  await browser.close();
  return { editedOverview, originalOverview, saveJson };
  } catch (error) {
    await screenshot(page, "99-failure-state").catch(() => {});
    await browser.close();
    throw error;
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

  const plans = [
    buildPlan(TEST_PLAN_ID, "E2E Load Fix Target Lesson", "Original overview for E2E load-fix target.", "draft"),
    buildPlan(CONTROL_PLAN_A, "E2E Control Lesson A", "Control A overview unchanged.", "published"),
    buildPlan(CONTROL_PLAN_B, "E2E Control Lesson B", "Control B overview unchanged.", "published"),
  ];

  const child = startServer({
    users: {},
    siteContent: {
      updatedAt: "2026-08-03T10:00:00.000Z",
      curriculum: {
        lessonPlans: plans,
        activities: [],
        resources: [],
        series: [],
        updatedAt: "2026-08-03T10:00:00.000Z",
      },
    },
    adminSessions: {},
  });

  try {
    await waitForBoot(child);
    const token = await adminLoginToken();
    const baselineCurriculum = await fetchAdminCurriculum(token);
    report.before = { snapshot: planSnapshot(baselineCurriculum) };
    assert(baselineCurriculum.lessonPlans.length >= 3, `Expected >=3 plans, got ${baselineCurriculum.lessonPlans.length}`);

    const browserResult = await runBrowserWorkflow(token, report.before.snapshot);

    // 14) Restore test lesson
    const current = await fetchAdminCurriculum(token);
    const siteUpdatedAt = (await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
      Authorization: `Bearer ${token}`,
    })).json.siteContent?.updatedAt || "";
    const target = current.lessonPlans.find((p) => p.id === TEST_PLAN_ID);
    assert(target, "Test lesson missing before restore");
    const restored = {
      ...target,
      weeklyOverview: browserResult.originalOverview,
      status: "draft",
    };
    const restoreRes = await saveLesson(token, restored, siteUpdatedAt);
    assert(restoreRes.status === 200, `Restore save failed: ${restoreRes.status} ${restoreRes.text}`);
    const afterRestoreCurriculum = await fetchAdminCurriculum(token);
    report.afterRestore = { snapshot: planSnapshot(afterRestoreCurriculum) };
    const restoredPlan = afterRestoreCurriculum.lessonPlans.find((p) => p.id === TEST_PLAN_ID);
    step(
      "Test lesson restored to original state",
      restoredPlan?.weeklyOverview === browserResult.originalOverview
        && !restoredPlan?.weeklyOverview?.includes(MARKER),
      restoredPlan?.weeklyOverview,
    );

    report.pass = true;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${REPORT_PATH}`);
    console.log(`Screenshots: ${ARTIFACT_DIR}`);
    console.log("\nAll admin curriculum load E2E checks passed.");
  } catch (error) {
    report.pass = false;
    report.error = error.message || String(error);
    report.finishedAt = new Date().toISOString();
    try {
      const { chromium } = require("playwright");
      // best-effort failure screenshot if browser still open is handled in runBrowserWorkflow catch
    } catch { /* ignore */ }
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.error("\nFAIL:", report.error);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
