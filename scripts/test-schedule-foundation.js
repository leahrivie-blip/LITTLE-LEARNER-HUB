#!/usr/bin/env node
/**
 * ScheduleItem foundation — cloud API + migration + client wiring checks.
 * Run: npm run test:schedule-foundation
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const scheduleLib = require("../server/schedule-lib.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19810 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-schedule-${crypto.randomBytes(4).toString("hex")}.json`);
const EMAIL = "schedule-teacher@example.com";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
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

function authHeaders() {
  return { Authorization: `Bearer test:${EMAIL}`, "X-LLH-User-Email": EMAIL };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, scheduleByUser: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
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
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function staticChecks() {
  console.log("1) Static wiring");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tokens = fs.readFileSync(path.join(ROOT, "styles/llh-design-tokens.css"), "utf8");
  [
    'data-view="calendar"',
    'id="view-calendar"',
    'id="mainCalendarApp"',
    "scripts/llh-schedule.js",
    "styles/llh-design-tokens.css",
  ].forEach((needle) => assert(indexHtml.includes(needle), `Missing index.html: ${needle}`));
  [
    "assignScheduleLessonPlan",
    "renderMainCalendar",
    "ensureScheduleLoaded",
    "dualWriteLegacyAssignmentsFromSchedule",
    "LLHSchedule",
  ].forEach((needle) => assert(appJs.includes(needle), `Missing app.js: ${needle}`));
  assert(fs.existsSync(path.join(ROOT, "scripts/llh-schedule.js")), "Missing scripts/llh-schedule.js");
  assert(fs.existsSync(path.join(ROOT, "server/schedule-lib.js")), "Missing server/schedule-lib.js");
  assert(tokens.includes("--llh-primary"), "Design tokens missing primary");
  console.log("   OK");
}

function unitChecks() {
  console.log("2) schedule-lib unit checks");
  const week = mondayIso();
  const migrated = scheduleLib.migrateCurriculumAssignmentsToSchedule({
    classroomLabel: "Preschool Room",
    curriculumAssignments: [{
      id: "cwa-test",
      weekStartDate: week,
      lessonPlanId: "lp-1",
      lessonPlanTitle: "Community Helpers",
      lessonPlanPlan: "Free",
      ageGroup: "Preschool",
      snapshot: { title: "Community Helpers", theme: "Helpers", dailyPlans: {} },
      teacherNotes: "Private note",
      parentCalendar: {
        parentMessage: "Hello families",
        classroomEvents: [{ id: "cce-1", title: "Picture Day", eventType: "Picture Day", date: week }],
      },
    }],
  });
  assert(migrated.classrooms[0].name === "Preschool Room", "Classroom name preserved");
  const lesson = migrated.items.find((item) => item.type === "lesson_plan");
  assert(lesson?.lessonPlanTitle === "Community Helpers", "Lesson migrated");
  assert(lesson.execution.teacherNotes === "Private note", "Teacher notes migrated");
  assert(migrated.items.some((item) => item.type === "classroom_event"), "Event migrated");
  const upserted = scheduleLib.upsertScheduleItem(migrated, {
    type: "reminder",
    title: "Water bottles",
    startDate: week,
    endDate: week,
    weekStartDate: week,
  });
  assert(upserted.doc.items.some((item) => item.type === "reminder"), "Reminder upserted");
  console.log("   OK");
}

async function apiChecks() {
  console.log("3) Cloud ScheduleItem API");
  const week = mondayIso();
  const unauthorized = await requestJson("GET", "/api/schedule");
  assert(unauthorized.status === 401, "Unauthenticated schedule GET should 401");

  const migrate = await requestJson("POST", "/api/schedule/migrate", {
    curriculumAssignments: [{
      id: "cwa-api",
      weekStartDate: week,
      lessonPlanId: "lp-api",
      lessonPlanTitle: "Transportation",
      ageGroup: "Preschool",
      snapshot: { title: "Transportation" },
      teacherNotes: "Bus week",
    }],
    classroomLabel: "Main Classroom",
  }, authHeaders());
  assert(migrate.status === 200, `Migrate failed: ${migrate.status} ${migrate.text}`);
  assert(migrate.json.itemCount >= 1, "Migrate should create items");

  const got = await requestJson("GET", `/api/schedule?from=${week}&to=${week}`, null, authHeaders());
  assert(got.status === 200, "GET schedule failed");
  assert(got.json.items.some((item) => item.lessonPlanTitle === "Transportation"), "Migrated lesson missing");

  const assign = await requestJson("PUT", `/api/schedule/weeks/${week}`, {
    lessonPlanId: "lp-api-2",
    lessonPlanTitle: "Community Helpers",
    ageGroup: "Preschool",
    snapshot: { title: "Community Helpers", theme: "Helpers" },
  }, authHeaders());
  assert(assign.status === 200, `Week assign failed: ${assign.text}`);
  assert(assign.json.item.lessonPlanTitle === "Community Helpers", "Assign title mismatch");

  const after = await requestJson("GET", "/api/schedule?types=lesson_plan", null, authHeaders());
  const lessons = after.json.items.filter((item) => item.weekStartDate === week && item.type === "lesson_plan");
  assert(lessons.length === 1, "One lesson_plan per week");
  assert(lessons[0].lessonPlanTitle === "Community Helpers", "Latest assign wins");

  const reminder = await requestJson("PUT", "/api/schedule/items/sch-reminder-1", {
    id: "sch-reminder-1",
    type: "reminder",
    title: "Bring water bottles",
    startDate: week,
    endDate: week,
    weekStartDate: week,
  }, authHeaders());
  assert(reminder.status === 200, "Reminder upsert failed");

  const filtered = await requestJson("GET", `/api/schedule?types=reminder&from=${week}&to=${week}`, null, authHeaders());
  assert(filtered.json.items.every((item) => item.type === "reminder"), "Type filter failed");
  console.log("   OK");
}

async function main() {
  staticChecks();
  unitChecks();
  const child = startServer();
  try {
    await waitForBoot(child);
    await apiChecks();
    console.log("\nSchedule foundation tests passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nSchedule foundation tests failed:", error.message);
  process.exit(1);
});
