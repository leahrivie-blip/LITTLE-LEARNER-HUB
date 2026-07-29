#!/usr/bin/env node
/**
 * Daily Logs attendance-state helpers (Phase 4).
 * Mirrors app.js getChildAttendanceState logic for regression coverage.
 * Run: node scripts/test-daily-logs-attendance.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
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

const child = { id: "c1", name: "Waylon" };
const today = "2026-07-14";

test("no attendance record => not_arrived", () => {
  assert.equal(getChildAttendanceState(child, { attendance: [] }, today), "not_arrived");
});

test("present with dropoff => checked_in", () => {
  assert.equal(getChildAttendanceState(child, {
    attendance: [{ childId: "c1", date: today, status: "Present", dropoff: "07:32" }],
  }, today), "checked_in");
});

test("present with pickup => checked_out", () => {
  assert.equal(getChildAttendanceState(child, {
    attendance: [{ childId: "c1", date: today, status: "Present", dropoff: "07:32", pickup: "15:45" }],
  }, today), "checked_out");
});

test("absent status => absent", () => {
  assert.equal(getChildAttendanceState(child, {
    attendance: [{ childId: "c1", date: today, status: "Absent" }],
  }, today), "absent");
});

test("app.js includes attendance-first Daily Logs markers", () => {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(appJs, /function getChildAttendanceState/);
  assert.match(appJs, /dlc-dashboard-attendance/);
  assert.match(appJs, /Who's here today/);
  assert.match(appJs, /data-dlc-quick-action="check-out"/);
  assert.match(appJs, /Optional: Organize a note with AI/);
  assert.match(appJs, /Group Log/);
  assert.match(appJs, /Quick Actions/);
  assert.match(appJs, /Checked In/);
  assert.match(appJs, /function dailyLogCompletionChips/);
  assert.match(appJs, /dlc-completion-chips/);
  assert.match(appJs, /formOnlyActions/);
  assert.match(appJs, /const today = dlcActiveDate\(\)/);
  assert.match(appJs, /dlc-att-section--compact-empty/);
  assert.match(appJs, /compactEmpty:\s*true/);
  assert.match(appJs, /Not Arrived[\s\S]{0,200}compactEmpty:\s*false/);
});

test("server child-data keys sync naps/diapers/activities/photos", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
  assert.match(server, /"Naps"/);
  assert.match(server, /"Diapers"/);
  assert.match(server, /"ActivityLogs"/);
  assert.match(server, /"Photos"/);
  assert.match(server, /"MealPresets"/);
});

if (!process.exitCode) {
  console.log("\nAll daily-logs attendance tests passed.");
}
