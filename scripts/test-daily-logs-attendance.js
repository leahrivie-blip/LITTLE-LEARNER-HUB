#!/usr/bin/env node
/**
 * Phase 2 — Daily Logs attendance & care workflow (testing only).
 * Run: npm run test:daily-logs-attendance
 * Do not merge. Do not deploy production.
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase2-daily-logs";
const OWNER = "phase2.daily.logs@example.com";

function request(port, method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: "true",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server not healthy");
}

function getChildAttendanceState(child, records, today) {
  const attendance = (records.attendance || [])
    .filter((item) => item.childId === child.id && item.date === today)
    .slice(-1)[0];
  if (!attendance) return "not_arrived";
  if (String(attendance.status || "").toLowerCase() === "absent") return "absent";
  if (attendance.pickup) return "checked_out";
  if (attendance.dropoff || String(attendance.status || "").toLowerCase() === "present") return "checked_in";
  return "not_arrived";
}

function unitTests() {
  const child = { id: "c1", name: "Waylon" };
  const today = "2026-07-14";
  assert.equal(getChildAttendanceState(child, { attendance: [] }, today), "not_arrived");
  assert.equal(getChildAttendanceState(child, {
    attendance: [{ childId: "c1", date: today, status: "Present", dropoff: "07:32" }],
  }, today), "checked_in");
  assert.equal(getChildAttendanceState(child, {
    attendance: [{ childId: "c1", date: today, status: "Present", dropoff: "07:32", pickup: "15:45" }],
  }, today), "checked_out");
  assert.equal(getChildAttendanceState(child, {
    attendance: [{ childId: "c1", date: today, status: "Absent" }],
  }, today), "absent");

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(appJs, /function getChildAttendanceState/);
  assert.match(appJs, /function dlcChildrenForDashboard/);
  assert.match(appJs, /function dlcCheckedInChildIds/);
  assert.match(appJs, /function dlcUndoLastEntry/);
  assert.match(appJs, /function dlcSetSaveStatus/);
  assert.match(appJs, /function upsertDailyLogAttendance/);
  assert.match(appJs, /function dlcGuardFormSubmit/);
  assert.match(appJs, /function dlcFinalizeReportPreview/);
  assert.match(appJs, /function renderDlcReportPreviewCard/);
  assert.match(appJs, /data-dlc-classroom-filter/);
  assert.match(appJs, /data-dlc-undo/);
  assert.match(appJs, /data-dlc-select-present/);
  assert.match(appJs, /data-dlc-report-share/);
  assert.match(appJs, /Draft — not shared yet/);
  assert.match(appJs, /Log present group/);
  assert.match(appJs, /Nothing was sent to families/);
  assert.match(appJs, /recordedBy/);
  assert.match(appJs, /dlcQuickActionLockUntil/);
  assert.match(appJs, /Already checked in/);
  assert.match(appJs, /shareWithFamily: false/);
  assert.match(appJs, /id: "bottle"/);
  assert.match(appJs, /id: "naps"/);
  assert.match(appJs, /id: "diapers"/);
  assert.match(appJs, /id: "mood"/);
  assert.match(stylesCss, /\.dlc-status-bar/);
  assert.match(stylesCss, /\.dlc-report-preview/);
  assert.match(stylesCss, /min-height: 44px/);
  console.log("PASS  static + unit attendance helpers");
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  unitTests();

  const port = 47000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-dlc-${crypto.randomBytes(4).toString("hex")}.json`);
  const server = spawnServer({ port, storePath });
  let browser;
  try {
    await waitForHealth(port, server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(({ email }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          role: "owner",
          firstName: "Leah",
          accountType: "home_daycare",
          businessName: "Phase 2 Test Nest",
          subscriptionStatus: "Pro",
          createdAt: new Date().toISOString(),
        },
      }));
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
    }, { email: OWNER });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.saveDailyLogQuickAction === "function"
      && typeof window.renderDailyLogsCenter === "function"
      && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting), null, { timeout: 30000 });

    const seeded = await page.evaluate(() => {
      const today = dlcActiveDate();
      const roomA = "room-oaks";
      const roomB = "room-maples";
      // Lightweight classroom labels via child fields (schedule rooms optional).
      const children = [
        { id: "child-ava", name: "Ava Tester", ageGroup: "Toddler", classroomId: roomA, classroom: "Oaks" },
        { id: "child-ben", name: "Ben Tester", ageGroup: "Toddler", classroomId: roomA, classroom: "Oaks" },
        { id: "child-cara", name: "Cara Tester", ageGroup: "Preschool", classroomId: roomB, classroom: "Maples" },
      ];
      saveChildStore("Profiles", children);
      saveChildStore("Attendance", []);
      saveChildStore("Meals", []);
      saveChildStore("Naps", []);
      saveChildStore("Diapers", []);
      saveChildStore("ActivityLogs", []);
      saveChildStore("Communications", []);
      saveChildStore("Photos", []);
      saveChildStore("Reports", []);
      dlcClassroomFilter = "all";
      dlcUndoStack = [];
      dailyLogsSection = "home";
      childManagementMode = "daily-logs";
      if (typeof setView === "function") {
        setView("child-tools-daily-logs", { skipAccessRedirect: true });
      } else {
        renderChildManagement();
      }
      return { today, count: getActiveChildren(childRecords()).length };
    });
    assert.equal(seeded.count, 3);

    await page.waitForSelector(".dlc-dashboard-attendance", { state: "visible", timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "daily-logs-home.png") });

    // Check in Ava + Ben; mark Cara absent
    await page.evaluate(() => {
      saveDailyLogQuickAction("check-in", "child-ava");
      saveDailyLogQuickAction("check-in", "child-ben");
      saveDailyLogQuickAction("absent", "child-cara");
      renderChildManagement();
    });
    await page.waitForTimeout(200);

    const afterCheckIn = await page.evaluate(() => {
      const records = childRecords();
      const today = dlcActiveDate();
      const kids = getActiveChildren(records);
      return {
        states: Object.fromEntries(kids.map((c) => [c.id, getChildAttendanceState(c, records, today)])),
        presentLabel: document.body.innerText.includes("Present"),
        classroomFilter: Boolean(document.querySelector("[data-dlc-classroom-filter]")),
        undo: typeof dlcCanUndo === "function" ? dlcCanUndo() : false,
        statusBar: Boolean(document.querySelector("[data-dlc-save-status]")),
        privacy: /nothing sends automatically/i.test(document.body.innerText),
      };
    });
    assert.equal(afterCheckIn.states["child-ava"], "checked_in");
    assert.equal(afterCheckIn.states["child-ben"], "checked_in");
    assert.equal(afterCheckIn.states["child-cara"], "absent");
    assert.equal(afterCheckIn.classroomFilter, true);
    assert.equal(afterCheckIn.undo, true);
    assert.equal(afterCheckIn.privacy, true);
    console.log("PASS  check-in / absent + classroom filter chrome");

    // Duplicate check-in must not create a second attendance row
    const dup = await page.evaluate(() => {
      const before = childStore("Attendance").filter((a) => a.childId === "child-ava").length;
      saveDailyLogQuickAction("check-in", "child-ava");
      const after = childStore("Attendance").filter((a) => a.childId === "child-ava").length;
      return { before, after, status: dlcSaveStatus.message };
    });
    assert.equal(dup.before, dup.after, "duplicate check-in must not append another attendance record");
    assert.match(dup.status || "", /Already checked in/i);
    console.log("PASS  duplicate check-in guard");

    // Classroom filter to Oaks
    await page.selectOption("[data-dlc-classroom-filter]", "room-oaks");
    await page.waitForTimeout(200);
    const filtered = await page.evaluate(() => {
      const names = [...document.querySelectorAll(".dlc-att-card h4")].map((el) => el.textContent.trim());
      return {
        names,
        filterValue: dlcClassroomFilter,
        visibleCount: dlcChildrenForDashboard(childRecords()).length,
      };
    });
    assert.equal(filtered.filterValue, "room-oaks");
    assert.equal(filtered.visibleCount, 2);
    assert.ok(filtered.names.includes("Ava Tester"));
    assert.ok(filtered.names.includes("Ben Tester"));
    assert.ok(!filtered.names.includes("Cara Tester"));
    console.log("PASS  classroom filter");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "daily-logs-classroom-filter.png") });

    // Group meal for present children with amount
    await page.evaluate(() => {
      dlcClassroomFilter = "all";
      dailyLogsSection = "group";
      dailyLogsGroupAction = "meals";
      renderChildManagement();
    });
    await page.waitForSelector("#groupUpdateForm", { timeout: 8000 });
    await page.click('[data-dlc-group-select="present"]');
    await page.fill('input[name="content"]', "Pasta and peas");
    await page.selectOption('select[name="amount"]', "Ate most");
    await page.click('#groupUpdateForm button[type="submit"]');
    await page.waitForTimeout(300);
    const meals = await page.evaluate(() => {
      const today = dlcActiveDate();
      return childStore("Meals").filter((m) => m.date === today).map((m) => ({
        childId: m.childId,
        lunch: m.lunch,
        amount: m.amount,
        recordedBy: m.recordedBy,
        shareWithFamily: m.shareWithFamily,
      }));
    });
    assert.equal(meals.length, 2);
    assert.ok(meals.every((m) => /Pasta and peas/.test(m.lunch)));
    assert.ok(meals.every((m) => m.recordedBy));
    console.log("PASS  group meal for present children");

    // Nap + diaper + mood via quick path helpers
    await page.evaluate(() => {
      appendChildRecord("Naps", {
        childId: "child-ava",
        date: dlcActiveDate(),
        napStart: "12:10",
        napEnd: "13:40",
        title: `Nap | ${dlcActiveDate()}`,
        summary: "Nap 12:10–13:40",
        shareWithFamily: true,
      }, { skipRender: true });
      appendChildRecord("Diapers", {
        childId: "child-ava",
        date: dlcActiveDate(),
        time: "10:15",
        type: "Wet",
        title: `Wet | ${dlcActiveDate()}`,
        summary: "Wet",
        shareWithFamily: true,
      }, { skipRender: true });
      appendChildRecord("Communications", {
        childId: "child-ava",
        date: dlcActiveDate(),
        type: "Mood Note",
        mood: "Happy",
        title: `Mood | ${dlcActiveDate()}`,
        summary: "Happy",
        shareWithFamily: false,
      }, { skipRender: true });
      selectedChildId = "child-ava";
      dailyLogsSection = "individual";
      dailyLogsChildTab = "overview";
      renderChildManagement();
    });
    await page.waitForSelector(".dlc-timeline-list", { timeout: 8000 });
    const timeline = await page.evaluate(() => ({
      text: document.querySelector(".dlc-timeline-list")?.innerText || "",
      internal: /Internal Only/i.test(document.querySelector(".dlc-timeline-list")?.innerText || ""),
      shared: /Shared with Family/i.test(document.querySelector(".dlc-timeline-list")?.innerText || ""),
      recorder: /Leah|Owner|Provider/i.test(document.querySelector(".dlc-timeline-list")?.innerText || ""),
    }));
    assert.match(timeline.text, /Checked In|Nap|Wet|Mood/i);
    assert.equal(timeline.internal, true);
    assert.equal(timeline.shared, true);
    assert.equal(timeline.recorder, true);
    console.log("PASS  timeline visibility + recorder");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "daily-logs-timeline.png") });

    // Undo last entry
    const undone = await page.evaluate(() => {
      const before = childStore("Communications").length;
      const ok = dlcUndoLastEntry();
      return { ok, before, after: childStore("Communications").length };
    });
    assert.equal(undone.ok, true);
    assert.equal(undone.after, undone.before - 1);
    console.log("PASS  undo recent entry");

    // Attendance form path must upsert (not append duplicates)
    const upsert = await page.evaluate(() => {
      const today = dlcActiveDate();
      saveChildStore("Attendance", childStore("Attendance").filter((a) => a.childId !== "child-ben"));
      upsertDailyLogAttendance("child-ben", {
        date: today,
        status: "Present",
        dropoff: "08:00",
        shareWithFamily: true,
      }, { skipRender: true });
      upsertDailyLogAttendance("child-ben", {
        date: today,
        status: "Present",
        dropoff: "08:05",
        pickup: "15:00",
        shareWithFamily: true,
      }, { skipRender: true });
      const rows = childStore("Attendance").filter((a) => a.childId === "child-ben" && a.date === today);
      return {
        count: rows.length,
        dropoff: rows[0]?.dropoff,
        pickup: rows[0]?.pickup,
      };
    });
    assert.equal(upsert.count, 1, "attendance upsert must keep one row per child/day");
    assert.equal(upsert.pickup, "15:00");
    console.log("PASS  attendance upsert (form path helper)");

    // Report draft stays internal until Share confirm
    const draft = await page.evaluate(async () => {
      const today = dlcActiveDate();
      const saved = appendChildRecord("Reports", {
        childId: "child-ava",
        date: today,
        title: `Daily Report | ${today}`,
        type: "Daily Report",
        status: "draft",
        message: "Ava painted and rested after lunch.",
        summary: "Ava painted and rested after lunch.",
        shareWithFamily: false,
      }, { skipNotify: true, skipRender: true });
      dlcPendingReportPreview = {
        childId: "child-ava",
        recordId: saved.id,
        storeKey: "Reports",
        kind: "daily-report",
        text: saved.message,
      };
      selectedChildId = "child-ava";
      dailyLogsSection = "individual";
      dailyLogsChildTab = "overview";
      renderChildManagement();
      return {
        previewVisible: Boolean(document.querySelector("[data-dlc-report-preview]")),
        recordId: saved.id,
      };
    });
    assert.equal(draft.previewVisible, true);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "daily-logs-report-draft.png") });
    const keptInternal = await page.evaluate(async (recordId) => {
      await dlcFinalizeReportPreview(recordId, { share: false, storeKey: "Reports" });
      const record = childStore("Reports").find((r) => r.id === recordId);
      return {
        shared: record?.shareWithFamily === true,
        status: record?.status || "",
        previewGone: !document.querySelector("[data-dlc-report-preview]"),
      };
    }, draft.recordId);
    assert.equal(keptInternal.shared, false);
    assert.equal(keptInternal.status, "draft");
    assert.equal(keptInternal.previewGone, true);
    console.log("PASS  report draft stays internal until share");

    // Mobile: no horizontal overflow on dashboard
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      dailyLogsSection = "home";
      dlcClassroomFilter = "all";
      renderChildManagement();
    });
    await page.waitForTimeout(250);
    const mobile = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        overflowX: doc.scrollWidth > doc.clientWidth + 2,
        hasCards: document.querySelectorAll(".dlc-att-card").length >= 3,
        touchBtn: (() => {
          const btn = document.querySelector(".dlc-att-primary");
          if (!btn) return false;
          const rect = btn.getBoundingClientRect();
          return rect.height >= 40;
        })(),
      };
    });
    assert.equal(mobile.overflowX, false, "Daily Logs mobile must not horizontally overflow");
    assert.equal(mobile.hasCards, true);
    assert.equal(mobile.touchBtn, true);
    console.log("PASS  mobile Daily Logs layout");
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "screenshots", "daily-logs-mobile.png"),
      fullPage: true,
    });

    const report = [
      "# Phase 2 Daily Logs Attendance Report",
      "",
      "**Environment:** Testing only (`HOME_DAYCARE_HUB_TESTING`)",
      "**Rule:** Do not merge. Do not deploy production.",
      "",
      "## Verdict",
      "",
      "**PASS** — Classroom filter, present-group logging, duplicate check-in guard, undo, timeline privacy/recorder, and mobile layout checks passed with disposable children.",
      "",
    ].join("\n");
    fs.mkdirSync(path.join(ROOT, "docs/audits"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "docs/audits/PHASE2_DAILY_LOGS_ATTENDANCE_REPORT.md"), report);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "PHASE2_DAILY_LOGS_ATTENDANCE_REPORT.md"), report);
    console.log("Wrote docs/audits/PHASE2_DAILY_LOGS_ATTENDANCE_REPORT.md");
    console.log("ALL DAILY LOGS ATTENDANCE CHECKS PASSED");
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
