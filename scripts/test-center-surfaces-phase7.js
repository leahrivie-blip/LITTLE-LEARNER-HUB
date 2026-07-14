#!/usr/bin/env node
/**
 * Phase 7 — Center surfaces (Classrooms, Families, Enrollment, Staff).
 * Run: node scripts/test-center-surfaces-phase7.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const accountAccess = require("./account-access.js");
const scheduleLib = require("../server/schedule-lib.js");

const ROOT = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

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

test("Center surfaces keep capability gating", () => {
  assert.equal(accountAccess.canAccessCapability({ accountType: "center", role: "director" }, "classrooms"), true);
  assert.equal(accountAccess.canAccessCapability({ accountType: "center", role: "owner" }, "families"), true);
  assert.equal(accountAccess.canAccessCapability({ accountType: "center", role: "teacher" }, "enrollment"), false);
  assert.equal(accountAccess.canAccessCapability({ accountType: "home_daycare", role: "owner" }, "classrooms"), false);
  assert.equal(accountAccess.canAccessCapability({ accountType: "home_daycare", role: "owner" }, "staff_management"), true);
});

test("Schedule classroom model keeps age group + archived", () => {
  const room = scheduleLib.normalizeClassroom({
    id: "classroom-toddlers",
    name: "Toddler Room",
    ageGroupDefault: "Toddler",
    archived: true,
    notes: "Near playground",
  });
  assert.equal(room.ageGroupDefault, "Toddler");
  assert.equal(room.archived, true);
  assert.equal(room.notes, "Near playground");
});

test("App wires real center/staff renderers", () => {
  assert.match(appJs, /function renderClassroomsPage\(/);
  assert.match(appJs, /function renderFamiliesPage\(/);
  assert.match(appJs, /function renderEnrollmentPage\(/);
  assert.match(appJs, /function renderStaffManagementPage\(/);
  assert.match(appJs, /persistScheduleClassrooms\(/);
  assert.match(appJs, /centerProgramData\(/);
  assert.match(appJs, /resolvedView === "classrooms"\) renderClassroomsPage/);
  assert.match(appJs, /resolvedView === "families"\) renderFamiliesPage/);
  assert.match(appJs, /resolvedView === "enrollment"\) renderEnrollmentPage/);
  assert.match(appJs, /resolvedView === "staff"\) renderStaffManagementPage/);
  assert.doesNotMatch(appJs, /These Center tools appear only for Center accounts with Owner or Director access\. Home Daycare programs keep the core workflow without this extra navigation\./);
});

test("Nav still exposes center manage links", () => {
  assert.match(html, /data-view="classrooms"/);
  assert.match(html, /data-view="families"/);
  assert.match(html, /data-view="enrollment"/);
  assert.match(html, /data-view="staff"/);
  assert.match(html, /data-nav-capability="classrooms"/);
});

test("Child profile captures parent/guardian for family grouping", () => {
  assert.match(appJs, /name="parentInfo"/);
  assert.match(appJs, /Parent \/ Guardian/);
});

if (!process.exitCode) {
  console.log("\nAll Phase 7 center-surface checks passed.");
}
