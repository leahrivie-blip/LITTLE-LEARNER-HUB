#!/usr/bin/env node
/**
 * Phase F3: Curriculum Planner Parent Calendar + Classroom Events.
 * Run: npm run test:curriculum-planner-calendar
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19850 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase-f3-${crypto.randomBytes(4).toString("hex")}.json`);
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const ADMIN = {
  email: "phase-f3-calendar@test.local",
  password: "phase-f3-calendar-pass",
  code: "phase-f3-calendar-code",
};
const USER_A = "phase-f3-teacher-a@example.com";
const USER_B = "phase-f3-teacher-b@example.com";

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

function staticChecks() {
  console.log("1) Static Phase F3 wiring");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  [
    "Classroom Events",
    "parentCalendar",
    "classroomEvents",
    "CURRICULUM_CLASSROOM_EVENT_TYPES",
    "buildCurriculumPlannerParentSafeDto",
    "saveCurriculumPlannerClassroomEventFromForm",
    "buildCurriculumPlannerParentPrintText",
    "Print Parent Calendar",
    "Show Parent Preview",
    "generateCurriculumPlannerClassroomEventId",
  ].forEach((needle) => assert(appJs.includes(needle), `Missing app.js: ${needle}`));
}

async function seedPlan(token, title) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, "V2 parse failed");
  const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const id = `cur-lp-f3-${crypto.randomBytes(3).toString("hex")}`;
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
  staticChecks();
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error("playwright required");
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, "Admin login failed");
    const token = login.json.token;

    console.log("2) Seed two Free lesson plans");
    const planA = await seedPlan(token, `F3 Calendar Plan A ${crypto.randomBytes(2).toString("hex")}`);
    const planB = await seedPlan(token, `F3 Calendar Plan B ${crypto.randomBytes(2).toString("hex")}`);

    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (dialog) => { await dialog.accept(); });

    const loginAs = async (email) => {
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate((userEmail) => {
        localStorage.setItem("llhUser", userEmail);
        localStorage.setItem("llhAccounts", JSON.stringify({
          [userEmail]: { email: userEmail, plan: "Free", subscriptionStatus: "Free Plan" },
        }));
        localStorage.setItem("llhPlan", "Free");
      }, email);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof renderCurriculumPlanner === "function", null, { timeout: 30000 });
      await page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => {});
    };

    const readAssignments = async (email) => page.evaluate((userEmail) => {
      const raw = localStorage.getItem(`llhCurriculumAssignments:${userEmail}`);
      return raw ? JSON.parse(raw) : [];
    }, email);

    console.log("3) Assign week + save parent message + classroom event");
    await loginAs(USER_A);
    const weekStart = mondayIso();
    await page.evaluate((week) => {
      curriculumPlannerSelectedWeek = week;
      setView("curriculum-planner");
    }, weekStart);
    await page.waitForSelector("#curriculumPlannerAssignForm", { timeout: 10000 });
    await page.fill('#curriculumPlannerAssignForm [name="weekStartDate"]', weekStart);
    await page.selectOption('#curriculumPlannerAssignForm [name="ageGroup"]', "Preschool");
    await page.selectOption('#curriculumPlannerAssignForm [name="lessonPlanId"]', planA.id);
    await page.click('#curriculumPlannerAssignForm button[type="submit"]');
    await page.waitForSelector("#curriculumPlannerParentMessageForm", { timeout: 15000 });

    await page.fill('#curriculumPlannerParentMessageForm [name="parentMessage"]', "Hello families — Friday is Water Day!");
    await page.click('#curriculumPlannerParentMessageForm button[type="submit"]');
    await page.waitForFunction(() => /Parent calendar message saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });

    await page.click('[data-curriculum-planner-add-event="friday"]');
    await page.waitForSelector("#curriculumPlannerEventForm", { timeout: 5000 });
    await page.selectOption('#curriculumPlannerEventForm [name="eventType"]', "Water Day");
    await page.fill('#curriculumPlannerEventForm [name="title"]', "Water Day Splash");
    await page.selectOption('#curriculumPlannerEventForm [name="dayOfWeek"]', "friday");
    await page.fill('#curriculumPlannerEventForm [name="description"]', "We will play with water tables outdoors.");
    await page.fill('#curriculumPlannerEventForm [name="itemsToBring"]', "Towel and swimsuit");
    await page.click('#curriculumPlannerEventForm button[type="submit"]');
    await page.waitForSelector(".curriculum-planner-event-card", { timeout: 5000 });

    let assignments = await readAssignments(USER_A);
    assert(assignments.length === 1, "Expected one assignment");
    assert(assignments[0].parentCalendar.parentMessage.includes("Water Day"), "Parent message not saved");
    assert(assignments[0].parentCalendar.classroomEvents.length === 1, "Classroom event not saved");
    const eventId = assignments[0].parentCalendar.classroomEvents[0].id;
    assert(/^cce-/.test(eventId), "Event ID not stable/prefixed");
    assert(assignments[0].parentCalendar.classroomEvents[0].dayOfWeek === "friday", "Event weekday mismatch");
    assert(assignments[0].parentCalendar.classroomEvents[0].itemsToBring.includes("Towel"), "Items to bring missing");

    // Also save a private teacher note to prove it stays out of parent DTO/print
    await page.fill('#curriculumPlannerNotesForm [name="teacherNotes"]', "PRIVATE: gather sensory bins before circle");
    await page.click('#curriculumPlannerNotesForm button[type="submit"]');
    await page.waitForFunction(() => /Teacher notes saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });

    console.log("4) Edit classroom event + parent preview excludes private notes");
    await page.click(`[data-curriculum-planner-edit-event="${eventId}"]`);
    await page.waitForFunction((id) => {
      const form = document.querySelector("#curriculumPlannerEventForm");
      return Boolean(form && form.querySelector('[name="eventId"]')?.value === id);
    }, eventId, { timeout: 5000 });
    await page.fill('#curriculumPlannerEventForm [name="title"]', "Water Day Splash Party");
    await page.click('#curriculumPlannerEventForm button[type="submit"]');
    await page.waitForFunction(() => /Classroom event saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });
    assignments = await readAssignments(USER_A);
    assert(assignments[0].parentCalendar.classroomEvents[0].id === eventId, "Event ID changed on edit");
    assert(assignments[0].parentCalendar.classroomEvents[0].title.includes("Party"), "Event edit not saved");

    await page.click(`[data-curriculum-planner-toggle-parent-preview="${weekStart}"]`);
    await page.waitForSelector("#curriculumPlannerParentPreview", { timeout: 5000 });
    const previewText = await page.locator("#curriculumPlannerParentPreview").innerText();
    assert(previewText.includes("Water Day Splash Party"), "Parent preview missing classroom event");
    assert(!previewText.includes("PRIVATE:"), "Parent preview leaked teacher notes");
    assert(!previewText.toLowerCase().includes("sensory bins"), "Parent preview leaked private note content");

    const dtoCheck = await page.evaluate((week) => {
      const assignment = curriculumAssignmentForWeek(week);
      const dto = buildCurriculumPlannerParentSafeDto(assignment);
      const printText = buildCurriculumPlannerParentPrintText(assignment);
      return {
        dto,
        leaked: curriculumPlannerParentSafeDtoContainsPrivateLeak(dto),
        hasTeacherNotes: Boolean(dto?.teacherNotes),
        hasObservations: Array.isArray(dto?.observations),
        eventCount: dto?.classroomEvents?.length || 0,
        printText,
        printHasPrivate: /PRIVATE:|sensory bins|Teacher Notes|Group Observations/i.test(printText)
          && !/Teacher planning notes and observations are not included/i.test(printText),
      };
    }, weekStart);
    assert(!dtoCheck.leaked, "Parent-safe DTO leaked private markers");
    assert(!dtoCheck.hasTeacherNotes, "Parent DTO includes teacherNotes");
    assert(!dtoCheck.hasObservations, "Parent DTO includes observations");
    assert(dtoCheck.eventCount === 1, "Parent DTO missing classroom events");
    assert(dtoCheck.printText.includes("Water Day Splash Party"), "Parent print missing event");
    assert(dtoCheck.printText.includes("Towel"), "Parent print missing items to bring");
    assert(!/PRIVATE: gather sensory/i.test(dtoCheck.printText), "Parent print leaked teacher notes");

    console.log("5) Events survive lesson-plan reassignment");
    await page.selectOption('#curriculumPlannerAssignForm [name="lessonPlanId"]', planB.id);
    await page.click('#curriculumPlannerAssignForm button[type="submit"]');
    await page.waitForFunction(() => /preserved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 10000 });
    assignments = await readAssignments(USER_A);
    assert(assignments[0].lessonPlanId === planB.id, "Reassignment did not switch lesson plan");
    assert(assignments[0].parentCalendar.parentMessage.includes("Water Day"), "Parent message lost on reassignment");
    assert(assignments[0].parentCalendar.classroomEvents[0].id === eventId, "Classroom event lost on reassignment");
    assert(assignments[0].teacherNotes.includes("PRIVATE"), "Teacher notes should also remain after reassignment");

    console.log("6) Delete classroom event");
    await page.click(`[data-curriculum-planner-delete-event="${eventId}"]`);
    await page.waitForFunction(() => /Classroom event deleted/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });
    assignments = await readAssignments(USER_A);
    assert((assignments[0].parentCalendar.classroomEvents || []).length === 0, "Classroom event not deleted");
    assert(assignments[0].parentCalendar.parentMessage.includes("Water Day"), "Deleting event cleared parent message");

    console.log("7) Account isolation");
    await loginAs(USER_B);
    await page.evaluate((week) => {
      curriculumPlannerSelectedWeek = week;
      setView("curriculum-planner");
    }, weekStart);
    await page.waitForSelector("#curriculumPlannerAssignForm", { timeout: 10000 });
    const bAssignments = await readAssignments(USER_B);
    assert(bAssignments.length === 0, "Account B should not see Account A parent calendar");
    assert(await page.locator("#curriculumPlannerParentMessageForm").count() === 0, "Account B saw parent calendar without assignment");

    console.log("8) Mobile 412px");
    await loginAs(USER_A);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.evaluate((week) => {
      curriculumPlannerSelectedWeek = week;
      setView("curriculum-planner");
    }, weekStart);
    await page.waitForSelector(".curriculum-planner-shell", { timeout: 10000 });
    const overflow = await page.evaluate(() => {
      const shell = document.querySelector(".curriculum-planner-shell");
      return {
        ok: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          && document.body.scrollWidth <= document.body.clientWidth + 1
          && (!shell || shell.scrollWidth <= shell.clientWidth + 1),
      };
    });
    assert(overflow.ok, "Mobile horizontal overflow detected");
    assert(await page.locator("#curriculumPlannerParentMessageForm button[type='submit']").isVisible(), "Parent message save not usable on mobile");

    await browser.close();
    console.log("\nPhase F3 curriculum planner calendar checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
