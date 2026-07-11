#!/usr/bin/env node
/**
 * Phase D: curriculum public viewer + print layout tests.
 * Run: npm run test:curriculum-viewer-print
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const {
  renderCurriculumLessonPlanHtml,
  renderCurriculumActivityHtml,
  lockedCurriculumLessonPreviewHtml,
  curriculumLessonDayDetailsHtml,
} = require("./curriculum-lesson-viewer-render.js");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const V1_SAMPLE = path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt");
const PORT = 4560 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
const ADMIN = {
  email: "viewer-print-test@example.com",
  password: "viewer-print-test-pass",
  code: "viewer-print-test-code",
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
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
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
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) return reject(new Error(`Server exited early with code ${child.exitCode}`));
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > 15000) return reject(new Error("Timed out waiting for server health"));
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Viewer Print Test",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function premiumPlan() {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, parsed.errors.join(" "));
  parsed.data.dailyPlans.tuesday.songs = [{ title: "Rain Song", notes: "Weather transition" }];
  return parsed.data;
}

async function savePublishedPlan(token, expectedUpdatedAt, plan) {
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: plan,
  });
  assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
  return save.json;
}

function testRenderModel() {
  console.log("1) Weekly information displays correctly");
  const plan = premiumPlan();
  const screenHtml = renderCurriculumLessonPlanHtml(plan, { mode: "screen" });
  assert(screenHtml.includes("Weekly Overview"), "weekly overview section");
  assert(screenHtml.includes("Weekly Learning Objectives"), "weekly objectives");
  assert(screenHtml.includes("The Tiny Seed"), "weekly book");

  console.log("2) Monday books remain under Monday; Tuesday songs under Tuesday");
  const mondayDetails = curriculumLessonDayDetailsHtml(plan.dailyPlans.monday);
  const tuesdayDetails = curriculumLessonDayDetailsHtml(plan.dailyPlans.tuesday);
  assert(mondayDetails.includes("Planting a Rainbow"), "monday book in monday details");
  assert(tuesdayDetails.includes("Rain Song"), "tuesday song in tuesday details");
  assert(screenHtml.includes("Planting a Rainbow"), "monday book in viewer");
  assert(screenHtml.includes("Rain Song"), "tuesday song in viewer");

  console.log("3) Daily circle time, transitions, outdoor play, observations, adaptations, safety notes");
  assert(screenHtml.includes("seed tray"), "circle time");
  assert(screenHtml.includes("cleanup song"), "transitions");
  assert(screenHtml.includes("watering cans"), "outdoor play");
  assert(screenHtml.includes("sorting strategy"), "observations");
  assert(screenHtml.includes("water spills"), "safety notes");

  console.log("4) Premium activity fields display with exact wording");
  assert(screenHtml.includes("Invite children to scoop and feel the soil."), "numbered directions preserved");
  assert(screenHtml.includes("I notice the soil feels damp"), "teacher language preserved");
  assert(screenHtml.includes("Narrate texture"), "teacher role preserved");
  assert(screenHtml.includes("pasteurized soil"), "activity safety notes");

  console.log("5) Empty fields do not render empty headings");
  const emptyDay = { theme: "", objectives: "", items: [], books: [], songs: [], circleTime: [], transitions: [], observations: [] };
  const emptyDetails = curriculumLessonDayDetailsHtml(emptyDay);
  assert(!emptyDetails.includes("Transition ideas"), "no empty transition heading");
  assert(!/None/i.test(emptyDetails), "no none placeholder");

  console.log("6) Activity library viewer shows premium fields");
  const soil = plan.dailyPlans.monday.items[0];
  const activityHtml = renderCurriculumActivityHtml({
    ...soil,
    activityCategory: soil.activityCategory,
    lessonPlanId: "cur-lp-test",
    parentTitle: plan.title,
  });
  assert(activityHtml.includes("Suggested teacher language"), "activity viewer teacher language label");
  assert(activityHtml.includes("damp"), "activity viewer teacher language text");

  console.log("7) Detailed print output includes weekly and daily content");
  const printHtml = renderCurriculumLessonPlanHtml(plan, { mode: "print" });
  assert(printHtml.includes("curriculum-print-day"), "print day sections");
  assert(printHtml.includes("Monday"), "print monday heading");
  assert(printHtml.includes("Invite children to scoop"), "print keeps directions");

  console.log("8) Locked Pro preview does not expose full lesson plan");
  const locked = lockedCurriculumLessonPreviewHtml({
    title: plan.title,
    age: plan.age,
    theme: plan.theme,
    description: plan.weeklyOverview,
    _curriculumLessonPlan: plan,
  });
  assert(!locked.html.includes("Invite children to scoop"), "locked preview hides directions");
  assert(!locked.html.includes("Planting a Rainbow"), "locked preview hides daily books");
  assert(locked.html.includes("Weekly Overview Preview"), "locked preview shows excerpt label");

  console.log("9) v1 lesson plans still render");
  const v1 = parseCurriculumLessonPlanImport(fs.readFileSync(V1_SAMPLE, "utf8"));
  assert(v1.ok, v1.errors.join(" "));
  const v1Html = renderCurriculumLessonPlanHtml(v1.data, { mode: "screen" });
  assert(v1Html.includes("Daily Plans"), "v1 daily section");
  assert(v1Html.includes("Soft Hello Song"), "v1 activities render");
}

async function testServerVisibility(child) {
  console.log("10) Draft and archived lesson plans remain hidden from public library");
  await waitForHealth(child);
  const login = await requestJson("POST", "/api/admin/login", ADMIN);
  const token = login.json.token;
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  let expectedUpdatedAt = touch.json.siteContent.updatedAt;

  const publishedFreeId = `cur-lp-viewer-free-${crypto.randomBytes(3).toString("hex")}`;
  const publishedProId = `cur-lp-viewer-pro-${crypto.randomBytes(3).toString("hex")}`;
  const draftId = `cur-lp-viewer-draft-${crypto.randomBytes(3).toString("hex")}`;
  const base = premiumPlan();

  const freeSave = await savePublishedPlan(token, expectedUpdatedAt, {
    ...base,
    id: publishedFreeId,
    title: "Viewer Free Garden",
    plan: "Free",
    status: "published",
  });
  expectedUpdatedAt = freeSave.siteContentUpdatedAt;

  const proSave = await savePublishedPlan(token, expectedUpdatedAt, {
    ...base,
    id: publishedProId,
    title: "Viewer Pro Garden",
    plan: "Pro",
    status: "published",
  });
  expectedUpdatedAt = proSave.siteContentUpdatedAt;

  await savePublishedPlan(token, expectedUpdatedAt, {
    ...base,
    id: draftId,
    title: "Viewer Draft Garden",
    plan: "Free",
    status: "draft",
  });

  const publicLib = await requestJson("GET", "/api/site-content");
  const plans = publicLib.json.siteContent?.curriculumLibrary?.lessonPlans || [];
  assert(plans.some((item) => item.id === publishedFreeId), "published free plan is public");
  assert(plans.some((item) => item.id === publishedProId), "published pro plan metadata is public");
  assert(!plans.some((item) => item.id === draftId), "draft plan hidden");

  const freePlan = plans.find((item) => item.id === publishedFreeId);
  assert(freePlan.dailyPlans.monday.books[0].title === "Planting a Rainbow", "public GET returns monday books");
  assert(freePlan.dailyPlans.tuesday.songs[0].title === "Rain Song", "public GET returns tuesday songs");

  const activities = publicLib.json.siteContent?.curriculumLibrary?.activities || [];
  const soilActivity = activities.find((item) => item.lessonPlanId === publishedFreeId);
  assert(soilActivity?.teacherLanguage?.includes("damp"), "public activity includes premium fields");
}

async function testMobileLayout() {
  console.log("11) Mobile 412px layout has no horizontal overflow");
  let playwright;
  try { playwright = require("playwright"); } catch { console.log("   (skipped: playwright not installed)"); return; }
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const html = renderCurriculumLessonPlanHtml(premiumPlan(), { mode: "screen" });
  const fixturePath = path.join(ROOT, "scripts/.tmp-viewer-mobile.html");
  fs.writeFileSync(fixturePath, `<!DOCTYPE html><html><head><link rel="stylesheet" href="file://${path.join(ROOT, "styles.css")}"></head><body><div class="curriculum-lesson-viewer">${html}</div></body></html>`);
  await page.goto(`file://${fixturePath}`);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  await browser.close();
  fs.rmSync(fixturePath, { force: true });
  assert(metrics.scrollWidth <= metrics.clientWidth + 1, `horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
}

async function main() {
  const child = startServer();
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  try {
    testRenderModel();
    await testServerVisibility(child);
    await testMobileLayout();
    console.log("\nAll curriculum viewer + print Phase D checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
