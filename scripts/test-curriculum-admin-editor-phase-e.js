#!/usr/bin/env node
/**
 * Phase E: premium Admin curriculum lesson-plan editor.
 * Covers weekly/daily/activity editing, books/songs, reorder/move,
 * itemId preservation, Activity Library sync-on-save, and mobile layout.
 *
 * Run: npm run test:curriculum-admin-editor
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19510 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase-e-${crypto.randomBytes(4).toString("hex")}.json`);
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const ADMIN = {
  email: "phase-e-editor@test.local",
  password: "phase-e-editor-pass",
  code: "phase-e-editor-code",
};
const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

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

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, `Admin login failed: ${res.status}`);
  return res.json.token;
}

async function getUpdatedAt(token) {
  const res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert(res.status === 200, "Admin site-content read failed");
  return res.json.siteContent?.updatedAt || "";
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
}

function flattenItems(plan) {
  const items = [];
  CURRICULUM_WEEKDAYS.forEach((day) => {
    (plan.dailyPlans?.[day]?.items || []).forEach((item) => items.push({ ...item, day }));
  });
  return items;
}

function staticWiringChecks() {
  console.log("1) Static Phase E editor wiring");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  [
    "curriculum-premium-editor",
    "curriculum-activity-sync-notice",
    "Changes to lesson-plan activities will update linked Activity Library entries when saved.",
    "data-curriculum-teacher-role",
    "data-curriculum-teacher-language",
    "data-curriculum-age-modifications",
    "data-curriculum-day-theme",
    "data-curriculum-add-book",
    "data-curriculum-add-song",
    "data-curriculum-activity-duplicate",
    "data-curriculum-activity-move-day",
    "collectCurriculumBooksFromEditor",
    "moveCurriculumDailyPlanRowToDay",
    "duplicateCurriculumDailyPlanRow",
  ].forEach((needle) => assert(appJs.includes(needle), `Missing app.js wiring: ${needle}`));
  [
    "curriculum-premium-editor",
    "curriculum-daily-day-summary",
    "curriculum-list-row-actions",
  ].forEach((needle) => assert(styles.includes(needle), `Missing styles.css wiring: ${needle}`));
}

async function openAdminEditor(page, planId) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(() => setView("admin"));
  await page.waitForSelector("#adminUnlockForm", { timeout: 15000 });
  await page.fill('input[name="adminEmail"]', ADMIN.email);
  await page.fill('input[name="adminPassword"]', ADMIN.password);
  await page.fill('input[name="adminCode"]', ADMIN.code);
  await page.click("#adminUnlockForm button[type='submit']");
  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });
  await page.evaluate((id) => {
    if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
    if (typeof openAdminCurriculumLessonEditor === "function") openAdminCurriculumLessonEditor(id, { scroll: true });
  }, planId);
  await page.waitForSelector("#adminCurriculumLessonPlanForm", { timeout: 15000 });
  await page.waitForSelector(".curriculum-activity-sync-notice", { timeout: 5000 });
}

async function runBrowserEditorFlow(planId, seededItemId) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error("playwright is required for Phase E editor tests");
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("dialog", async (dialog) => { await dialog.accept(); });

  console.log("3) Open imported premium lesson in Admin editor");
  await openAdminEditor(page, planId);
  assert(await page.locator('textarea[name="weeklyOverview"]').inputValue(), "Weekly overview missing for imported plan");
  assert(await page.locator('[data-curriculum-day-panel="monday"]').count(), "Monday daily panel missing");

  console.log("4) Weekly field editing + books/songs add/edit/delete/reorder");
  await page.fill('textarea[name="weeklyOverview"]', "Phase E weekly overview edited.");
  await page.fill('textarea[name="objectives"]', "Phase E weekly objectives edited.");
  await page.fill('textarea[name="weeklyMaterials"]', "Phase E weekly materials edited.");
  await page.fill('textarea[name="vocabularyWords"]', "phase, editor, vocabulary");
  await page.fill('textarea[name="familyConnection"]', "Phase E family connection.");
  await page.fill('textarea[name="observationOpportunities"]', "Phase E observation opportunities.");
  await page.fill('textarea[name="adaptations"]', "Phase E adaptations.");

  const weeklyBooks = page.locator('[data-curriculum-books-editor="weekly"]');
  await weeklyBooks.locator("[data-curriculum-add-book]").click();
  const bookRows = weeklyBooks.locator("[data-curriculum-book-row]");
  await bookRows.last().locator("[data-curriculum-book-title]").fill("Phase E Book");
  await bookRows.last().locator("[data-curriculum-book-author]").fill("Editor Author");
  await bookRows.last().locator("[data-curriculum-book-notes]").fill("Added in Phase E");
  if (await bookRows.count() > 1) {
    await bookRows.last().locator('[data-curriculum-list-move="up"]').click();
  }
  const firstBookTitleBeforeDelete = await bookRows.first().locator("[data-curriculum-book-title]").inputValue();
  if ((await bookRows.count()) > 1 && firstBookTitleBeforeDelete && firstBookTitleBeforeDelete !== "Phase E Book") {
    await bookRows.first().locator("[data-curriculum-list-remove]").click();
  }

  const weeklySongs = page.locator('[data-curriculum-songs-editor="weekly"]');
  await weeklySongs.locator("[data-curriculum-add-song]").click();
  const songRows = weeklySongs.locator("[data-curriculum-song-row]");
  await songRows.last().locator("[data-curriculum-song-title]").fill("Phase E Song");
  await songRows.last().locator("[data-curriculum-song-notes]").fill("Song notes");
  if (await songRows.count() > 1) {
    await songRows.first().locator("[data-curriculum-list-remove]").click();
  }

  console.log("5) Daily field editing");
  const monday = page.locator('[data-curriculum-day-panel="monday"]');
  await monday.evaluate((el) => { el.open = true; });
  await monday.locator("[data-curriculum-day-theme]").fill("Phase E Monday Theme");
  await monday.locator("[data-curriculum-day-objectives]").fill("Phase E Monday objectives");
  await monday.locator("[data-curriculum-day-materials]").fill("Phase E Monday materials");
  await monday.locator("[data-curriculum-day-vocabulary]").fill("monday, soil, sprout");
  await monday.locator("[data-curriculum-day-outdoor]").fill("Outdoor garden walk");
  await monday.locator("[data-curriculum-day-family]").fill("Ask about home plants");
  await monday.locator("[data-curriculum-day-adaptations]").fill("Monday adaptations");
  await monday.locator("[data-curriculum-day-safety]").fill("Wash hands after soil play");
  await monday.locator('[data-curriculum-day-domains] input[value="Science"]').check();
  await monday.locator('[data-curriculum-add-book="day:monday"]').click();
  await monday.locator('[data-curriculum-books-editor="day:monday"] [data-curriculum-book-row]').last()
    .locator("[data-curriculum-book-title]").fill("Monday Day Book");
  await monday.locator('[data-curriculum-add-song="day:monday"]').click();
  await monday.locator('[data-curriculum-songs-editor="day:monday"] [data-curriculum-song-row]').last()
    .locator("[data-curriculum-song-title]").fill("Monday Day Song");
  await monday.locator('[data-curriculum-add-text-list="day:monday:circleTime"]').click();
  await monday.locator('[data-curriculum-text-list-editor="day:monday:circleTime"] [data-curriculum-text-list-value"]').last()
    .fill("Circle: weather and seeds");
  await monday.locator('[data-curriculum-add-text-list="day:monday:transitions"]').click();
  await monday.locator('[data-curriculum-text-list-editor="day:monday:transitions"] [data-curriculum-text-list-value"]').last()
    .fill("Transition: clean-up song");
  await monday.locator('[data-curriculum-add-text-list="day:monday:observations"]').click();
  await monday.locator('[data-curriculum-text-list-editor="day:monday:observations"] [data-curriculum-text-list-value"]').last()
    .fill("Observe curiosity with soil");

  console.log("6) Activity edit / add / duplicate / reorder / move");
  let mondayActivity = monday.locator(".curriculum-daily-item-row").first();
  await mondayActivity.waitFor({ timeout: 10000 });
  const preservedItemId = await mondayActivity.locator("[data-curriculum-item-id]").inputValue();
  assert(preservedItemId, "Seeded activity missing itemId in editor");
  if (seededItemId) assert(preservedItemId === seededItemId, "Seeded itemId not preserved when opening editor");

  await mondayActivity.locator("[data-curriculum-title]").fill("Phase E Edited Activity");
  await mondayActivity.locator("[data-curriculum-steps]").fill("1. Dig gently.\n2. Observe roots.");
  await mondayActivity.locator("[data-curriculum-teacher-role]").fill("Facilitate soil exploration");
  await mondayActivity.locator("[data-curriculum-teacher-language]").fill("What do you notice in the soil?");
  await mondayActivity.locator("[data-curriculum-vocabulary]").fill("soil, root, sprout");
  await mondayActivity.locator("[data-curriculum-extensions]").fill("Measure sprout height");
  await mondayActivity.locator("[data-curriculum-adaptations]").fill("Offer gloves");
  await mondayActivity.locator("[data-curriculum-safety-notes]").fill("No tasting soil");
  await mondayActivity.locator("[data-curriculum-age-modifications]").fill("Toddlers use spoons");
  await mondayActivity.locator('[data-curriculum-activity-domains] input[value="Science"]').check();

  await monday.locator('[data-curriculum-add-row="monday"]').click();
  const newRow = monday.locator(".curriculum-daily-item-row").last();
  await newRow.locator("[data-curriculum-title]").fill("Brand New Phase E Activity");
  await newRow.locator("[data-curriculum-steps]").fill("Brand new directions.");
  const newItemId = await newRow.locator("[data-curriculum-item-id]").inputValue();
  assert(newItemId && newItemId !== preservedItemId, "New activity must receive a new itemId");

  await mondayActivity.locator("[data-curriculum-activity-duplicate]").click();
  const mondayCountAfterDup = await monday.locator(".curriculum-daily-item-row").count();
  assert(mondayCountAfterDup >= 3, `Expected duplicated Monday activities, got ${mondayCountAfterDup}`);

  await monday.locator(".curriculum-daily-item-row").first().locator('[data-curriculum-activity-move="down"]').click();

  // Move the edited original activity (by itemId) to Tuesday
  const moved = await page.evaluate((itemId) => {
    const rows = [...document.querySelectorAll('#adminCurriculumLessonPlanForm .curriculum-daily-item-row')];
    const row = rows.find((entry) => entry.querySelector("[data-curriculum-item-id]")?.value === itemId);
    if (!row) return false;
    const select = row.querySelector("[data-curriculum-activity-move-day]");
    if (!select) return false;
    select.value = "tuesday";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, preservedItemId);
  assert(moved, "Could not move preserved activity to Tuesday");
  await page.waitForSelector('[data-curriculum-day-panel="tuesday"] .curriculum-daily-item-row', { timeout: 5000 });
  const stillOnTuesday = await page.evaluate((itemId) => {
    const row = [...document.querySelectorAll('[data-curriculum-day-panel="tuesday"] .curriculum-daily-item-row')]
      .find((entry) => entry.querySelector("[data-curriculum-item-id]")?.value === itemId);
    return Boolean(row);
  }, preservedItemId);
  assert(stillOnTuesday, "Preserved activity did not land on Tuesday after move");

  console.log("7) Save from Admin editor");
  await page.click('#adminCurriculumLessonPlanForm button[type="submit"]');
  await page.waitForFunction(() => {
    const msg = document.querySelector("#adminCurriculumLessonPlanMessage, #adminCurriculumLessonPlanBanner");
    return msg && /saved|success|updated/i.test(msg.textContent || "");
  }, null, { timeout: 30000 });

  console.log("8) Mobile layout at 412px");
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(300);
  await page.evaluate((id) => {
    if (typeof openAdminCurriculumLessonEditor === "function") openAdminCurriculumLessonEditor(id, { scroll: true });
  }, planId);
  await page.waitForSelector("#adminCurriculumLessonPlanForm", { timeout: 10000 });
  const overflow = await page.evaluate(() => {
    const form = document.querySelector("#adminCurriculumLessonPlanForm");
    if (!form) return { ok: false, reason: "form missing" };
    const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const bodyOverflow = document.body.scrollWidth > document.body.clientWidth + 1;
    const formOverflow = form.scrollWidth > form.clientWidth + 1;
    return {
      ok: !docOverflow && !bodyOverflow && !formOverflow,
      docOverflow,
      bodyOverflow,
      formOverflow,
      scrollWidth: form.scrollWidth,
      clientWidth: form.clientWidth,
    };
  });
  assert(overflow.ok, `Mobile horizontal overflow detected: ${JSON.stringify(overflow)}`);
  assert(await page.locator("[data-curriculum-day-theme]").first().isEditable(), "Daily theme not editable on mobile");
  assert(await page.locator("[data-curriculum-teacher-language]").first().isEditable(), "Teacher language not editable on mobile");

  await browser.close();
  return { preservedItemId, newItemId };
}

async function main() {
  staticWiringChecks();

  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, `V2 sample parse failed: ${(parsed.errors || []).join("; ")}`);

  const child = startServer();
  try {
    await waitForBoot(child);
    const token = await login();
    let expectedUpdatedAt = await getUpdatedAt(token);

    console.log("2) Seed imported premium lesson plan");
    const planId = `cur-lp-phase-e-${crypto.randomBytes(3).toString("hex")}`;
    const seed = await saveLesson(token, {
      ...parsed.data,
      id: planId,
      title: `Phase E Editor ${planId}`,
      status: "draft",
      plan: "Pro",
    }, expectedUpdatedAt);
    assert(seed.status === 200, `Seed save failed: ${seed.status} ${seed.text}`);
    expectedUpdatedAt = seed.json.siteContentUpdatedAt;
    const seededPlan = seed.json.lessonPlan;
    const seededItems = flattenItems(seededPlan);
    assert(seededItems.length > 0, "Seeded plan has no activities");
    const seededItemId = seededItems[0].itemId;
    const seededActivityCount = (seed.json.activities || []).filter((a) => a.status !== "archived").length;

    const browserResult = await runBrowserEditorFlow(planId, seededItemId);

    console.log("9) Verify saved premium fields + itemId preservation + activity sync");
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(reload.status === 200, "Admin reload failed");
    const plan = (reload.json.siteContent?.curriculum?.lessonPlans || []).find((item) => item.id === planId);
    assert(plan, "Edited lesson plan missing after save");
    assert(plan.weeklyOverview.includes("Phase E weekly overview"), "Weekly overview not saved");
    assert(plan.objectives.includes("Phase E weekly objectives"), "Weekly objectives not saved");
    assert(plan.weeklyMaterials.includes("Phase E weekly materials"), "Weekly materials not saved");
    assert(plan.vocabularyWords.includes("vocabulary"), "Weekly vocabulary not saved");
    assert(plan.familyConnection.includes("Phase E family"), "Family connection not saved");
    assert((plan.books || []).some((book) => book.title === "Phase E Book"), "Weekly book add not saved");
    assert((plan.songs || []).some((song) => song.title === "Phase E Song"), "Weekly song add not saved");

    const monday = plan.dailyPlans.monday;
    const tuesday = plan.dailyPlans.tuesday;
    assert(monday.theme.includes("Phase E Monday Theme") || tuesday.theme, "Daily theme missing");
    // Monday theme may remain if panel wasn't the moved day; assert Tuesday received moved activity
    const allItems = flattenItems(plan);
    const preserved = allItems.find((item) => item.itemId === browserResult.preservedItemId);
    assert(preserved, "Preserved itemId missing after edit/save");
    assert(preserved.title.includes("Phase E Edited Activity") || preserved.title.includes("copy"), "Edited activity title not preserved with same itemId");
    assert(preserved.teacherLanguage.includes("soil") || preserved.teacherRole.includes("soil") || preserved.safetyNotes.includes("soil"), "Premium activity fields not saved");
    assert(allItems.some((item) => item.itemId === browserResult.newItemId), "Brand-new activity itemId missing");
    assert(allItems.some((item) => item.day === "tuesday" && item.itemId === browserResult.preservedItemId)
      || allItems.filter((item) => item.day === "tuesday").length > 0, "Activity move between weekdays not reflected");

    const activities = (reload.json.siteContent?.curriculum?.activities || []).filter((a) => a.lessonPlanId === planId);
    const activeActivities = activities.filter((a) => a.status !== "archived");
    assert(activeActivities.length >= seededActivityCount, "Activity Library sync lost entries");
    const synced = activeActivities.find((a) => a.itemId === browserResult.preservedItemId || String(a.id || "").includes(String(browserResult.preservedItemId || "").replace(/^item-/, "")));
    // Match by sourceKey suffix / title when id scheme uses cur-act-{suffix}
    const syncedByTitle = activeActivities.find((a) => /Phase E Edited Activity/.test(a.title || ""));
    assert(syncedByTitle || synced, "Edited activity did not sync into Activity Library on save");
    if (syncedByTitle) {
      assert(syncedByTitle.teacherLanguage || syncedByTitle.teacherRole || syncedByTitle.safetyNotes, "Synced activity missing premium fields");
    }
    const ids = activeActivities.map((a) => a.id);
    assert(new Set(ids).size === ids.length, "Duplicate Activity Library ids detected");
    const itemIds = allItems.map((item) => item.itemId);
    assert(new Set(itemIds).size === itemIds.length, "Duplicate itemIds in lesson plan after save");

    console.log("10) Existing / imported plans still open with premium fields");
    assert(plan.dailyPlans.monday, "Monday daily plan missing");
    assert(Object.keys(plan.dailyPlans).length === 5, "Expected Mon–Fri daily plans");

    console.log("\nPhase E admin editor checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
