#!/usr/bin/env node
/**
 * Phase F2: Curriculum Planner teacher notes + group observations.
 * Run: npm run test:curriculum-planner-notes
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase-f2-${crypto.randomBytes(4).toString("hex")}.json`);
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const ADMIN = {
  email: "phase-f2-notes@test.local",
  password: "phase-f2-notes-pass",
  code: "phase-f2-notes-code",
};
const USER_A = "phase-f2-teacher-a@example.com";
const USER_B = "phase-f2-teacher-b@example.com";

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
  console.log("1) Static Phase F2 wiring");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  [
    "teacherNotes",
    "preparationNotes",
    "dailyTeacherNotes",
    "buildCurriculumPlannerParentSafeDto",
    "curriculumPlannerParentSafeDtoContainsPrivateLeak",
    "saveCurriculumPlannerTeacherNotesFromForm",
    "saveCurriculumPlannerObservationFromForm",
    "generateCurriculumPlannerObservationId",
    "Print Teacher Week",
    "activityMissing",
  ].forEach((needle) => assert(appJs.includes(needle), `Missing app.js: ${needle}`));
}

async function seedPlan(token, title) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, "V2 parse failed");
  const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const id = `cur-lp-f2-${crypto.randomBytes(3).toString("hex")}`;
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
    const planA = await seedPlan(token, `F2 Notes Plan A ${crypto.randomBytes(2).toString("hex")}`);
    const planB = await seedPlan(token, `F2 Notes Plan B ${crypto.randomBytes(2).toString("hex")}`);
    const mondayItemId = planA.dailyPlans?.monday?.items?.[0]?.itemId || "";
    assert(mondayItemId, "Seeded Monday activity itemId missing");

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

    console.log("3) Assign week + save weekly/prep/daily notes");
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
    await page.waitForSelector("#curriculumPlannerNotesForm", { timeout: 15000 });

    await page.fill('#curriculumPlannerNotesForm [name="teacherNotes"]', "Weekly note line 1\nWeekly note line 2");
    await page.fill('#curriculumPlannerNotesForm [name="preparationNotes"]', "Buy soil and cups");
    // Day cards use <details>; ensure the weekday is open before editing its private note.
    await page.locator('[data-curriculum-planner-day="monday"]').evaluate((el) => { el.open = true; });
    await page.fill('textarea[name="dailyNote-monday"]', "Move sensory to afternoon");
    await page.locator('[data-curriculum-planner-day="tuesday"]').evaluate((el) => { el.open = true; });
    await page.fill('textarea[name="dailyNote-tuesday"]', "Gather paint before lunch");
    await page.click('#curriculumPlannerNotesForm button[type="submit"]');
    await page.waitForFunction(() => /Teacher notes saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });

    let assignments = await readAssignments(USER_A);
    assert(assignments.length === 1, "Expected one assignment");
    assert(assignments[0].teacherNotes.includes("Weekly note line 1"), "Weekly teacher notes not saved");
    assert(assignments[0].teacherNotes.includes("\n"), "Weekly notes should preserve line breaks");
    assert(assignments[0].preparationNotes.includes("Buy soil"), "Preparation notes not saved");
    assert(assignments[0].dailyTeacherNotes.monday.includes("sensory"), "Monday daily note misplaced");
    assert(assignments[0].dailyTeacherNotes.tuesday.includes("paint"), "Tuesday daily note misplaced");
    const snapshotTitleBefore = assignments[0].snapshot.title;
    const snapshotMondayThemeBefore = assignments[0].snapshot.dailyPlans.monday.theme || "";

    console.log("4) Add / edit / delete group observation");
    await page.click('[data-curriculum-planner-add-observation="monday"]');
    await page.waitForSelector("#curriculumPlannerObservationForm", { timeout: 5000 });
    await page.selectOption('#curriculumPlannerObservationForm [name="dayOfWeek"]', "monday");
    await page.selectOption('#curriculumPlannerObservationForm [name="activityItemId"]', mondayItemId);
    await page.fill('#curriculumPlannerObservationForm [name="note"]', "Children needed more support with sorting.");
    await page.check('#curriculumPlannerObservationForm [name="followUpNeeded"]');
    // Optional child remains optional — leave blank
    await page.click('#curriculumPlannerObservationForm button[type="submit"]');
    await page.waitForSelector(".curriculum-planner-observation-card", { timeout: 5000 });

    assignments = await readAssignments(USER_A);
    assert(assignments[0].observations.length === 1, "Observation not saved");
    const obsId = assignments[0].observations[0].id;
    assert(/^cpo-/.test(obsId), "Observation ID not stable/prefixed");
    assert(assignments[0].observations[0].dayOfWeek === "monday", "Observation weekday mismatch");
    assert(assignments[0].observations[0].activityItemId === mondayItemId, "Observation activity link missing");
    assert(assignments[0].observations[0].followUpNeeded === true, "Follow-up flag missing");
    assert(!assignments[0].observations[0].childId, "Child should remain optional/empty");

    await page.click(`[data-curriculum-planner-edit-observation="${obsId}"]`);
    await page.waitForFunction((id) => {
      const form = document.querySelector("#curriculumPlannerObservationForm");
      const panel = document.querySelector(".curriculum-planner-observations-panel");
      return Boolean(form && panel?.open && form.querySelector('[name="observationId"]')?.value === id);
    }, obsId, { timeout: 5000 });
    await page.fill('#curriculumPlannerObservationForm [name="note"]', "Edited observation: sorting improved with support.");
    await page.click('#curriculumPlannerObservationForm button[type="submit"]');
    await page.waitForFunction(() => /Observation saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });
    assignments = await readAssignments(USER_A);
    assert(assignments[0].observations[0].id === obsId, "Observation ID changed on edit");
    assert(assignments[0].observations[0].note.includes("Edited observation"), "Observation edit not saved");

    console.log("5) Notes/observations survive reassignment; stale activity warns");
    await page.selectOption('#curriculumPlannerAssignForm [name="lessonPlanId"]', planB.id);
    await page.click('#curriculumPlannerAssignForm button[type="submit"]');
    await page.waitForFunction(() => /preserved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 10000 });
    assignments = await readAssignments(USER_A);
    assert(assignments[0].lessonPlanId === planB.id, "Reassignment did not switch lesson plan");
    assert(assignments[0].teacherNotes.includes("Weekly note line 1"), "Teacher notes lost on reassignment");
    assert(assignments[0].preparationNotes.includes("Buy soil"), "Prep notes lost on reassignment");
    assert(assignments[0].dailyTeacherNotes.monday.includes("sensory"), "Daily notes lost on reassignment");
    assert(assignments[0].observations[0].id === obsId, "Observation lost/changed on reassignment");
    assert(assignments[0].observations[0].activityMissing === true, "Missing activity warning flag not set");
    assert(await page.locator(".curriculum-planner-activity-warning").count(), "UI warning for old activity missing");
    assert(assignments[0].snapshot.title !== snapshotTitleBefore || planB.title === assignments[0].snapshot.title, "Snapshot should refresh to new plan");
    // Notes save must not mutate snapshot when saving notes again
    const themeAfterReassign = assignments[0].snapshot.dailyPlans.monday.theme || "";
    await page.fill('#curriculumPlannerNotesForm [name="teacherNotes"]', "Weekly note line 1\nWeekly note line 2\nExtra");
    await page.click('#curriculumPlannerNotesForm button[type="submit"]');
    await page.waitForFunction(() => /Teacher notes saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });
    assignments = await readAssignments(USER_A);
    assert((assignments[0].snapshot.dailyPlans.monday.theme || "") === themeAfterReassign, "Saving notes mutated lesson snapshot");
    assert(assignments[0].snapshot.title === planB.title, "Snapshot title drifted while saving notes");

    console.log("6) Parent-safe DTO excludes private fields");
    const dtoCheck = await page.evaluate((week) => {
      const assignment = curriculumAssignmentForWeek(week);
      const dto = buildCurriculumPlannerParentSafeDto(assignment);
      return {
        dto,
        leaked: curriculumPlannerParentSafeDtoContainsPrivateLeak(dto),
        hasTeacherNotes: Boolean(dto?.teacherNotes),
        hasObservations: Array.isArray(dto?.observations),
        hasDailyTeacherNotes: Boolean(dto?.dailyTeacherNotes),
      };
    }, weekStart);
    assert(!dtoCheck.leaked, "Parent-safe DTO leaked private markers");
    assert(!dtoCheck.hasTeacherNotes, "Parent DTO includes teacherNotes");
    assert(!dtoCheck.hasObservations, "Parent DTO includes observations");
    assert(!dtoCheck.hasDailyTeacherNotes, "Parent DTO includes dailyTeacherNotes");

    console.log("7) Delete observation + clear notes");
    await page.click(`[data-curriculum-planner-delete-observation="${obsId}"]`);
    await page.waitForFunction(() => /Observation deleted/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });
    assignments = await readAssignments(USER_A);
    assert((assignments[0].observations || []).length === 0, "Observation not deleted");
    await page.click(`[data-curriculum-planner-clear-notes="${weekStart}"]`);
    await page.waitForFunction(() => /Teacher notes cleared/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });
    assignments = await readAssignments(USER_A);
    assert(!assignments[0].teacherNotes, "Weekly notes not cleared");
    assert(!assignments[0].preparationNotes, "Prep notes not cleared");
    assert(!assignments[0].dailyTeacherNotes.monday, "Daily notes not cleared");

    console.log("8) Account isolation");
    // Restore a note for account A, then switch to B
    await page.fill('#curriculumPlannerNotesForm [name="teacherNotes"]', "Private to teacher A");
    await page.click('#curriculumPlannerNotesForm button[type="submit"]');
    await page.waitForFunction(() => /Teacher notes saved/i.test(document.querySelector(".form-message")?.textContent || ""), null, { timeout: 5000 });
    await loginAs(USER_B);
    await page.evaluate((week) => {
      curriculumPlannerSelectedWeek = week;
      setView("curriculum-planner");
    }, weekStart);
    await page.waitForSelector("#curriculumPlannerAssignForm", { timeout: 10000 });
    const bAssignments = await readAssignments(USER_B);
    assert(bAssignments.length === 0, "Account B should not see Account A assignments");
    const aKeyPresentForB = await page.evaluate((email) => localStorage.getItem(`llhCurriculumAssignments:${email}`), USER_A);
    // Same browser can still have A's key in storage, but planner must read only B's key
    assert(aKeyPresentForB, "Expected Account A storage key to remain isolated in browser");
    const visibleNotes = await page.locator('#curriculumPlannerNotesForm [name="teacherNotes"]').count();
    assert(visibleNotes === 0, "Account B saw teacher notes form without assignment (unexpected assignment leak)");

    console.log("9) Mobile 412px");
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
    assert(await page.locator("#curriculumPlannerNotesForm button[type='submit']").isVisible(), "Save notes button not usable on mobile");

    await browser.close();
    console.log("\nPhase F2 curriculum planner notes checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
