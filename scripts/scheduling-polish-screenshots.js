#!/usr/bin/env node
/**
 * Scheduling Phase 1 polish screenshot capture.
 * Run: node scripts/scheduling-polish-screenshots.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = "/opt/cursor/artifacts/scheduling-polish-audit";
const DOCS_DIR = path.join(ROOT, "docs/scheduling-polish-audit");
const PORT = 19950 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-polish-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "polish-audit-admin@test.local",
  password: "polish-audit-pass",
  code: "polish-audit-code",
};
const USER_EMAIL = "polish-audit-teacher@example.com";
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");

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

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, scheduleByUser: {} }, null, 2));
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
  for (let i = 0; i < 90; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  if (child.exitCode === null) child.kill("SIGKILL");
}

function mondayIso(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

async function seedPublishedLesson(token, { plan = "Free", title } = {}) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  if (!parsed.ok) throw new Error(`Parse failed: ${(parsed.errors || []).join("; ")}`);
  const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const id = `cur-lp-polish-${crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: site.json.siteContent?.updatedAt || "",
    lessonPlan: {
      ...parsed.data,
      id,
      title: title || `Polish ${id}`,
      plan,
      status: "published",
    },
  });
  if (save.status !== 200) throw new Error(`Seed failed: ${save.status} ${save.text}`);
  return save.json.lessonPlan;
}

async function loginAsTeacher(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate((email) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
    localStorage.removeItem(`llhCurriculumAssignments:${email}`);
    localStorage.removeItem(`llhScheduleItems:${email}`);
    localStorage.removeItem(`llhScheduleMigrated:${email}`);
    localStorage.removeItem("llhWeeklyPlanner");
  }, USER_EMAIL);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => {}),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function" && typeof assignScheduleLessonPlan === "function", null, { timeout: 30000 });
}

async function shot(page, name, selector) {
  const target = selector ? page.locator(selector).first() : page;
  const file = path.join(OUT_DIR, `${name}.png`);
  await target.screenshot({ path: file });
  return file;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = login.json.token || login.json.adminToken;
    const free = await seedPublishedLesson(token, { plan: "Free", title: "Garden Scientists Polish Week" });
    const weekStart = mondayIso();
    const playwright = require("playwright");
    browser = await playwright.chromium.launch({ headless: true });

    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await loginAsTeacher(desktop);
    await desktop.evaluate(() => setView("calendar"));
    await desktop.waitForTimeout(600);
    await shot(desktop, "10-desktop-calendar-empty", "#view-calendar");

    await desktop.evaluate(async ({ planId, week }) => {
      await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: week, ageGroup: "Preschool", replaceExisting: true });
    }, { planId: free.id, week: weekStart });

    for (const [view, name] of [
      ["home", "01-desktop-dashboard"],
      ["calendar", "02-desktop-calendar"],
      ["planner", "03-desktop-weekly-planner"],
    ]) {
      await desktop.evaluate((v) => setView(v), view);
      await desktop.waitForTimeout(700);
      await shot(desktop, name, `#view-${view}`);
    }
    await desktop.evaluate(() => setView("calendar"));
    await desktop.waitForTimeout(400);
    await desktop.click("[data-calendar-add-item]");
    await desktop.waitForTimeout(300);
    await shot(desktop, "11-desktop-add-event-modal", "#scheduleEventModal");
    await desktop.click("[data-close-schedule-event-modal]");

    for (const [key, width, height] of [
      ["iphone", 390, 844],
      ["android", 412, 915],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      await loginAsTeacher(page);
      await page.evaluate(async ({ planId, week }) => {
        await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: week, ageGroup: "Preschool", replaceExisting: true });
      }, { planId: free.id, week: weekStart });
      const names = key === "iphone"
        ? [["home", "04-iphone-dashboard"], ["calendar", "05-iphone-calendar"], ["planner", "06-iphone-weekly-planner"]]
        : [["home", "07-android-dashboard"], ["calendar", "08-android-calendar"], ["planner", "09-android-weekly-planner"]];
      for (const [view, name] of names) {
        await page.evaluate((v) => setView(v), view);
        await page.waitForTimeout(700);
        await shot(page, name, `#view-${view}`);
      }
      await page.close();
    }

    for (const file of fs.readdirSync(OUT_DIR)) {
      if (file.endsWith(".png")) {
        fs.copyFileSync(path.join(OUT_DIR, file), path.join(DOCS_DIR, file));
      }
    }
    fs.copyFileSync(
      path.join(ROOT, "docs/SCHEDULING_POLISH_AUDIT.md"),
      path.join(OUT_DIR, "SCHEDULING_POLISH_AUDIT.md"),
    );
    console.log(`Polish screenshots written: ${fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".png")).length}`);
    console.log(`Docs: ${DOCS_DIR}`);
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
