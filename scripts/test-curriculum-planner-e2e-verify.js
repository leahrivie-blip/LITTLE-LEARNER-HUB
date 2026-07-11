#!/usr/bin/env node
/**
 * Full Curriculum Planner end-to-end verification (F1+F2+F3).
 * Covers assign, notes, observations, parent calendar, preview/print privacy,
 * reassignment preservation, mobile, dashboard, and library assign.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19910 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-planner-e2e-${crypto.randomBytes(4).toString("hex")}.json`);
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const ADMIN = {
  email: "planner-e2e@test.local",
  password: "planner-e2e-pass",
  code: "planner-e2e-code",
};
const USER = "planner-e2e-teacher@example.com";

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

function mondayIso(from = new Date()) {
  const date = new Date(from);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function seedPlan(token, title) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, "V2 parse failed");
  const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const id = `cur-lp-e2e-${crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: site.json.siteContent?.updatedAt || "",
    lessonPlan: {
      ...parsed.data,
      id,
      title,
      plan: "Free",
      status: "published",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  return save.json.lessonPlan;
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error("playwright required");
  }

  const findings = [];
  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, "Admin login failed");
    const token = login.json.token;

    console.log("1) Seed lesson plans");
    const planA = await seedPlan(token, `E2E Plan A ${crypto.randomBytes(2).toString("hex")}`);
    const planB = await seedPlan(token, `E2E Plan B ${crypto.randomBytes(2).toString("hex")}`);
    const mondayItemId = planA.dailyPlans?.monday?.items?.[0]?.itemId || "";
    assert(mondayItemId, "Monday activity itemId missing");

    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (dialog) => { await dialog.accept(); });

    const loginAs = async () => {
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate((userEmail) => {
        localStorage.setItem("llhUser", userEmail);
        localStorage.setItem("llhAccounts", JSON.stringify({
          [userEmail]: { email: userEmail, plan: "Free", subscriptionStatus: "Free Plan" },
        }));
        localStorage.setItem("llhPlan", "Free");
      }, USER);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof renderCurriculumPlanner === "function", null, { timeout: 30000 });
      await page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => {});
    };

    const readAssignments = async () => page.evaluate((userEmail) => {
      const raw = localStorage.getItem(`llhCurriculumAssignments:${userEmail}`);
      return raw ? JSON.parse(raw) : [];
    }, USER);

    await loginAs();
    const weekStart = mondayIso();

    console.log("2) Assign lesson plan to week");
    await page.evaluate((week) => {
      curriculumPlannerSelectedWeek = week;
      setView("curriculum-planner");
    }, weekStart);
    await page.waitForSelector("#curriculumPlannerAssignForm", { timeout: 10000 });
    await page.fill('#curriculumPlannerAssignForm [name="weekStartDate"]', weekStart);
    await page.selectOption('#curriculumPlannerAssignForm [name="ageGroup"]', "Preschool");
    await page.fill('#curriculumPlannerAssignForm [name="classroomLabel"]', "Blue Room");
    await page.selectOption('#curriculumPlannerAssignForm [name="lessonPlanId"]', planA.id);
    await page.click('#curriculumPlannerAssignForm button[type="submit"]');
    await page.waitForSelector("#curriculumPlannerNotesForm", { timeout: 15000 });
    let assignments = await readAssignments();
    assert(assignments[0]?.lessonPlanId === planA.id, "Assignment failed");
    assert(assignments[0]?.snapshot?.title, "Snapshot missing");

    console.log("3) Add teacher notes");
    await page.fill('#curriculumPlannerNotesForm [name="teacherNotes"]', "PRIVATE weekly: prep sensory bins early");
    await page.fill('#curriculumPlannerNotesForm [name="preparationNotes"]', "PRIVATE prep: buy soil cups");
    await page.locator('[data-curriculum-planner-day="monday"]').evaluate((el) => { el.open = true; });
    await page.fill('textarea[name="dailyNote-monday"]', "PRIVATE daily: move sorting to afternoon");
    await page.click('#curriculumPlannerNotesForm button[type="submit"]');
    await page.waitForFunction(() => /Teacher notes saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });

    console.log("4) Add observations");
    await page.click('[data-curriculum-planner-add-observation="monday"]');
    await page.waitForSelector("#curriculumPlannerObservationForm", { timeout: 5000 });
    await page.selectOption('#curriculumPlannerObservationForm [name="dayOfWeek"]', "monday");
    await page.selectOption('#curriculumPlannerObservationForm [name="activityItemId"]', mondayItemId);
    await page.fill('#curriculumPlannerObservationForm [name="note"]', "PRIVATE obs: children needed more support with sorting");
    await page.check('#curriculumPlannerObservationForm [name="followUpNeeded"]');
    await page.click('#curriculumPlannerObservationForm button[type="submit"]');
    await page.waitForSelector(".curriculum-planner-observation-card", { timeout: 5000 });

    console.log("5) Add parent message + multiple classroom events");
    await page.fill('#curriculumPlannerParentMessageForm [name="parentMessage"]', "Hello families — exciting week ahead!");
    await page.click('#curriculumPlannerParentMessageForm button[type="submit"]');
    await page.waitForFunction(() => /Parent calendar message saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });

    const eventsToAdd = [
      { day: "monday", type: "Important Reminder", title: "First Day Reminder", items: "" },
      { day: "wednesday", type: "Field Trip", title: "Farm Field Trip", items: "Labeled lunch bag" },
      { day: "friday", type: "Water Day", title: "Water Day Splash", items: "Towel and swimsuit" },
    ];
    for (const event of eventsToAdd) {
      await page.locator(`[data-curriculum-planner-day="${event.day}"]`).evaluate((el) => { el.open = true; });
      await page.click(`[data-curriculum-planner-add-event="${event.day}"]`);
      await page.waitForSelector("#curriculumPlannerEventForm", { timeout: 5000 });
      await page.selectOption('#curriculumPlannerEventForm [name="eventType"]', event.type);
      await page.fill('#curriculumPlannerEventForm [name="title"]', event.title);
      await page.selectOption('#curriculumPlannerEventForm [name="dayOfWeek"]', event.day);
      await page.fill('#curriculumPlannerEventForm [name="description"]', `${event.title} details for families.`);
      if (event.items) await page.fill('#curriculumPlannerEventForm [name="itemsToBring"]', event.items);
      await page.click('#curriculumPlannerEventForm button[type="submit"]');
      await page.waitForFunction((title) => {
        return Array.from(document.querySelectorAll(".curriculum-planner-event-card"))
          .some((card) => card.textContent.includes(title));
      }, event.title, { timeout: 5000 });
    }

    assignments = await readAssignments();
    assert(assignments[0].teacherNotes.includes("PRIVATE weekly"), "Teacher notes missing");
    assert(assignments[0].observations.length === 1, "Observation missing");
    assert(assignments[0].parentCalendar.parentMessage.includes("Hello families"), "Parent message missing");
    assert(assignments[0].parentCalendar.classroomEvents.length === 3, "Expected 3 classroom events");

    console.log("6) Verify parent preview excludes private data");
    await page.click(`[data-curriculum-planner-toggle-parent-preview="${weekStart}"]`);
    await page.waitForSelector("#curriculumPlannerParentPreview", { timeout: 5000 });
    const previewText = await page.locator("#curriculumPlannerParentPreview").innerText();
    assert(previewText.includes("Water Day Splash"), "Preview missing Water Day");
    assert(previewText.includes("Farm Field Trip"), "Preview missing Field Trip");
    assert(previewText.includes("Hello families") || previewText.includes("exciting week"), "Preview missing parent message");
    assert(!/PRIVATE/i.test(previewText), "Parent preview leaked PRIVATE marker");
    assert(!/sensory bins|soil cups|needed more support with sorting/i.test(previewText), "Parent preview leaked teacher note/obs content");
    assert(!/follow-up needed/i.test(previewText), "Parent preview leaked follow-up flag");

    console.log("7) Verify parent print excludes private data");
    const printCheck = await page.evaluate((week) => {
      const assignment = curriculumAssignmentForWeek(week);
      const dto = buildCurriculumPlannerParentSafeDto(assignment);
      const printText = buildCurriculumPlannerParentPrintText(assignment);
      const teacherPrint = buildCurriculumPlannerTeacherPrintText(assignment);
      return {
        leaked: curriculumPlannerParentSafeDtoContainsPrivateLeak(dto),
        dtoHasTeacherNotes: Object.prototype.hasOwnProperty.call(dto || {}, "teacherNotes"),
        dtoHasObservations: Object.prototype.hasOwnProperty.call(dto || {}, "observations"),
        dtoEventCount: dto?.classroomEvents?.length || 0,
        printText,
        teacherPrint,
      };
    }, weekStart);
    assert(!printCheck.leaked, "Parent DTO leak check failed");
    assert(!printCheck.dtoHasTeacherNotes, "DTO has teacherNotes key");
    assert(!printCheck.dtoHasObservations, "DTO has observations key");
    assert(printCheck.dtoEventCount === 3, "DTO missing events");
    assert(printCheck.printText.includes("Water Day Splash"), "Parent print missing event");
    assert(printCheck.printText.includes("Towel"), "Parent print missing items to bring");
    assert(!/PRIVATE weekly|PRIVATE prep|PRIVATE daily|PRIVATE obs|sensory bins|soil cups/i.test(printCheck.printText), "Parent print leaked teacher private content");
    assert(/PRIVATE weekly|PRIVATE obs/i.test(printCheck.teacherPrint), "Teacher print should still include private notes");
    findings.push("Parent preview/print correctly exclude teacher notes and observations; teacher print still includes them.");

    console.log("8) Reassignment preserves parent events + private notes");
    const eventIdsBefore = assignments[0].parentCalendar.classroomEvents.map((e) => e.id).sort();
    await page.selectOption('#curriculumPlannerAssignForm [name="lessonPlanId"]', planB.id);
    await page.click('#curriculumPlannerAssignForm button[type="submit"]');
    await page.waitForFunction(() => /preserved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 10000 });
    assignments = await readAssignments();
    assert(assignments[0].lessonPlanId === planB.id, "Reassignment failed");
    assert(assignments[0].parentCalendar.classroomEvents.length === 3, "Parent events lost on reassignment");
    assert(assignments[0].parentCalendar.parentMessage.includes("Hello families"), "Parent message lost");
    assert(assignments[0].teacherNotes.includes("PRIVATE weekly"), "Teacher notes lost");
    assert(assignments[0].observations.length === 1, "Observations lost");
    const eventIdsAfter = assignments[0].parentCalendar.classroomEvents.map((e) => e.id).sort();
    assert(JSON.stringify(eventIdsBefore) === JSON.stringify(eventIdsAfter), "Event IDs changed on reassignment");
    assert(assignments[0].observations[0].activityMissing === true, "Stale activity warning flag missing after reassignment");
    findings.push("Lesson-plan reassignment preserves parent events, parent message, teacher notes, and observations; stale activity link flagged.");

    console.log("9) Mobile 412px layout");
    await page.setViewportSize({ width: 412, height: 915 });
    await page.evaluate((week) => {
      curriculumPlannerSelectedWeek = week;
      setView("curriculum-planner");
    }, weekStart);
    await page.waitForSelector(".curriculum-planner-shell", { timeout: 10000 });
    const mobile = await page.evaluate(() => {
      const shell = document.querySelector(".curriculum-planner-shell");
      return {
        ok: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          && document.body.scrollWidth <= document.body.clientWidth + 1
          && (!shell || shell.scrollWidth <= shell.clientWidth + 1),
        hasNotesSave: Boolean(document.querySelector("#curriculumPlannerNotesForm button[type='submit']")),
        hasParentSave: Boolean(document.querySelector("#curriculumPlannerParentMessageForm button[type='submit']")),
        eventCards: document.querySelectorAll(".curriculum-planner-event-card").length,
      };
    });
    assert(mobile.ok, "Mobile horizontal overflow detected");
    assert(mobile.hasNotesSave && mobile.hasParentSave, "Mobile missing save controls");
    assert(mobile.eventCards === 3, "Mobile missing event cards");

    console.log("10) Dashboard curriculum panel");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => setView("home"));
    await page.waitForFunction(() => {
      return Boolean(document.querySelector(".dashboard-curriculum-assigned, .dashboard-curriculum-empty, [data-view='curriculum-planner']"));
    }, null, { timeout: 10000 });
    const dash = await page.evaluate(() => {
      const assigned = document.querySelector(".dashboard-curriculum-assigned");
      return {
        hasAssigned: Boolean(assigned),
        text: assigned?.innerText || "",
        openBtn: Boolean(document.querySelector(".dashboard-curriculum-assigned [data-view='curriculum-planner'], [data-view='curriculum-planner']")),
      };
    });
    assert(dash.hasAssigned, "Dashboard missing assigned curriculum panel");
    assert(dash.text.includes(planB.title) || dash.text.includes("Week of"), "Dashboard missing assigned plan context");
    assert(dash.openBtn, "Dashboard missing Open Curriculum Planner control");
    findings.push("Dashboard This Week’s Curriculum panel shows assigned week and planner shortcut.");

    console.log("11) Library Assign to Week workflow");
    await page.evaluate(() => setView("lessons"));
    await page.waitForFunction(() => typeof resources !== "undefined" && Array.isArray(resources), null, { timeout: 10000 });
    const libraryAssign = await page.evaluate(async (planId) => {
      if (typeof openCurriculumPlannerAssignFlow !== "function") {
        return { ok: false, reason: "openCurriculumPlannerAssignFlow missing" };
      }
      await openCurriculumPlannerAssignFlow(planId);
      return {
        ok: true,
        view: typeof currentView !== "undefined" ? currentView : document.body.dataset.view || "",
        selected: typeof curriculumPlannerAssignResourceId !== "undefined" ? curriculumPlannerAssignResourceId : "",
        hasForm: Boolean(document.querySelector("#curriculumPlannerAssignForm")),
      };
    }, planA.id);
    assert(libraryAssign.ok, libraryAssign.reason || "Library assign flow failed");
    assert(libraryAssign.selected === planA.id, "Library assign did not preselect lesson plan");
    await page.waitForSelector("#curriculumPlannerAssignForm", { timeout: 10000 });
    const selectedOption = await page.$eval('#curriculumPlannerAssignForm [name="lessonPlanId"]', (el) => el.value);
    assert(selectedOption === planA.id, "Assign form lesson plan not preselected from library");
    findings.push("Library Assign to Week / openCurriculumPlannerAssignFlow still preselects the lesson plan in the planner.");

    // Confirm day cards still show classroom event chips after reassignment
    await page.locator('[data-curriculum-planner-day="friday"]').evaluate((el) => { el.open = true; });
    const fridayChip = await page.locator('[data-curriculum-planner-day="friday"] .curriculum-planner-day-events').innerText();
    assert(fridayChip.includes("Water Day Splash"), "Friday day card missing classroom event chip");

    await browser.close();
    console.log("\nCurriculum Planner full E2E verification passed.");
    console.log("Findings:");
    findings.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
