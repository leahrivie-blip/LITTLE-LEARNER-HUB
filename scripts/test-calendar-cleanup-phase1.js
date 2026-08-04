#!/usr/bin/env node
/**
 * Phase 1 — Calendar assignment cleanup (remove / clear week / no orphans).
 * Does not modify curriculum content.
 * Run: npm run test:calendar-cleanup-phase1
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19910 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-cal-cleanup-${crypto.randomBytes(4).toString("hex")}.json`);
const USER = "cal-cleanup-pro@example.com";
const FARM_ID = "cur-lp-preschool-farm-animals";
const ART = "/opt/cursor/artifacts/site-stabilization";

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [USER]: {
        email: USER,
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
      },
    },
    siteContent: {},
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LOCAL_JSON_PATH: STORE_PATH,
      CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(child, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appSource, /function finalizeCalendarLessonRemoval/);
  assert.match(appSource, /function clearCalendarWeekLesson/);
  assert.match(appSource, /data-calendar-clear-week/);
  assert.match(appSource, /data-calendar-remove-lesson/);
  assert.match(appSource, /dualWriteLegacyAssignmentsFromSchedule\(scheduleDocCache\)/);

  const child = startServer();
  let browser;
  const results = [];
  const pass = (name) => { results.push({ name, ok: true }); console.log(`PASS  ${name}`); };
  try {
    await waitForHealth(child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof window.getScheduleApi === "function" && typeof window.deleteCalendarItem === "function", null, { timeout: 60000 }).catch(async () => {
      // deleteCalendarItem may not be on window — expose via evaluate of function existence in page scripts
    });
    await page.waitForFunction(() => typeof getScheduleApi === "function" && typeof ensureScheduleLoaded === "function", null, { timeout: 60000 });

    // Sign in as Pro user (same pattern as assign-download blockers)
    await page.evaluate((email) => {
      const users = JSON.parse(localStorage.getItem("llhUsers") || "{}");
      users[email] = {
        email,
        password: "TestPass123!",
        plan: "Pro",
        name: "Cal Cleanup",
        subscriptionStatus: "Pro Monthly Subscription Active",
      };
      localStorage.setItem("llhUsers", JSON.stringify(users));
      localStorage.setItem("llhCurrentUser", email);
      localStorage.setItem("currentUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
          firstName: "Cal",
          lastName: "Cleanup",
        },
      }));
    }, USER);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof getScheduleApi === "function", null, { timeout: 60000 });
    await page.evaluate(async (email) => {
      currentUser = email;
      if (typeof updateAuthUI === "function") updateAuthUI();
      if (typeof updatePlanLabel === "function") updatePlanLabel();
      if (typeof ensureCurriculumLoaded === "function") await ensureCurriculumLoaded().catch(() => {});
      if (typeof ensureScheduleLoaded === "function") await ensureScheduleLoaded({ force: true }).catch(() => {});
    }, USER);
    await page.waitForTimeout(500);

    const week = await page.evaluate(() => {
      const api = getScheduleApi();
      return api.weekStartMonday(new Date().toISOString().slice(0, 10));
    });

    // Assign Farm Animals
    await page.evaluate(async ({ planId, weekStart }) => {
      await ensureScheduleLoaded({ force: true });
      if (typeof assignScheduleLessonPlan !== "function") throw new Error("assignScheduleLessonPlan missing");
      await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: weekStart, replaceExisting: true });
    }, { planId: FARM_ID, weekStart: week });
    await page.waitForTimeout(600);

    const afterAssign = await page.evaluate(async (weekStart) => {
      await ensureScheduleLoaded({ force: true });
      const api = getScheduleApi();
      const doc = scheduleDocCache || api.readCache(scheduleApiEmail());
      const lesson = api.lessonForWeek(doc, weekStart);
      const legacy = JSON.parse(localStorage.getItem(`llhCurriculumAssignments:${scheduleApiEmail()}`) || localStorage.getItem("llhCurriculumAssignments") || "[]");
      const planner = JSON.parse(localStorage.getItem("llhWeeklyPlanner") || "{}");
      return {
        hasLesson: !!lesson,
        activityCount: Object.values(lesson?.snapshot?.dailyPlans || {}).reduce((n, d) => n + (d.items?.length || 0), 0),
        legacyCount: Array.isArray(legacy) ? legacy.filter((a) => a.weekStartDate === weekStart).length : 0,
        plannerResource: planner.resourceId || "",
        lessonId: lesson?.id || "",
      };
    }, week);
    assert.ok(afterAssign.hasLesson, "lesson assigned");
    assert.equal(afterAssign.activityCount, 15, "15 activities in snapshot");
    pass("assign Farm Animals with 15 activities");

    // UI: week view shows Remove + Clear Week
    await page.evaluate((weekStart) => {
      mainCalendarSelectedWeek = weekStart;
      mainCalendarSubView = "week";
      if (typeof setView === "function") setView("calendar", { weekStartDate: weekStart });
      if (typeof renderMainCalendar === "function") renderMainCalendar();
    }, week);
    await page.waitForTimeout(600);
    const ui = await page.evaluate(() => ({
      remove: !!document.querySelector("[data-calendar-remove-lesson]"),
      clear: !!document.querySelector("[data-calendar-clear-week]"),
      htmlHasLesson: /Farm Animals/i.test(document.body.innerText || ""),
      subView: typeof mainCalendarSubView !== "undefined" ? mainCalendarSubView : null,
    }));
    assert.ok(ui.remove || ui.clear, `Remove/Clear controls present (remove=${ui.remove}, clear=${ui.clear}, subView=${ui.subView}, hasFarm=${ui.htmlHasLesson})`);
    assert.ok(ui.remove, "Remove from Calendar control present");
    assert.ok(ui.clear, "Clear Week control present");
    pass("week view exposes Remove and Clear Week");

    // Remove via deleteCalendarItem (with confirm stubbed)
    await page.evaluate(async (itemId) => {
      window.confirmAction = async () => true;
      const ok = await deleteCalendarItem(itemId);
      if (!ok) throw new Error("deleteCalendarItem returned false");
    }, afterAssign.lessonId);
    await page.waitForTimeout(400);

    const afterRemove = await page.evaluate(async (weekStart) => {
      await ensureScheduleLoaded({ force: true });
      const api = getScheduleApi();
      const doc = scheduleDocCache || api.readCache(scheduleApiEmail());
      const lesson = api.lessonForWeek(doc, weekStart);
      const legacyRaw = localStorage.getItem(`llhCurriculumAssignments:${scheduleApiEmail()}`)
        || localStorage.getItem("llhCurriculumAssignments")
        || "[]";
      const legacy = JSON.parse(legacyRaw);
      const planner = JSON.parse(localStorage.getItem("llhWeeklyPlanner") || "{}");
      const assigned = typeof lessonPlanIsAssigned === "function"
        ? lessonPlanIsAssigned("cur-lp-preschool-farm-animals")
        : null;
      return {
        hasLesson: !!lesson,
        legacyForWeek: Array.isArray(legacy) ? legacy.filter((a) => a.weekStartDate === weekStart).length : -1,
        plannerResource: planner.resourceId || "",
        plannerActivitySample: planner.days?.Monday?.activity || planner.days?.monday?.activity || "",
        lessonPlanIsAssigned: assigned,
      };
    }, week);
    assert.equal(afterRemove.hasLesson, false, "schedule lesson gone");
    assert.equal(afterRemove.legacyForWeek, 0, "legacy assignment cleared for week");
    assert.equal(afterRemove.plannerResource, "", "weekly planner resource cleared");
    pass("remove clears schedule + legacy + planner");

    // Reassign then Clear Week
    await page.evaluate(async ({ planId, weekStart }) => {
      await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: weekStart, replaceExisting: true });
    }, { planId: FARM_ID, weekStart: week });
    await page.waitForTimeout(400);
    await page.evaluate(async (weekStart) => {
      window.confirmAction = async () => true;
      const ok = await clearCalendarWeekLesson(weekStart, { skipConfirm: true });
      if (!ok) throw new Error("clearCalendarWeekLesson failed");
    }, week);
    await page.waitForTimeout(400);
    const afterClear = await page.evaluate(async (weekStart) => {
      await ensureScheduleLoaded({ force: true });
      const api = getScheduleApi();
      const doc = scheduleDocCache || api.readCache(scheduleApiEmail());
      const lesson = api.lessonForWeek(doc, weekStart);
      const items = (doc.items || []).filter((i) => i.weekStartDate === weekStart && i.type === "lesson_plan");
      return { hasLesson: !!lesson, lessonPlanCount: items.length };
    }, week);
    assert.equal(afterClear.hasLesson, false);
    assert.equal(afterClear.lessonPlanCount, 0);
    pass("clear week removes lesson without leaving duplicates");

    // Assign → remove → reassign repeatedly (no duplication)
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(async ({ planId, weekStart }) => {
        window.confirmAction = async () => true;
        await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: weekStart, replaceExisting: true });
        const api = getScheduleApi();
        await ensureScheduleLoaded({ force: true });
        let doc = scheduleDocCache || api.readCache(scheduleApiEmail());
        let lesson = api.lessonForWeek(doc, weekStart);
        if (!lesson) throw new Error("assign failed in loop");
        await deleteCalendarItem(lesson.id, { skipConfirm: true });
        await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: weekStart, replaceExisting: true });
        doc = scheduleDocCache || api.readCache(scheduleApiEmail());
        const lessons = (doc.items || []).filter((item) => item.type === "lesson_plan" && item.weekStartDate === weekStart);
        if (lessons.length !== 1) throw new Error(`expected 1 lesson, got ${lessons.length}`);
      }, { planId: FARM_ID, weekStart: week });
    }
    pass("assign → remove → reassign x3 leaves exactly one lesson");

    // Source curriculum unchanged
    const sourceActs = await page.evaluate(async (id) => {
      const detail = await fetchAuthorizedCurriculumLessonPlan(id);
      const plan = detail.lessonPlan || {};
      let n = 0;
      Object.values(plan.dailyPlans || {}).forEach((day) => { n += (day.items || []).length; });
      return n || (detail.activities || []).length;
    }, FARM_ID).catch(async () => page.evaluate(async (id) => {
      const res = await fetch(`/api/curriculum/lesson-plans/${id}`);
      const json = await res.json();
      const plan = json.lessonPlan || json;
      let n = 0;
      Object.values(plan.dailyPlans || {}).forEach((day) => { n += (day.items || []).length; });
      return n;
    }, FARM_ID));
    assert.ok(sourceActs >= 15 || sourceActs === 15, `source activities intact (${sourceActs})`);
    pass("source Farm Animals curriculum unchanged");

    fs.writeFileSync(path.join(ART, "phase1-calendar-cleanup.json"), JSON.stringify({
      ok: true,
      results,
      week,
      at: new Date().toISOString(),
    }, null, 2));
    console.log(`\n${results.length}/${results.length} checks passed`);
  } catch (error) {
    console.error("FAIL", error.message);
    fs.writeFileSync(path.join(ART, "phase1-calendar-cleanup-error.json"), JSON.stringify({
      error: error.message,
      stack: error.stack,
      results,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch (_e) { /* ignore */ }
  }
}

main();
