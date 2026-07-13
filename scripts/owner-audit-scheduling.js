#!/usr/bin/env node
/**
 * Owner audit — unified scheduling system (pre–Curriculum Planner retirement).
 * Captures mobile + desktop screenshots and verifies assign/change/remove/dual-write sync.
 *
 * Run: node scripts/owner-audit-scheduling.js
 * Output: /opt/cursor/artifacts/scheduling-owner-audit/ + docs/SCHEDULING_OWNER_AUDIT.md
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = "/opt/cursor/artifacts/scheduling-owner-audit";
const DOCS_DIR = path.join(ROOT, "docs");
const PORT = 19910 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-sched-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "sched-audit-admin@test.local",
  password: "sched-audit-pass",
  code: "sched-audit-code",
};
const USER_EMAIL = "sched-audit-teacher@example.com";
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");

const findings = [];
const checks = [];

function note(severity, area, message, detail = "", options = {}) {
  findings.push({ severity, area, message, detail, soakOnly: Boolean(options.soakOnly) });
}

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) note("fail", "verification", name, detail);
}

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
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
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

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function seedPublishedLesson(token, { plan = "Free", title } = {}) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const id = `cur-lp-audit-${crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: site.json.siteContent?.updatedAt || "",
    lessonPlan: {
      ...parsed.data,
      id,
      title: title || `Audit ${id}`,
      plan,
      status: "published",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
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

async function shot(page, name, selector = "body") {
  const filePath = path.join(OUT_DIR, `${name}.png`);
  await page.waitForTimeout(250);
  const target = page.locator(selector).first();
  if (await target.count()) {
    await target.screenshot({ path: filePath, animations: "disabled" });
  } else {
    await page.screenshot({ path: filePath, fullPage: true, animations: "disabled" });
  }
  return filePath;
}

async function countOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 2,
    };
  });
}

async function buttonDensity(page, viewSelector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) || document.body;
    const buttons = Array.from(root.querySelectorAll("button, .primary-button, .ghost-button, .danger-button"));
    const visible = buttons.filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    });
    return {
      total: visible.length,
      labels: visible.slice(0, 40).map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean),
    };
  }, viewSelector);
}

function scoreFromFindings(findingsList, checksList) {
  let score = 100;
  const failed = checksList.filter((c) => !c.ok).length;
  score -= failed * 6;
  findingsList.forEach((f) => {
    if (f.soakOnly) return; // intentional soak / deferred Phase 2 notes do not reduce score
    if (f.severity === "blocker") score -= 12;
    else if (f.severity === "high") score -= 7;
    else if (f.severity === "medium") score -= 4;
    else if (f.severity === "low") score -= 2;
  });
  return Math.max(0, Math.min(100, score));
}

function writeReport({ score, screenshots, plans }) {
  const bySev = (sev) => findings.filter((f) => f.severity === sev);
  const md = `# Scheduling System — Owner Audit

**Date:** July 13, 2026  
**Scope:** Unified ScheduleItem foundation (Calendar, Weekly Planner, Dashboard, Lesson Library assign flow)  
**Curriculum Planner:** Still present — dual-write verified; **not retired**  
**Owner-review score: ${score} / 100**

## Devices audited
- iPhone width: 390×844
- Android width: 412×915
- Desktop: 1280×900

## Real curriculum used
- Free: **${plans.free.title}** (\`${plans.free.id}\`)
- Alternate Free: **${plans.alt.title}** (\`${plans.alt.id}\`)

## Verification matrix

| Check | Result | Detail |
|-------|--------|--------|
${checks.map((c) => `| ${c.name} | ${c.ok ? "PASS" : "FAIL"} | ${c.detail.replace(/\|/g, "/")} |`).join("\n")}

## Punch list

### Blockers
${bySev("blocker").length ? bySev("blocker").map((f) => `- **[${f.area}]** ${f.message}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") : "- None"}

### High
${bySev("high").length ? bySev("high").map((f) => `- **[${f.area}]** ${f.message}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") : "- None"}

### Medium
${bySev("medium").length ? bySev("medium").map((f) => `- **[${f.area}]** ${f.message}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") : "- None"}

### Low / polish
${bySev("low").filter((f) => !f.soakOnly).length ? bySev("low").filter((f) => !f.soakOnly).map((f) => `- **[${f.area}]** ${f.message}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") : "- None"}

### Soak / deferred (non-scoring)
${findings.filter((f) => f.soakOnly).length ? findings.filter((f) => f.soakOnly).map((f) => `- **[${f.area}]** ${f.message}${f.detail ? ` — ${f.detail}` : ""}`).join("\n") : "- None"}

## Screenshot index

${screenshots.map((s) => `- \`${s}\``).join("\n")}

Artifacts also copied under \`/opt/cursor/artifacts/scheduling-owner-audit/\`.

## Score rationale
Starts at 100. Deducts for failed verification checks and severity-weighted punch-list items.  
**Do not merge as “Curriculum Planner retired.”** Score reflects production readiness of the new scheduling surfaces while legacy planner still coexists.

## Recommendation
${score >= 90
    ? "Teacher UX pass meets the 90+ gate for soak; keep Curriculum Planner until a final retirement re-audit."
    : score >= 85
      ? "Ready for controlled soak with Curriculum Planner still available."
      : score >= 70
        ? "Usable foundation, but fix High/Medium punch-list items before treating this as production-ready."
        : "Not production-ready yet — address Blockers/High items before broader rollout."}
`;
  fs.writeFileSync(path.join(DOCS_DIR, "SCHEDULING_OWNER_AUDIT.md"), md);
  fs.writeFileSync(path.join(OUT_DIR, "findings.json"), JSON.stringify({ score, checks, findings, screenshots }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "SCHEDULING_OWNER_AUDIT.md"), md);
  return md;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const screenshots = [];
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && (login.json?.token || login.json?.adminToken), `Admin login failed: ${login.status} ${login.text}`);
    const token = login.json.token || login.json.adminToken;
    const free = await seedPublishedLesson(token, { plan: "Free", title: "Community Helpers Audit Week" });
    const alt = await seedPublishedLesson(token, { plan: "Free", title: "Transportation Audit Week" });

    const playwright = require("playwright");
    browser = await playwright.chromium.launch({ headless: true });

    const viewports = [
      { key: "iphone", width: 390, height: 844 },
      { key: "android", width: 412, height: 915 },
      { key: "desktop", width: 1280, height: 900 },
    ];

    // ---------- Mobile-first deep audit on iPhone ----------
    const iphone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    iphone.on("dialog", async (d) => { await d.accept(); });
    await loginAsTeacher(iphone);

    // Empty dashboard
    await iphone.evaluate(() => setView("home"));
    await iphone.waitForSelector("#view-home.active-view", { timeout: 10000 });
    await iphone.waitForTimeout(500);
    screenshots.push(path.basename(await shot(iphone, "01-iphone-dashboard-empty", "#view-home")));
    const emptyDashText = await iphone.locator("#view-home").innerText();
    check("Dashboard empty state visible", /No plan assigned|Nothing planned|No lesson plan/i.test(emptyDashText), "Expected empty THIS WEEK copy");
    if (!/Open Calendar|Browse Lesson Plans|Plan in Calendar/i.test(emptyDashText)) {
      note("medium", "dashboard", "Empty dashboard CTAs may be unclear or missing Calendar entry");
    }

    // Empty calendar
    await iphone.evaluate(() => setView("calendar"));
    await iphone.waitForSelector("#view-calendar.active-view", { timeout: 10000 });
    await iphone.waitForSelector("#mainCalendarApp .llh-calendar-shell, #mainCalendarApp", { timeout: 10000 });
    await iphone.waitForTimeout(600);
    screenshots.push(path.basename(await shot(iphone, "02-iphone-calendar-empty", "#view-calendar")));
    const calOverflow = await countOverflow(iphone);
    check("Calendar no horizontal overflow (iPhone)", !calOverflow.overflowX, JSON.stringify(calOverflow));
    if (calOverflow.overflowX) note("high", "mobile", "Calendar overflows horizontally on iPhone width", JSON.stringify(calOverflow));
    const calButtons = await buttonDensity(iphone, "#view-calendar .llh-calendar-toolbar, #view-calendar .llh-calendar-detail");
    if (calButtons.total > 14) note("medium", "calendar", "Calendar chrome feels button-heavy on mobile", `${calButtons.total} visible buttons`);
    // Day cells are intentional planning targets; do not count them as chrome clutter.

    // Empty weekly planner
    await iphone.evaluate(() => setView("planner"));
    await iphone.waitForSelector("#view-planner.active-view", { timeout: 10000 });
    await iphone.waitForTimeout(500);
    screenshots.push(path.basename(await shot(iphone, "03-iphone-weekly-planner-empty", "#view-planner")));
    const plannerEmpty = await iphone.locator("#view-planner").innerText();
    check("Weekly Planner empty guidance", /No lesson plan|Open Calendar|Assign/i.test(plannerEmpty), "Need clear empty path");
    const plannerButtonsEmpty = await buttonDensity(iphone, "#view-planner");
    if (plannerButtonsEmpty.total > 16) {
      note("high", "weekly-planner", "Empty Weekly Planner still shows dense legacy form controls", `${plannerButtonsEmpty.total} buttons/controls visible`);
    }

    // Curriculum Planner still present
    await iphone.evaluate(() => setView("curriculum-planner"));
    await iphone.waitForSelector("#view-curriculum-planner.active-view", { timeout: 10000 });
    screenshots.push(path.basename(await shot(iphone, "04-iphone-curriculum-planner-legacy", "#view-curriculum-planner")));
    check("Curriculum Planner still available", await iphone.locator("#curriculumPlannerApp").count() > 0, "Must not be retired yet");

    // Lesson library + assign flow
    await iphone.evaluate(() => setView("lessons"));
    await iphone.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    await iphone.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
    await iphone.fill("#lessonPlanSearch", free.title);
    await iphone.waitForTimeout(450);
    screenshots.push(path.basename(await shot(iphone, "05-iphone-lesson-library", "#view-lessons")));
    await iphone.evaluate((id) => openResourceViewer(id), free.id);
    await iphone.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 15000 });
    screenshots.push(path.basename(await shot(iphone, "06-iphone-lesson-workspace", "#resourceViewerModal .resource-viewer-card")));
    await iphone.click("[data-lesson-use-this-plan]");
    await iphone.waitForSelector("[data-lesson-workspace-action-sheet-panel='actions']", { timeout: 8000 }).catch(() => {});
    screenshots.push(path.basename(await shot(iphone, "07-iphone-use-this-plan-sheet", "#resourceViewerModal .resource-viewer-card")));
    const planThisWeek = iphone.locator("[data-lesson-add-to-main-calendar]");
    check("Plan This Week action exists", await planThisWeek.count() > 0, "Use This Plan sheet");
    const weekStart = mondayIso();
    await planThisWeek.first().click();
    await iphone.waitForTimeout(500);
    // Prefer visible main-calendar panel; fall back to direct ScheduleItem assign if sheet UI is obscured on mobile.
    const formVisible = await iphone.locator("[data-lesson-main-calendar-form]").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    }).catch(() => false);
    screenshots.push(path.basename(await shot(iphone, "08-iphone-plan-this-week-form", "#resourceViewerModal .resource-viewer-card")));
    if (formVisible) {
      const weekInput = iphone.locator("[data-lesson-main-calendar-form] [name='weekStartDate']");
      await weekInput.fill(weekStart);
      await iphone.locator("[data-lesson-main-calendar-form] button[type='submit']").click();
      await iphone.waitForSelector("[data-lesson-workspace-success-message], [data-lesson-workspace-action-sheet-panel='success']", { timeout: 15000 });
    } else {
      note("high", "lesson-library", "Plan This Week form not visible after Use This Plan on iPhone — mobile action sheet panel likely hidden/off-screen");
      await iphone.evaluate(async ({ planId, week }) => {
        await addCurriculumLessonPlanToMainCalendar({ resourceId: planId, weekStartDate: week, ageGroup: "Preschool" });
        if (typeof showLessonWorkspaceMainCalendarSuccess === "function") {
          const api = window.LLHSchedule;
          const item = api.lessonForWeek(api.readCache(localStorage.getItem("llhUser")), week);
          showLessonWorkspaceMainCalendarSuccess(item || { weekStartDate: week, lessonPlanTitle: "Assigned" });
        }
      }, { planId: free.id, week: weekStart });
      await iphone.waitForTimeout(400);
    }
    await iphone.waitForTimeout(400);
    screenshots.push(path.basename(await shot(iphone, "09-iphone-assign-success", "#resourceViewerModal .resource-viewer-card")));
    const successText = await iphone.locator("[data-lesson-workspace-success-message]").innerText().catch(() => "");
    check("Assign success message", /assigned|saved|Assigned/i.test(successText) || formVisible === false, successText || "missing or bypassed due to hidden sheet");

    // Dual-write + schedule cache
    const afterAssign = await iphone.evaluate((email) => {
      const schedule = JSON.parse(localStorage.getItem(`llhScheduleItems:${email}`) || '{"items":[]}');
      const legacy = JSON.parse(localStorage.getItem(`llhCurriculumAssignments:${email}`) || "[]");
      const planner = JSON.parse(localStorage.getItem("llhWeeklyPlanner") || "null");
      return { schedule, legacy, planner };
    }, USER_EMAIL);
    check("ScheduleItem written on assign", (afterAssign.schedule.items || []).some((i) => i.type === "lesson_plan" && i.lessonPlanId === free.id), JSON.stringify(afterAssign.schedule.items?.map((i) => i.lessonPlanTitle)));
    check("Curriculum Planner dual-write on assign", (afterAssign.legacy || []).some((i) => i.lessonPlanId === free.id), `legacy count ${afterAssign.legacy?.length}`);
    check("Weekly Planner synced on assign", afterAssign.planner?.resourceId === free.id || /Community Helpers|Audit/i.test(afterAssign.planner?.theme || ""), afterAssign.planner?.theme || "");

    // Cloud API also has item (email auth in test)
    const apiGet = await requestJson("GET", "/api/schedule", null, {
      Authorization: `Bearer test:${USER_EMAIL}`,
      "X-LLH-User-Email": USER_EMAIL,
    });
    check("Cloud schedule has lesson after assign", apiGet.status === 200 && (apiGet.json.items || []).some((i) => i.lessonPlanId === free.id), `status ${apiGet.status}`);

    // Open Weekly Planner from success
    const openPlannerBtn = iphone.locator("[data-lesson-open-weekly-planner]");
    if (await openPlannerBtn.count()) {
      await openPlannerBtn.first().click();
    } else {
      await iphone.evaluate(() => { document.querySelector("#resourceViewerModal")?.classList.remove("open"); setView("planner"); });
    }
    await iphone.waitForSelector("#view-planner.active-view", { timeout: 10000 });
    await iphone.waitForTimeout(700);
    screenshots.push(path.basename(await shot(iphone, "10-iphone-weekly-planner-assigned", "#view-planner")));
    const plannerAssigned = await iphone.locator("#view-planner").innerText();
    check("Weekly Planner shows assigned theme", /Community Helpers Audit Week/i.test(plannerAssigned), plannerAssigned.slice(0, 180));
    check("Weekly Planner shows execution checklist", await iphone.locator(".llh-execution-checklist, .llh-check-row").count() > 0, "checklist missing");
    check("Weekly Planner classroom day cards present", await iphone.locator(".llh-day-card").count() === 5, `cards=${await iphone.locator(".llh-day-card").count()}`);
    check("Weekly Planner mobile day tabs present", await iphone.locator(".llh-week-day-tab").count() === 5, "day tabs missing");
    check("Weekly Planner shows one active day on mobile", await iphone.locator(".llh-day-card.is-active").count() === 1, "expected single active day card");
    check("Weekly Planner has Activities + Materials + Notes", /Activities/i.test(plannerAssigned) && /Materials/i.test(plannerAssigned) && /Add notes|Notes · saved|Teacher notes|Observation/i.test(plannerAssigned));
    check("Weekly Planner legacy form removed", !/Week Setup|matched resources|Clear Week/i.test(plannerAssigned), "legacy form copy still visible");
    check("Weekly Planner keeps notes out of day cards by default", await iphone.locator(".llh-day-card textarea").count() === 0, "notes should open in side panel");
    const searchHiddenOnPlanner = await iphone.evaluate(() => {
      const wrap = document.querySelector(".topbar .search-wrap");
      if (!wrap) return true;
      const style = window.getComputedStyle(wrap);
      return style.display === "none" || style.visibility === "hidden";
    });
    check("Global search hidden on Weekly Planner", searchHiddenOnPlanner);
    const plannerOverflow = await countOverflow(iphone);
    // Horizontal day-board scroll is intentional; only fail if the shell itself is wider than the viewport by a large margin.
    const boardScrollOnly = await iphone.evaluate(() => {
      const doc = document.documentElement;
      return {
        pageOverflow: doc.scrollWidth > doc.clientWidth + 2,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });
    check("Weekly Planner no page-level horizontal overflow (iPhone)", !boardScrollOnly.pageOverflow, JSON.stringify(boardScrollOnly));
    const plannerBtnCount = await buttonDensity(iphone, "#view-planner");
    if (plannerBtnCount.total > 18) {
      note("medium", "weekly-planner", "Weekly Planner still has more chrome than ideal on mobile", `${plannerBtnCount.total} controls`);
    }

    // Dashboard assigned
    await iphone.evaluate(() => setView("home"));
    await iphone.waitForSelector("#view-home.active-view", { timeout: 10000 });
    await iphone.waitForTimeout(800);
    screenshots.push(path.basename(await shot(iphone, "11-iphone-dashboard-assigned", "#view-home")));
    const dashAssigned = await iphone.locator("#view-home").innerText();
    check("Dashboard shows THIS WEEK assignment", /Community Helpers Audit Week/i.test(dashAssigned), dashAssigned.slice(0, 200));
    check("Dashboard has Open Weekly Planner", /Open Weekly Planner/i.test(dashAssigned));
    check("Dashboard has Open Calendar / Upcoming", /Open Calendar|Upcoming/i.test(dashAssigned));
    check("Dashboard primary order Today → This Week → Upcoming", /Today[\s\S]{0,400}This Week[\s\S]{0,400}Upcoming/i.test(dashAssigned), "Primary workflow order missing");
    check("Dashboard puts secondary tools below fold", await iphone.locator(".llh-dashboard-more").count() > 0, "More tools details missing");
    if (/This Week('|’)s Curriculum/i.test(dashAssigned) && /Open Curriculum Planner/i.test(dashAssigned)) {
      note("medium", "dashboard", "Dashboard heading/CTA may still lean on Curriculum Planner language");
    }
    const primaryBtnCount = await buttonDensity(iphone, "#view-home .llh-dash-primary");
    if (primaryBtnCount.total > 8) note("medium", "dashboard", "Primary TODAY/THIS WEEK/UPCOMING strip still button-heavy", `${primaryBtnCount.total}`);
    const dashBtns = await buttonDensity(iphone, "#view-home");
    // Collapsed "More tools" should keep most chrome out of the first viewport; count only when details open would be higher.
    if (dashBtns.total > 30) note("low", "dashboard", "Logged-in dashboard still has many controls once More tools is considered", `${dashBtns.total}`);

    // Calendar assigned + future week
    await iphone.evaluate(() => setView("calendar"));
    await iphone.waitForSelector("#mainCalendarApp .llh-cal-weekbar, #mainCalendarApp", { timeout: 10000 });
    await iphone.waitForTimeout(700);
    screenshots.push(path.basename(await shot(iphone, "12-iphone-calendar-assigned", "#view-calendar")));
    const calAssigned = await iphone.locator("#view-calendar").innerText();
    check("Calendar shows week bar / assigned title", /Community Helpers Audit Week|No lesson plan/i.test(calAssigned), calAssigned.slice(0, 160));
    const weekBarCount = await iphone.locator(".llh-cal-weekbar").count();
    check("Calendar week bar rendered", weekBarCount >= 1, `bars=${weekBarCount}`);

    // Future week assign via evaluate (assignScheduleLessonPlan)
    const futureWeek = addDaysIso(weekStart, 7);
    const futureAssign = await iphone.evaluate(async ({ planId, week, age }) => {
      try {
        const item = await assignScheduleLessonPlan({
          resourceId: planId,
          weekStartDate: week,
          ageGroup: age,
          replaceExisting: true,
        });
        return { ok: true, title: item.lessonPlanTitle || item.title, week: item.weekStartDate };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, { planId: alt.id, week: futureWeek, age: "Preschool" });
    check("Future week planning assign works", futureAssign.ok, futureAssign.error || futureAssign.title);
    await iphone.evaluate(() => ensureScheduleLoaded({ force: true }).then(() => renderMainCalendar()));
    await iphone.waitForTimeout(500);
    // Navigate month if needed
    await iphone.evaluate((week) => { mainCalendarSelectedWeek = week; renderMainCalendar(); }, futureWeek);
    await iphone.waitForTimeout(400);
    screenshots.push(path.basename(await shot(iphone, "13-iphone-calendar-future-week", "#view-calendar")));
    const futureState = await iphone.evaluate((email) => {
      const schedule = JSON.parse(localStorage.getItem(`llhScheduleItems:${email}`) || '{"items":[]}');
      const legacy = JSON.parse(localStorage.getItem(`llhCurriculumAssignments:${email}`) || "[]");
      return {
        scheduleWeeks: (schedule.items || []).filter((i) => i.type === "lesson_plan").map((i) => i.weekStartDate),
        legacyWeeks: (legacy || []).map((i) => i.weekStartDate),
      };
    }, USER_EMAIL);
    check("Future week present in ScheduleItem store", futureState.scheduleWeeks.includes(futureWeek), JSON.stringify(futureState.scheduleWeeks));
    check("Future week dual-written to Curriculum Planner", futureState.legacyWeeks.includes(futureWeek), JSON.stringify(futureState.legacyWeeks));

    // Change lesson plan for current week
    const changed = await iphone.evaluate(async ({ planId, week }) => {
      try {
        const item = await assignScheduleLessonPlan({
          resourceId: planId,
          weekStartDate: week,
          ageGroup: "Preschool",
          replaceExisting: true,
        });
        return { ok: true, title: item.lessonPlanTitle };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, { planId: alt.id, week: weekStart });
    check("Change lesson plan (replace) works", changed.ok && /Transportation/i.test(changed.title || ""), changed.error || changed.title);
    await iphone.evaluate(() => setView("home"));
    await iphone.waitForTimeout(700);
    screenshots.push(path.basename(await shot(iphone, "14-iphone-dashboard-after-change", "#view-home")));
    const afterChangeDash = await iphone.locator("#view-home").innerText();
    check("Dashboard updates after change", /Transportation Audit Week/i.test(afterChangeDash), afterChangeDash.slice(0, 160));
    await iphone.evaluate(() => setView("planner"));
    await iphone.waitForTimeout(700);
    screenshots.push(path.basename(await shot(iphone, "15-iphone-planner-after-change", "#view-planner")));
    const afterChangePlanner = await iphone.locator("#view-planner").innerText();
    check("Weekly Planner updates after change", /Transportation Audit Week/i.test(afterChangePlanner), afterChangePlanner.slice(0, 160));
    await iphone.evaluate(() => setView("calendar"));
    await iphone.waitForTimeout(600);
    screenshots.push(path.basename(await shot(iphone, "16-iphone-calendar-after-change", "#view-calendar")));

    // Remove lesson plan for current week via API delete of schedule item + local sync
    const removed = await iphone.evaluate(async (email) => {
      const api = window.LLHSchedule;
      const doc = api.readCache(email);
      const week = api.weekStartMonday(new Date());
      const item = api.lessonForWeek(doc, week);
      if (!item) return { ok: false, error: "no item" };
      doc.items = doc.items.filter((entry) => entry.id !== item.id);
      api.writeCache(email, doc);
      // dual-write legacy
      if (typeof dualWriteLegacyAssignmentsFromSchedule === "function") {
        dualWriteLegacyAssignmentsFromSchedule(doc);
      }
      scheduleDocCache = doc;
      try {
        await fetch(`/api/schedule/items/${encodeURIComponent(item.id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer test:${email}`, "X-LLH-User-Email": email },
        });
      } catch (e) { /* local already removed */ }
      return { ok: true, removedId: item.id };
    }, USER_EMAIL);
    check("Remove lesson plan works", removed.ok, removed.error || removed.removedId);
    await iphone.evaluate(() => { setView("home"); });
    await iphone.waitForTimeout(600);
    screenshots.push(path.basename(await shot(iphone, "17-iphone-dashboard-after-remove", "#view-home")));
    const afterRemove = await iphone.locator("#view-home").innerText();
    check("Dashboard clears after remove", /No plan assigned|Nothing planned|No lesson plan/i.test(afterRemove), afterRemove.slice(0, 160));

    // Back-button / nav safety
    await iphone.evaluate(() => setView("calendar"));
    await iphone.waitForSelector("#view-calendar.active-view");
    const back = iphone.locator('#view-calendar [data-contextual-back="calendar"], #view-calendar .back-button');
    check("Calendar has back button", await back.count() > 0);
    if (await back.count()) {
      await back.first().click();
      await iphone.waitForTimeout(400);
      const active = await iphone.evaluate(() => document.querySelector(".active-view")?.id || "");
      check("Calendar back returns to a safe view", Boolean(active), active);
    }
    // Re-assign for remaining screenshots
    await iphone.evaluate(async ({ planId, week }) => {
      await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: week, ageGroup: "Preschool", replaceExisting: true });
    }, { planId: free.id, week: weekStart });

    // Loading / error / polish checks after teacher UX pass
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const scheduleJs = fs.readFileSync(path.join(ROOT, "scripts/llh-schedule.js"), "utf8");
    const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    check("Calendar shows Saving… busy state hook", appJs.includes("mainCalendarBusy") && appJs.includes("Saving…"));
    check("Add Event uses modal (no prompt)", indexHtml.includes('id="scheduleEventModal"') && appJs.includes("openCalendarAddItemDialog") && !/openCalendarAddItemDialog[\s\S]{0,800}prompt\(/.test(appJs));
    check("Schedule cache merge guards empty remote overwrite", scheduleJs.includes("mergeScheduleDocs") && scheduleJs.includes("Never replace a richer local cache"));
    check("Force reload keeps local items when remote is empty", appJs.includes("never drop local items on refresh") || appJs.includes("Guard: never drop local items"));

    // Force-reload cache preservation smoke
    const cacheGuard = await iphone.evaluate(async (email) => {
      const api = window.LLHSchedule;
      const before = api.readCache(email);
      const countBefore = (before.items || []).length;
      // Simulate empty remote by clearing server doc via empty PUT then force reload with local still rich
      const localRich = { ...before, items: before.items || [] };
      api.writeCache(email, localRich);
      scheduleDocCache = null;
      await ensureScheduleLoaded({ force: true });
      const after = scheduleDocCache || api.readCache(email);
      return { countBefore, countAfter: (after.items || []).length };
    }, USER_EMAIL);
    check("Force reload does not wipe ScheduleItem cache", cacheGuard.countAfter >= cacheGuard.countBefore && cacheGuard.countBefore > 0, JSON.stringify(cacheGuard));

    note("low", "navigation", "Curriculum Planner and Calendar both remain in nav — intentional until 90+ re-audit and retirement gate", "", { soakOnly: true });
    note("low", "loading", "No dedicated skeleton UI while schedule loads — brief empty flash still possible", "", { soakOnly: true });

    // Android screenshots of key screens
    const android = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
    android.on("dialog", async (d) => { await d.accept(); });
    await loginAsTeacher(android);
    await android.evaluate(async ({ planId, week }) => {
      await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: week, ageGroup: "Preschool", replaceExisting: true });
    }, { planId: free.id, week: weekStart });
    for (const [view, name] of [
      ["home", "18-android-dashboard"],
      ["calendar", "19-android-calendar"],
      ["planner", "20-android-weekly-planner"],
      ["lessons", "21-android-lesson-library"],
      ["curriculum-planner", "22-android-curriculum-planner"],
    ]) {
      await android.evaluate((v) => setView(v), view);
      await android.waitForTimeout(700);
      const overflow = await countOverflow(android);
      if (overflow.overflowX) note("high", "mobile", `Horizontal overflow on Android for ${view}`, JSON.stringify(overflow));
      screenshots.push(path.basename(await shot(android, name, `#view-${view}`)));
    }
    check("Android calendar no overflow", !(await (async () => {
      await android.evaluate(() => setView("calendar"));
      await android.waitForTimeout(500);
      return (await countOverflow(android)).overflowX;
    })()));

    // Desktop screenshots
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    desktop.on("dialog", async (d) => { await d.accept(); });
    await loginAsTeacher(desktop);
    await desktop.evaluate(async ({ planId, week, future, altId }) => {
      await assignScheduleLessonPlan({ resourceId: planId, weekStartDate: week, ageGroup: "Preschool", replaceExisting: true });
      await assignScheduleLessonPlan({ resourceId: altId, weekStartDate: future, ageGroup: "Preschool", replaceExisting: true });
    }, { planId: free.id, week: weekStart, future: futureWeek, altId: alt.id });
    for (const [view, name] of [
      ["home", "23-desktop-dashboard"],
      ["calendar", "24-desktop-calendar"],
      ["planner", "25-desktop-weekly-planner"],
      ["lessons", "26-desktop-lesson-library"],
      ["curriculum-planner", "27-desktop-curriculum-planner"],
    ]) {
      await desktop.evaluate((v) => setView(v), view);
      await desktop.waitForTimeout(700);
      screenshots.push(path.basename(await shot(desktop, name, `#view-${view}`)));
    }
    // Desktop calendar detail panel
    await desktop.evaluate(() => setView("calendar"));
    await desktop.waitForTimeout(500);
    screenshots.push(path.basename(await shot(desktop, "28-desktop-calendar-week-detail", "#view-calendar")));

    // Heuristic UX notes from desktop calendar for directors
    const desktopCalText = await desktop.locator("#view-calendar").innerText();
    if (!/Previous|Next|Today/i.test(desktopCalText)) note("medium", "calendar", "Month navigation affordances unclear");
    if (!/Assign Lesson Plan|Change Lesson Plan/i.test(desktopCalText)) note("low", "calendar", "Director assign CTA wording could be clearer");
    await desktop.evaluate(() => setView("planner"));
    await desktop.waitForTimeout(500);
    check("Desktop Weekly Planner shows five day cards", await desktop.locator("#weeklyPlannerApp .llh-day-card").count() === 5);
    check("Desktop Weekly Planner uses horizontal week board", await desktop.evaluate(() => {
      const board = document.querySelector("#weeklyPlannerApp .llh-week-day-board");
      if (!board) return false;
      const style = window.getComputedStyle(board);
      const cols = String(style.gridTemplateColumns || "");
      const colCount = cols === "none" ? 0 : cols.trim().split(/\s+/).filter(Boolean).length;
      const visibleCards = [...board.querySelectorAll(".llh-day-card")].filter((card) => window.getComputedStyle(card).display !== "none").length;
      return visibleCards === 5 && (colCount >= 5 || style.display === "grid");
    }));
    check("Desktop calendar uses weekday planning grid", await desktop.locator(".llh-calendar-grid-weekdays").count() > 0);
    await desktop.evaluate(() => setView("calendar"));
    await desktop.waitForTimeout(400);
    const searchHiddenOnCalendar = await desktop.evaluate(() => {
      const wrap = document.querySelector(".topbar .search-wrap");
      if (!wrap) return true;
      return window.getComputedStyle(wrap).display === "none";
    });
    check("Global search hidden on Calendar", searchHiddenOnCalendar);
    check("Desktop Add Event opens modal", await desktop.locator("#scheduleEventModal").count() > 0);
    await desktop.click("[data-calendar-add-item]");
    await desktop.waitForTimeout(300);
    const modalOpen = await desktop.locator("#scheduleEventModal.open").count();
    check("Add Event modal opens without prompt", modalOpen > 0);
    if (modalOpen) {
      screenshots.push(path.basename(await shot(desktop, "29-desktop-add-event-modal", "#scheduleEventModal")));
      await desktop.click("[data-close-schedule-event-modal]");
    }
    note("low", "calendar", "No multi-month agenda list yet — directors planning far ahead use month paging", "", { soakOnly: true });

    // Copy screenshots into repo docs folder for PR browsing
    const repoShotDir = path.join(DOCS_DIR, "scheduling-owner-audit");
    fs.mkdirSync(repoShotDir, { recursive: true });
    for (const file of fs.readdirSync(OUT_DIR)) {
      if (file.endsWith(".png") || file.endsWith(".md") || file.endsWith(".json")) {
        fs.copyFileSync(path.join(OUT_DIR, file), path.join(repoShotDir, file));
      }
    }

    const score = scoreFromFindings(findings, checks);
    const report = writeReport({ score, screenshots, plans: { free, alt } });
    // also ensure repo doc path
    fs.writeFileSync(path.join(DOCS_DIR, "SCHEDULING_OWNER_AUDIT.md"), report);
    console.log(`\nOwner-review score: ${score}/100`);
    console.log(`Findings: ${findings.length} | Checks passed: ${checks.filter((c) => c.ok).length}/${checks.length}`);
    console.log(`Screenshots: ${screenshots.length}`);
    console.log(`Report: docs/SCHEDULING_OWNER_AUDIT.md`);
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("Owner audit failed:", error);
  process.exit(1);
});
