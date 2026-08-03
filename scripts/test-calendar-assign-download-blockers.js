#!/usr/bin/env node
/**
 * Production blockers:
 * 1) Use This Plan must transfer Monday–Friday activities/materials (Farm Animals + schema variants)
 * 2) Lesson download buttons must produce PDFs with loading/error feedback (never silent)
 *
 * Run: npm run test:calendar-assign-download-blockers
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium, devices } = require("playwright");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-assign-dl-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "assign-dl-admin@test.local",
  password: "assign-dl-pass",
  code: "assign-dl-code",
};
const FREE_USER = "assign-dl-free@example.com";
const PRO_USER = "assign-dl-pro@example.com";
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const FARM_ID = "cur-lp-preschool-farm-animals";

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
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
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [FREE_USER]: {
        email: FREE_USER,
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
      [PRO_USER]: {
        email: PRO_USER,
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
      },
    },
    siteContent: {},
    adminSessions: {},
    scheduleByUser: {},
  }, null, 2));
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
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
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

function mondayIso(offsetWeeks = 2) {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff + (offsetWeeks * 7));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    accessCode: ADMIN.code,
  });
  assert.equal(res.status, 200, `admin login failed: ${res.status}`);
  return res.json.token || res.json.sessionToken || res.json.adminToken;
}

async function seedStructuredLesson(token) {
  const raw = fs.readFileSync(SAMPLE, "utf8");
  const parsed = parseCurriculumLessonPlanImport(raw);
  const plan = {
    ...parsed.lessonPlan,
    id: `cur-lp-assign-dl-structured-${Date.now()}`,
    title: "Assign DL Structured Sample",
    status: "published",
    plan: "Free",
  };
  // Force Free so Free users can assign in entitlement matrix.
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    lessonPlan: plan,
    publish: true,
  }, { Authorization: `Bearer ${token}`, "x-admin-email": ADMIN.email });
  if (save.status !== 200 && save.status !== 201) {
    // Fallback: write directly into store via site-content admin path if needed.
    throw new Error(`seed structured failed: ${save.status} ${save.text.slice(0, 200)}`);
  }
  return plan.id;
}

async function loginAs(page, email) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
  await page.evaluate((userEmail) => {
    const users = JSON.parse(localStorage.getItem("llhUsers") || "{}");
    users[userEmail] = {
      email: userEmail,
      password: "TestPass123!",
      plan: /pro/i.test(userEmail) ? "Pro" : "Free",
      name: "Assign DL QA",
    };
    localStorage.setItem("llhUsers", JSON.stringify(users));
    localStorage.setItem("llhCurrentUser", userEmail);
    localStorage.setItem("currentUser", userEmail);
  }, email);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(async (userEmail) => {
    currentUser = userEmail;
    if (typeof updateAuthUI === "function") updateAuthUI();
    if (typeof updatePlanLabel === "function") updatePlanLabel();
    if (typeof ensureCurriculumLoaded === "function") await ensureCurriculumLoaded().catch(() => {});
    if (typeof ensureScheduleLoaded === "function") await ensureScheduleLoaded({ force: true }).catch(() => {});
  }, email);
}

function countSnapshot(snapshot) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const counts = {};
  let total = 0;
  days.forEach((day) => {
    const n = (snapshot?.dailyPlans?.[day]?.items || []).filter((item) => String(item?.title || "").trim()).length;
    counts[day] = n;
    total += n;
  });
  return { counts, total };
}

async function assignViaUi(page, lessonId, week) {
  await page.evaluate(async (id) => {
    await openResourceViewer(id);
  }, lessonId);
  await page.waitForSelector("[data-lesson-use-this-plan]", { timeout: 20000 });
  await page.click("[data-lesson-use-this-plan]");
  await page.waitForSelector("[data-lesson-main-calendar-form]", { timeout: 10000 });
  await page.fill("[data-lesson-main-calendar-form] [name='weekStartDate']", week);
  await page.click("[data-lesson-main-calendar-form] button[type='submit']");
  await page.waitForFunction(() => {
    const success = document.querySelector("[data-lesson-workspace-action-panel='success']");
    const note = document.querySelector("[data-lesson-assign-sheet-note]")?.textContent || "";
    return Boolean(success?.offsetParent) || /could not be added|did not load|did not transfer/i.test(note);
  }, null, { timeout: 20000 });
  return page.evaluate(() => {
    const successOpen = Boolean(document.querySelector("[data-lesson-workspace-action-panel='success']")?.offsetParent !== undefined
      && document.querySelector("[data-lesson-assign-success-note]"));
    const panel = document.querySelector("[data-lesson-workspace-action-panel='success']");
    return {
      successVisible: Boolean(panel && !panel.hidden && getComputedStyle(panel).display !== "none"),
      successNote: document.querySelector("[data-lesson-assign-success-note]")?.textContent || "",
      assignNote: document.querySelector("[data-lesson-assign-sheet-note]")?.textContent || "",
      message: document.querySelector("[data-lesson-workspace-success-message]")?.textContent || "",
    };
  });
}

async function snapshotForWeek(page, week) {
  return page.evaluate((weekStart) => {
    const api = typeof getScheduleApi === "function" ? getScheduleApi() : null;
    const doc = (typeof scheduleDocCache !== "undefined" && scheduleDocCache)
      || api?.readCache?.(typeof scheduleApiEmail === "function" ? scheduleApiEmail() : "")
      || { items: [] };
    const item = api?.lessonForWeek?.(doc, weekStart) || null;
    const snapshot = item?.snapshot || null;
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const counts = {};
    let total = 0;
    let materials = 0;
    days.forEach((day) => {
      const dayPlan = snapshot?.dailyPlans?.[day] || {};
      const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
      counts[day] = items.filter((entry) => String(entry?.title || "").trim()).length;
      total += counts[day];
      items.forEach((entry) => {
        if (String(entry?.materials || "").trim()) materials += 1;
      });
      if (String(dayPlan.materials || "").trim()) materials += 1;
    });
    if (String(snapshot?.weeklyMaterials || "").trim()) materials += 1;
    return {
      lessonPlanId: item?.lessonPlanId || "",
      title: item?.lessonPlanTitle || item?.title || "",
      theme: snapshot?.theme || "",
      counts,
      total,
      materials,
      snapshot,
    };
  }, week);
}

async function runBrowserSuite() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  async function caseLog(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
      console.error(`FAIL ${name}: ${error.message}`);
      throw error;
    }
  }

  const desktop = await browser.newContext({ serviceWorkers: "block" });
  const page = await desktop.newPage();
  await loginAs(page, FREE_USER);

  const week = mondayIso(3);
  await caseLog("Farm Animals resolve+snapshot has 15 activities (not slim list)", async () => {
    const probe = await page.evaluate(async ({ id, weekStart }) => {
      const resource = resources.find((item) => item.id === id);
      const slim = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => [
        day,
        (resource?._curriculumLessonPlan?.dailyPlans?.[day]?.items || []).length,
      ]));
      const resolved = await resolveCurriculumPlanForAssignment(id, { weekStartDate: weekStart });
      const snapshot = buildCurriculumLessonPlanSnapshot(resolved.plan);
      const counts = {};
      let total = 0;
      ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
        counts[day] = (snapshot.dailyPlans?.[day]?.items || []).length;
        total += counts[day];
      });
      return { slim, counts, total, theme: snapshot.theme, title: snapshot.title };
    }, { id: FARM_ID, weekStart: week });
    assert.equal(probe.slim.monday, 0, "expected slim browse payload for Farm Animals");
    assert.equal(probe.total, 15, `Farm Animals snapshot should have 15 activities, got ${probe.total}`);
    assert.equal(probe.counts.monday, 3);
    assert.equal(probe.counts.friday, 3);
    assert.match(String(probe.title || ""), /Farm Animals/i);
  });

  await caseLog("Use This Plan UI assigns Farm Animals with activities+materials", async () => {
    const ui = await assignViaUi(page, FARM_ID, week);
    assert.match(ui.successNote, /ready with \d+ activities/i, `success note wrong: ${ui.successNote}`);
    assert.doesNotMatch(ui.successNote, /did not transfer/i);
    const saved = await snapshotForWeek(page, week);
    assert.equal(saved.lessonPlanId, FARM_ID);
    assert.equal(saved.total, 15, `saved snapshot activities ${saved.total}`);
    assert.ok(saved.materials > 0, "expected materials in snapshot");
    Object.values(saved.counts).forEach((count) => assert.equal(count, 3));
  });

  await caseLog("Calendar week glance reflects activity count without leave/reopen", async () => {
    await page.click("[data-lesson-open-calendar]");
    await page.waitForSelector("#view-calendar.active-view, #mainCalendarApp, [data-calendar-week]", { timeout: 15000 });
    const glance = await page.evaluate((weekStart) => {
      const api = getScheduleApi();
      const doc = scheduleDocCache || api.readCache(scheduleApiEmail());
      const lesson = api.lessonForWeek(doc, weekStart);
      const sunday = api.weekStartMonday(weekStart); // monday-based app; stats still receive week bounds
      const saturday = api.weekEndFromStart ? api.weekEndFromStart(weekStart) : weekStart;
      const stats = calendarWeekGlanceStats(doc, lesson, sunday, saturday, [], []);
      return {
        ...stats,
        directCount: countCurriculumSnapshotActivities(lesson?.snapshot || {}),
        dayCounts: ["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => calendarDayActivityCount(lesson, day)),
      };
    }, week);
    assert.equal(glance.directCount, 15);
    assert.equal(glance.activityCount, 15);
    assert.equal(glance.hasLesson, true);
    assert.deepEqual(glance.dayCounts, [3, 3, 3, 3, 3]);
  });

  await caseLog("Refresh persistence keeps Farm Animals activities", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(async (userEmail) => {
      currentUser = userEmail;
      if (typeof ensureScheduleLoaded === "function") await ensureScheduleLoaded({ force: true });
    }, FREE_USER);
    const saved = await snapshotForWeek(page, week);
    assert.equal(saved.total, 15);
  });

  await caseLog("Duplicate assign replaces and keeps content", async () => {
    await page.evaluate(async (id) => { await openResourceViewer(id); }, FARM_ID);
    await page.waitForSelector("[data-lesson-use-this-plan]");
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector("[data-lesson-main-calendar-form]");
    await page.fill("[data-lesson-main-calendar-form] [name='weekStartDate']", week);
    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await page.click("[data-lesson-main-calendar-form] button[type='submit']");
    await page.waitForTimeout(800);
    const saved = await snapshotForWeek(page, week);
    assert.equal(saved.total, 15);
  });

  await caseLog("Remove assignment refreshes immediately and source lesson unchanged", async () => {
    const before = await page.evaluate(async (id) => {
      const detail = await fetchAuthorizedCurriculumLessonPlan(id);
      return countCurriculumSnapshotActivities(detail.lessonPlan || {});
    }, FARM_ID);
    assert.equal(before, 15);
    // Deterministic remove via schedule API (same persistence path as UI delete).
    await page.evaluate(async (weekStart) => {
      const api = getScheduleApi();
      await ensureScheduleLoaded({ force: true });
      const doc = scheduleDocCache || api.readCache(scheduleApiEmail());
      const item = api.lessonForWeek(doc, weekStart);
      if (!item?.id) throw new Error("expected assigned lesson before remove");
      await api.deleteItem(firebaseAuthHeaders, scheduleApiEmail(), item.id);
      scheduleDocCache = api.readCache(scheduleApiEmail());
      if (typeof refreshCalendarSurfacesAfterScheduleChange === "function") {
        refreshCalendarSurfacesAfterScheduleChange(weekStart);
      }
      if (typeof renderMainCalendar === "function") renderMainCalendar();
    }, week);
    const afterRemove = await snapshotForWeek(page, week);
    assert.equal(afterRemove.total, 0);
    const source = await page.evaluate(async (id) => {
      const detail = await fetchAuthorizedCurriculumLessonPlan(id);
      return countCurriculumSnapshotActivities(detail.lessonPlan || {});
    }, FARM_ID);
    assert.equal(source, 15, "source lesson must remain unchanged");
  });

  await caseLog("Empty snapshot is refused (no false success)", async () => {
    const refused = await page.evaluate(async () => {
      try {
        assertAssignableCurriculumSnapshot({
          title: "Empty",
          theme: "Empty",
          weeklyOverview: "Overview only",
          dailyPlans: {
            monday: { items: [] },
            tuesday: { items: [] },
            wednesday: { items: [] },
            thursday: { items: [] },
            friday: { items: [] },
          },
        }, { id: "empty", title: "Empty" });
        return { ok: false, error: "did-not-throw" };
      } catch (error) {
        return { ok: true, error: error.message };
      }
    });
    assert.equal(refused.ok, true);
    assert.match(refused.error, /could not be added|did not transfer|did not load/i);
  });

  await caseLog("Embedded-activity + activityId enrichment paths", async () => {
    const embedded = await page.evaluate(() => {
      const plan = {
        id: "embedded-test",
        title: "Embedded",
        theme: "Embedded",
        dailyPlans: {
          monday: { items: [{ title: "A1", materials: "glue" }] },
          tuesday: { items: [{ title: "A2" }] },
          wednesday: { items: [] },
          thursday: { items: [{ title: "A4" }] },
          friday: { items: [{ title: "A5", materials: "paint" }] },
        },
      };
      const snapshot = buildCurriculumLessonPlanSnapshot(plan);
      return countCurriculumSnapshotActivities(snapshot);
    });
    assert.equal(embedded, 4);

    const enriched = await page.evaluate(() => {
      const plan = {
        id: "activity-id-test",
        title: "IDs",
        activityIds: ["a1", "a2"],
        dailyPlans: {
          monday: { items: [] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      };
      const content = effectiveSiteContent();
      if (!content.curriculumLibrary || typeof content.curriculumLibrary !== "object") {
        content.curriculumLibrary = { lessonPlans: [], activities: [], resources: [], series: [], updatedAt: new Date().toISOString() };
      }
      const lib = content.curriculumLibrary;
      const original = Array.isArray(lib.activities) ? lib.activities.slice() : [];
      lib.activities = [
        ...original,
        {
          id: "a1", lessonPlanId: "activity-id-test", dayOfWeek: "monday", title: "From ID Mon", materials: "blocks", status: "published",
        },
        {
          id: "a2", lessonPlanId: "activity-id-test", dayOfWeek: "wednesday", title: "From ID Wed", status: "published",
        },
      ];
      try {
        const next = enrichCurriculumPlanDailyPlansFromActivities(plan, "activity-id-test");
        const snapshot = buildCurriculumLessonPlanSnapshot(next);
        return {
          total: countCurriculumSnapshotActivities(snapshot),
          monday: snapshot.dailyPlans.monday.items.map((item) => item.title),
          materials: snapshot.dailyPlans.monday.items[0]?.materials || "",
        };
      } finally {
        lib.activities = original;
      }
    });
    assert.equal(enriched.total, 2);
    assert.deepEqual(enriched.monday, ["From ID Mon"]);
    assert.equal(enriched.materials, "blocks");
  });

  await caseLog("Teacher Weekly Planner + Full Lesson Plan downloads (desktop)", async () => {
    await page.evaluate(async (id) => { await openResourceViewer(id); }, FARM_ID);
    await page.waitForSelector('[data-lesson-download-variant="week"]');
    assert.equal(await page.evaluate(() => typeof showToast === "function"), true);

    const [weekFile] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]').first().click(),
    ]);
    assert.match(weekFile.suggestedFilename(), /teacher-weekly-planner\.pdf$/i);
    const weekPath = await weekFile.path();
    const weekBuf = fs.readFileSync(weekPath);
    assert.ok(weekBuf.slice(0, 5).toString() === "%PDF-", "week PDF magic");
    assert.ok(weekBuf.length > 1000, "week PDF not blank");

    const [fullFile] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="full"]').first().click(),
    ]);
    assert.match(fullFile.suggestedFilename(), /full-lesson-plan\.pdf$/i);
    const fullBuf = fs.readFileSync(await fullFile.path());
    assert.ok(fullBuf.slice(0, 5).toString() === "%PDF-");
    assert.ok(fullBuf.length > 1000);
  });

  await caseLog("Download failure surfaces visible error (no silent fail)", async () => {
    const shown = await page.evaluate(async () => {
      const original = window.buildTeacherWeeklyPlannerPdfBlob;
      window.buildTeacherWeeklyPlannerPdfBlob = () => null;
      lessonPlanDownloadBusy = false;
      const ok = await downloadLessonPlanVariant("week");
      window.buildTeacherWeeklyPlannerPdfBlob = original;
      const banner = document.querySelector("#afterActionPrompt");
      return {
        ok,
        bannerText: banner?.textContent || "",
        visible: Boolean(banner?.classList.contains("visible")),
      };
    });
    assert.equal(shown.ok, false);
    assert.equal(shown.visible, true);
    assert.match(shown.bannerText, /could not be generated|try again/i);
  });

  await caseLog("Repeated click ignored while busy", async () => {
    const busy = await page.evaluate(async () => {
      lessonPlanDownloadBusy = true;
      const ok = await downloadLessonPlanVariant("full");
      lessonPlanDownloadBusy = false;
      const banner = document.querySelector("#afterActionPrompt")?.textContent || "";
      return { ok, banner };
    });
    assert.equal(busy.ok, false);
    assert.match(busy.banner, /already in progress/i);
  });

  await caseLog("Blank calendar note clears completely", async () => {
    const date = week;
    await page.evaluate(async (iso) => {
      mainCalendarSelectedDay = iso;
      await saveCalendarDayNote(iso, { notes: "Temporary note for clear test" });
      await saveCalendarDayNote(iso, { notes: "   \n\t  " });
    }, date);
    const cleared = await page.evaluate((iso) => {
      const api = getScheduleApi();
      const doc = scheduleDocCache || api.readCache(scheduleApiEmail());
      const note = (doc.items || []).find((item) => item.type === "day_note" && item.startDate === iso);
      return {
        exists: Boolean(note),
        notes: note?.notes || "",
      };
    }, date);
    assert.equal(cleared.exists, false, "whitespace-only note should be removed");
    assert.equal(cleared.notes, "");
  });

  // Mobile viewport downloads
  const mobile = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
  const mobilePage = await mobile.newPage();
  await loginAs(mobilePage, FREE_USER);
  await caseLog("Mobile viewport downloads Farm Animals PDFs", async () => {
    await mobilePage.evaluate(async (id) => { await openResourceViewer(id); }, FARM_ID);
    await mobilePage.waitForSelector('[data-lesson-download-variant="week"]');
    const [weekFile] = await Promise.all([
      mobilePage.waitForEvent("download", { timeout: 20000 }),
      mobilePage.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]').first().click({ force: true }),
    ]);
    assert.match(weekFile.suggestedFilename(), /teacher-weekly-planner\.pdf$/i);
    const [fullFile] = await Promise.all([
      mobilePage.waitForEvent("download", { timeout: 20000 }),
      mobilePage.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="full"]').first().click({ force: true }),
    ]);
    assert.match(fullFile.suggestedFilename(), /full-lesson-plan\.pdf$/i);
  });

  // Entitlement matrix (resolve path; Free plan Farm Animals must work for Free)
  const entitlements = [
    { email: FREE_USER, label: "Free" },
    { email: PRO_USER, label: "Pro" },
  ];
  for (const row of entitlements) {
    await caseLog(`${row.label} can hydrate/assign Farm Animals content`, async () => {
      const ctx = await browser.newContext({ serviceWorkers: "block" });
      const p = await ctx.newPage();
      await loginAs(p, row.email);
      const total = await p.evaluate(async ({ id, weekStart }) => {
        const resolved = await resolveCurriculumPlanForAssignment(id, { weekStartDate: weekStart });
        return countCurriculumSnapshotActivities(buildCurriculumLessonPlanSnapshot(resolved.plan));
      }, { id: FARM_ID, weekStart: mondayIso(1) });
      assert.equal(total, 15);
      await ctx.close();
    });
  }

  await browser.close();
  return results;
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${FARM_ID}`);
    assert.equal(detail.status, 200, "Farm Animals detail endpoint");
    const counts = countSnapshot(detail.json.lessonPlan);
    assert.equal(counts.total, 15, `Farm Animals detail should include 15 activities, got ${counts.total}`);

    // Static guardrails
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    assert.match(appJs, /function showToast\(/);
    assert.match(appJs, /curriculumPlanHasAssignableDayItems/);
    assert.match(appJs, /assertAssignableCurriculumSnapshot/);
    assert.match(appJs, /Preparing download/);
    assert.doesNotMatch(
      appJs,
      /if \(!isCuratedFreeCurriculumPlan\(resource\) && String\(resource\.plan/,
    );

    await runBrowserSuite();
    console.log("ALL calendar-assign-download-blockers checks passed");
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
