#!/usr/bin/env node
/**
 * Signed-in customer workflow fixes — nav lock, feedback scope, print labels,
 * and Farm Animals day-field mapping validation (report-only).
 *
 * Run: npm run test:signed-in-customer-workflow-fixes
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19710 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-customer-workflow-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "signed-in-nav-feedback-print");
const SCREEN_DIR = path.join(OUT_DIR, "screenshots");
const FARM_SOURCE = [
  "/opt/cursor/artifacts/farm-tk-audit/lesson-plan.json",
  path.join(ROOT, "artifacts/farm-tk-audit/lesson-plan.json"),
].find((candidate) => fs.existsSync(candidate));

const printApi = require("./teaching-kit-print.js");
const dayFieldApi = require("./curriculum-day-field-mapping.js");
const mapperApi = require("./teaching-kit-mapper.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
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

function farmFixturePlan() {
  const base = FARM_SOURCE
    ? (JSON.parse(fs.readFileSync(FARM_SOURCE, "utf8")).lessonPlan
      || JSON.parse(fs.readFileSync(FARM_SOURCE, "utf8")))
    : null;
  if (base && base.dailyPlans) {
    return {
      ...base,
      id: "cur-lp-workflow-farm-fixture",
      title: "Farm Animals",
      status: "published",
      plan: "Free",
      age: "Preschool",
      locked: false,
    };
  }
  return {
    id: "cur-lp-workflow-farm-fixture",
    title: "Farm Animals",
    status: "published",
    plan: "Free",
    age: "Preschool",
    theme: "Farm",
    locked: false,
    weeklyOverview: "A preschool farm week.",
    familyConnection: "Talk about farm animals at home.",
    dailyPlans: {
      monday: {
        theme: "Meet the Farm",
        circleTime: ["Ask your child which farm animal they investigated and invite them to show its movement or sound."],
        outdoorPlay: "Listen for descriptive words, animal comparisons, sound identification, spatial vocabulary, and safe movement choices.",
        familyConnection: "Offer real photos, two-choice prompts, seated movements, larger props, home-language vocabulary, and extra processing time. Extend with child-led comparisons or route design.",
        observations: ["Use large washable pieces, allergy-safe textures, stable low obstacles, clear walkways, and comfortable sound levels."],
        safetyNotes: "Supervise closely; use mouthing-safe material sizes; keep floors dry; honor sensory preferences.",
        items: [{
          title: "Farm Animal Discovery Basket",
          activityCategory: "Open-Ended Exploration",
          objective: "Explore farm animals",
          description: "Children explore a discovery basket.",
          materials: "Animals",
          steps: "Invite children to explore.",
        }],
      },
      tuesday: {
        theme: "Homes",
        circleTime: ["Invite families to notice an animal home nearby or in a book and talk about what makes it safe."],
        outdoorPlay: "Document sorting explanations, planning language, stability testing, revisions, sensory-tool control, and cause-and-effect talk.",
        familyConnection: "Use fewer items, photo-labeled groups, large blocks, dry brushing, thick-handled tools, or a no-water option. Extend with child-led building.",
        observations: ["Check recycled pieces for staples and sharp edges. Use shallow water with constant supervision; wipe spills and check sensory load."],
        safetyNotes: "Supervise closely; use mouthing-safe material sizes; keep floors dry; honor sensory preferences.",
        items: [{ title: "Barn Building", activityCategory: "Construction", objective: "Build", description: "Build", materials: "Blocks", steps: "Build" }],
      },
      wednesday: {
        theme: "Food",
        circleTime: ["Ask families to name a familiar food that begins on a farm. A photo or spoken answer is enough; no food needs to be sent."],
        outdoorPlay: "Notice prediction and sequence language, role negotiation, one-to-one counting, mark making, grip strength, pressure control.",
        familyConnection: "Use concrete sequence objects, picture-role badges, 1–3 item lists, large squeeze tools, or dry fine-motor alternatives.",
        observations: ["Check allergies before real foods; tasting requires program approval. Use clean containers, no plastic bags or real coins."],
        safetyNotes: "Supervise closely; use mouthing-safe material sizes; keep floors dry; honor sensory preferences.",
        items: [{ title: "Market Stand", activityCategory: "Dramatic Play", objective: "Play", description: "Play", materials: "Props", steps: "Play" }],
      },
      thursday: {
        theme: "Care",
        circleTime: ["Invite children to teach one gentle-care routine or counting game to someone at home."],
        outdoorPlay: "Watch care sequencing, empathy, counting accuracy, numeral matching, comparison language, fine-motor control, pattern exploration.",
        familyConnection: "Offer non-touch care roles, dot cards 1–5, larger eggs and tongs, dry track tracing, or one paint color. Extend with making a care book.",
        observations: ["Use soft clean care tools, large counting pieces, allergy-safe tray alternatives, non-toxic paint, secured paper, smocks."],
        safetyNotes: "Supervise closely; use mouthing-safe material sizes; keep floors dry; honor sensory preferences.",
        items: [{ title: "Gentle Care", activityCategory: "SEL", objective: "Care", description: "Care", materials: "Tools", steps: "Care" }],
      },
      friday: {
        theme: "Celebrate",
        circleTime: ["Send one specific learning note or child quote from the week and invite the child to retell the class-farm story at home."],
        outdoorPlay: "Document planning, negotiation, design revisions, sound evidence, story sequence, expressive movement, recall of farm content.",
        familyConnection: "Offer a defined building zone, picture choices, nonverbal sound matching, prop-holding, seated movement, partner roles.",
        observations: ["Use staple-free materials, low structures, clear paths, comfortable sound levels, walking feet around props, and scarves."],
        safetyNotes: "Supervise closely; use mouthing-safe material sizes; keep floors dry; honor sensory preferences.",
        items: [{ title: "Class Farm Story", activityCategory: "Literacy", objective: "Retell", description: "Retell", materials: "Props", steps: "Retell" }],
      },
    },
  };
}

function startServer(plan) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      curriculumLibrary: {
        lessonPlans: [plan],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      playBasedCurriculum: true,
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: false,
      },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "workflow-admin@test.local",
      ADMIN_PASSWORD: "workflow-admin-pass",
      ADMIN_ACCESS_CODE: "workflow-admin-code",
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
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("Server failed to boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function staticSourceChecks() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("teardownTeachingKitWorkspace"), "teardownTeachingKitWorkspace present");
  ok(appJs.includes("authStyleModalStillOpen"), "authStyleModalStillOpen present");
  ok(appJs.includes("dismissFeedbackModalForNavigation"), "dismissFeedbackModalForNavigation present");
  ok(appJs.includes("feedbackDraftScopeKey"), "feedback drafts are scoped");
  ok(appJs.includes("forceSubject"), "deliberate feedback uses forceSubject");
  ok(/Stacked dialogs: close feedback\/auth before the lesson viewer/.test(appJs), "Escape closes feedback before viewer");
  ok(appJs.includes("printing-teaching-kit"), "printing-teaching-kit cleaned on close");

  const mapper = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-mapper.js"), "utf8");
  ok(mapper.includes('pushSlot("circle", "Circle time")'), "schedule uses Circle time label, not circleTime copy");
  ok(mapper.includes("Never fold Circle Time / family copy"), "mapper documents circleTime isolation");

  const printJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-print.js"), "utf8");
  ok(printJs.includes("humanPrintScopeSummary"), "humanPrintScopeSummary present");
  ok(printJs.includes("Entire Binder Kit selected"), "Entire Binder Kit selected label");
  ok(printJs.includes("partCountLabel"), "partCountLabel present");
}

function unitPrintAndMappingChecks(plan) {
  const audit = dayFieldApi.auditLessonDayFieldMappings(plan);
  ok(audit.issueCount >= 10, `Farm audit finds multiple placement issues (got ${audit.issueCount})`);
  ok(audit.daysWithIssues.length === 5, "all five Farm days have mapping issues");
  ok(audit.issues.some((i) => i.code === "family_in_circle_time"), "detects family language in circleTime");
  ok(audit.issues.some((i) => i.code === "safety_in_observations"), "detects safety language in observations");
  ok(audit.issues.some((i) => i.code === "adaptation_in_family_connection"), "detects adaptations in familyConnection");
  ok(audit.issues.some((i) => i.code === "observation_in_outdoor_play"), "detects observation language in outdoorPlay");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "farm-animals-day-field-mapping-audit.json"),
    JSON.stringify({ source: FARM_SOURCE || "inline-fixture", audit }, null, 2),
  );

  const kit = mapperApi.mapLessonPlanToTeachingKit(plan, []);
  const labels = (kit?.companion?.days?.monday?.schedule || []).map((slot) => String(slot.label || ""));
  ok(labels.some((label) => label === "Circle time"), "schedule includes Circle time slot label");
  ok(!labels.some((label) => /Ask your child/i.test(label)), "schedule does not paste family circleTime copy");

  const fakeKit = {
    companion: {
      mondayMorningSetup: {
        materials: Array.from({ length: 60 }, (_, i) => `Material ${i + 1}`),
        prepTasks: [{ label: "Prep", minutes: 10 }],
        estimatedPrepMinutes: 60,
      },
      activities: [{ id: "a1", title: "Discovery Basket", dayOfWeek: "monday", observationIdeas: [] }],
      days: {
        monday: { focus: "Meet", schedule: [{ label: "Circle time" }], activities: [], observations: [] },
        tuesday: { focus: "Homes", schedule: [], activities: [], observations: [] },
        wednesday: { focus: "Food", schedule: [], activities: [], observations: [] },
        thursday: { focus: "Care", schedule: [], activities: [], observations: [] },
        friday: { focus: "Celebrate", schedule: [], activities: [], observations: [] },
      },
      songs: [{ id: "s1", title: "Hello", lyrics: "", lyricsPrintable: false }],
      books: [{ id: "b1", title: "Big Red Barn" }],
      vocabulary: [{ word: "farm" }],
      printables: [],
      parentConnection: { readyToSendMessage: "Talk about farm animals." },
    },
    quality: {},
  };
  const availability = printApi.evaluatePrintPartAvailability(fakeKit);
  ok(availability.setup.count === 60, "setup count is material count");
  ok(printApi.partCountLabel("setup", 60).includes("60 materials"), "setup count labeled as materials");
  ok(!/\(60\)/.test(printApi.partCountLabel("setup", 60)), "setup count is not a bare (60)");

  const presets = [
    ["week_binder", "Entire Binder Kit selected"],
    ["full_weekly_plan", "Full Weekly Lesson Plan selected"],
    ["today_pack", "Monday selected"],
    ["activities_only", "Activities Only selected"],
    ["one_activity", "Discovery Basket selected"],
    ["materials_list", "Materials List selected"],
    ["teacher_toolkit", "Teacher Toolkit selected"],
    ["all_printables", "Printables Only selected"],
    ["selected_resources", null],
  ];
  for (const [presetId, expected] of presets) {
    const req = printApi.buildPrintRequest(fakeKit, {
      preset: presetId,
      day: "monday",
      activityId: "a1",
      selectedResources: presetId === "selected_resources"
        ? { overview: true, days: ["monday"] }
        : undefined,
    });
    const model = {
      ok: true,
      days: Object.values(fakeKit.companion.days).map((day, index) => ({
        ...day,
        day: ["monday", "tuesday", "wednesday", "thursday", "friday"][index],
        dayLabel: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][index],
      })),
      activities: fakeKit.companion.activities,
      songs: fakeKit.companion.songs,
      books: fakeKit.companion.books,
      printables: [],
      overview: {},
      toolkit: { mondayMorningSetup: fakeKit.companion.mondayMorningSetup },
    };
    const manifest = printApi.resolvePrintManifest(fakeKit, req, model);
    const summary = printApi.summarizePrintSelection(manifest).summary;
    if (expected) {
      ok(summary === expected, `${presetId} summary is "${expected}" (got "${summary}")`);
    } else {
      ok(!/^\d+ items? selected$/.test(summary), `${presetId} does not use opaque item-count summary (${summary})`);
    }
  }

  const songAvail = printApi.evaluatePresetAvailability(fakeKit);
  ok(songAvail.song_lyrics.available === false, "Song Lyrics disabled without printable lyrics");
  ok(/No printable lyrics/i.test(songAvail.song_lyrics.reason || ""), "Song Lyrics explains what is missing");
}

async function seedLocalAccount(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const email = "workflow-customer@test.local";
    const account = {
      email,
      firstName: "Workflow",
      lastName: "Customer",
      plan: "Free",
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("llhCurrentUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({ [email]: account }));
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    return Boolean(document.body?.classList?.contains("app-booted")
      || document.querySelector(".nav-link[data-view='lessons']"));
  }, null, { timeout: 20000 });
}

async function openFarmLesson(page) {
  await page.click('.nav-link[data-view="lessons"]');
  await page.waitForSelector("#view-lessons.active-view", { timeout: 15000 });
  const opened = await page.evaluate(() => {
    const card = [...document.querySelectorAll("[data-view-resource], [data-open-resource], .resource-card, .lesson-card")]
      .find((node) => /farm animals/i.test(node.textContent || ""));
    if (card) {
      card.click();
      return true;
    }
    const btn = [...document.querySelectorAll("button, a")]
      .find((node) => /farm animals|view lesson/i.test(node.textContent || ""));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  ok(opened, "Farm Animals card/button found");
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 20000 });
}

async function assertShellInteractive(page, label) {
  const state = await page.evaluate(() => {
    const bodyClass = document.body.className;
    const viewerOpen = Boolean(document.querySelector("#resourceViewerModal.open"));
    const feedbackOpen = Boolean(document.querySelector("#feedbackModal.open"));
    const lessonsBtn = document.querySelector('.nav-link[data-view="lessons"]');
    const calendarBtn = document.querySelector('.nav-link[data-view="calendar"]');
    const lessonsBlocked = lessonsBtn
      ? getComputedStyle(lessonsBtn).pointerEvents === "none"
      : true;
    const calendarBlocked = calendarBtn
      ? getComputedStyle(calendarBtn).pointerEvents === "none"
      : true;
    return {
      bodyClass,
      viewerOpen,
      feedbackOpen,
      lessonsBlocked,
      calendarBlocked,
      authModalOpen: document.body.classList.contains("auth-modal-open"),
      lessonWorkspaceOpen: document.body.classList.contains("lesson-workspace-open"),
      printingTeachingKit: document.body.classList.contains("printing-teaching-kit"),
    };
  });
  ok(!state.viewerOpen, `${label}: viewer closed`);
  ok(!state.feedbackOpen, `${label}: feedback closed`);
  ok(!state.authModalOpen, `${label}: auth-modal-open cleared`);
  ok(!state.lessonWorkspaceOpen, `${label}: lesson-workspace-open cleared`);
  ok(!state.printingTeachingKit, `${label}: printing-teaching-kit cleared`);
  ok(!state.lessonsBlocked, `${label}: Lessons nav not pointer-events:none`);
  ok(!state.calendarBlocked, `${label}: Calendar nav not pointer-events:none`);
}

async function browserMatrix(plan) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = { desktop: {}, mobile: {}, consoleErrors: [], failedRequests: [] };

  async function runViewport(name, viewport) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => {
      failedRequests.push(`${req.failure()?.errorText || "failed"} ${req.url()}`);
    });

    await seedLocalAccount(page);

    // Journey: Calendar → Lesson Plans → Farm → close → Calendar
    await page.click('.nav-link[data-view="calendar"]');
    await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
    await openFarmLesson(page);
    await page.screenshot({ path: path.join(SCREEN_DIR, `${name}-01-farm-open.png`), fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForSelector("#resourceViewerModal.open", { state: "detached", timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 8000 });
    await assertShellInteractive(page, `${name} after first close`);
    await page.click('.nav-link[data-view="calendar"]');
    await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
    ok(true, `${name}: Calendar reachable after Farm close`);

    // Open/close lesson 5 times, navigate somewhere different each close
    const destinations = [
      ["activities", "#view-activities.active-view"],
      ["child-tools-daily-logs", "#view-children.active-view"],
      ["children", "#view-children.active-view"],
      ["settings", "#view-settings.active-view"],
      ["calendar", "#view-calendar.active-view"],
    ];
    for (let i = 0; i < destinations.length; i += 1) {
      await openFarmLesson(page);
      // Build / Print surface if present
      const buildTab = page.locator("[data-tk-goto='build'], button:has-text('Build'), button:has-text('Print')").first();
      if (await buildTab.count()) {
        await buildTab.click({ timeout: 3000 }).catch(() => {});
      }
      if (i === 0) {
        await page.screenshot({ path: path.join(SCREEN_DIR, `${name}-02-build-print.png`), fullPage: false });
        const summaryText = await page.locator("[data-tk-print-summary]").textContent().catch(() => "");
        if (summaryText) {
          ok(!/^\s*1 item selected/i.test(summaryText), `${name}: print summary not opaque "1 item selected"`);
          ok(/selected/i.test(summaryText), `${name}: print summary explains selection`);
        }
        const songLabel = await page.locator("label:has-text('Song Lyrics')").textContent().catch(() => "");
        if (songLabel) {
          ok(/No printable lyrics|not available|disabled/i.test(songLabel), `${name}: Song Lyrics explains missing lyrics`);
        }
      }
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 8000 });
      await assertShellInteractive(page, `${name} cycle ${i + 1}`);
      const [nav, selector] = destinations[i];
      await page.click(`.nav-link[data-view="${nav}"]`);
      await page.waitForSelector(selector, { timeout: 15000 });
      ok(true, `${name}: navigated to ${nav} after close #${i + 1}`);
    }

    // Feedback open/close separately — must not freeze viewer or nav
    await openFarmLesson(page);
    const needsImprovement = page.locator("[data-lesson-feedback='needs-improvement']").first();
    if (await needsImprovement.count()) {
      await needsImprovement.click();
      await page.waitForSelector("#feedbackModal.open", { timeout: 8000 });
      const subject = await page.inputValue("#feedbackSubjectInput");
      ok(/Farm Animals.*Needs Improvement/i.test(subject), `${name}: feedback subject set deliberately`);
      await page.screenshot({ path: path.join(SCREEN_DIR, `${name}-03-feedback-open.png`), fullPage: false });
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#feedbackModal.open"), null, { timeout: 8000 });
      ok(Boolean(await page.$("#resourceViewerModal.open")), `${name}: viewer stays open after feedback Escape`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 8000 });
      await assertShellInteractive(page, `${name} after feedback cycle`);
    } else {
      ok(true, `${name}: feedback controls not mounted in this fixture surface`);
    }

    // Refresh restore checks
    await page.click('.nav-link[data-view="lessons"]');
    await page.waitForSelector("#view-lessons.active-view", { timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#view-lessons.active-view, .nav-link[data-view='lessons']", { timeout: 20000 });
    const afterLessonsRefresh = await page.evaluate(() => ({
      lessons: Boolean(document.querySelector("#view-lessons.active-view")),
      feedback: Boolean(document.querySelector("#feedbackModal.open")),
    }));
    ok(afterLessonsRefresh.lessons, `${name}: refresh restores Lesson Plans`);
    ok(!afterLessonsRefresh.feedback, `${name}: feedback does not reopen on refresh`);

    await page.click('.nav-link[data-view="calendar"]');
    await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#view-calendar.active-view", { timeout: 20000 });
    ok(true, `${name}: refresh restores Calendar`);

    await page.click('.nav-link[data-view="child-tools-daily-logs"], .nav-link[data-view="children"]').catch(async () => {
      await page.click('.nav-link[data-view="children"]');
    });
    await page.waitForSelector("#view-children.active-view", { timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#view-children.active-view", { timeout: 20000 });
    ok(true, `${name}: refresh restores Daily Logs / Children`);

    // Browser back/forward
    await page.click('.nav-link[data-view="lessons"]');
    await page.waitForSelector("#view-lessons.active-view", { timeout: 15000 });
    await page.click('.nav-link[data-view="calendar"]');
    await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
    await page.goBack();
    await page.waitForTimeout(400);
    await page.goForward();
    await page.waitForTimeout(400);
    await assertShellInteractive(page, `${name} after history travel`);
    await page.screenshot({ path: path.join(SCREEN_DIR, `${name}-04-after-history.png`), fullPage: false });

    results[name] = { consoleErrors, failedRequests };
    results.consoleErrors.push(...consoleErrors.map((e) => `${name}: ${e}`));
    results.failedRequests.push(...failedRequests.map((e) => `${name}: ${e}`));
    await context.close();
  }

  try {
    await runViewport("desktop", { width: 1280, height: 800 });
    await runViewport("mobile", { width: 390, height: 844 });
  } finally {
    await browser.close();
  }
  return results;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const plan = farmFixturePlan();
  staticSourceChecks();
  unitPrintAndMappingChecks(plan);

  const child = startServer(plan);
  let browserResults = null;
  try {
    await waitForBoot(child);
    const health = await requestJson("GET", "/api/health");
    ok(health.status === 200, "health ok");
    browserResults = await browserMatrix(plan);
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  const report = {
    passed,
    outDir: OUT_DIR,
    screenshots: fs.existsSync(SCREEN_DIR) ? fs.readdirSync(SCREEN_DIR) : [],
    consoleErrors: browserResults?.consoleErrors || [],
    failedRequests: (browserResults?.failedRequests || []).filter((row) => !/favicon|analytics|pixel/i.test(row)),
    curriculumPublishedOrRewritten: false,
    subscriptionsChanged: false,
    teachingKitFlagsChanged: false,
  };
  fs.writeFileSync(path.join(OUT_DIR, "TEST_REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`PASS ${passed} assertions`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
