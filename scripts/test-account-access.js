#!/usr/bin/env node
/**
 * Account Type + User Role foundation tests.
 * Run: node scripts/test-account-access.js
 */

const assert = require("node:assert/strict");
const accountAccess = require("./account-access.js");

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

test("defaults existing blank account to home_daycare + owner", () => {
  const migration = accountAccess.migrateAccountAccessFields({});
  assert.equal(migration.accountType, "home_daycare");
  assert.equal(migration.role, "owner");
  assert.equal(migration.changed, true);
});

test("mapProgramTypeToAccountType maps center-like labels", () => {
  assert.equal(accountAccess.mapProgramTypeToAccountType("Home Daycare"), "home_daycare");
  assert.equal(accountAccess.mapProgramTypeToAccountType("Childcare Center"), "center");
  assert.equal(accountAccess.mapProgramTypeToAccountType("Preschool"), "center");
  assert.equal(accountAccess.mapProgramTypeToAccountType("After School Program"), "center");
  assert.equal(accountAccess.mapProgramTypeToAccountType("Other"), "home_daycare");
});

test("resolveAccountType prefers explicit accountType over programType", () => {
  const account = {
    accountType: "home_daycare",
    programSettings: { programType: "Childcare Center" },
  };
  assert.equal(accountAccess.resolveAccountType(account), "home_daycare");
});

test("resolveAccountType falls back to programSettings.programType", () => {
  const account = { programSettings: { programType: "Childcare Center" } };
  assert.equal(accountAccess.resolveAccountType(account), "center");
});

test("owner on home daycare cannot see center-only tools", () => {
  const account = { accountType: "home_daycare", role: "owner" };
  assert.equal(accountAccess.canAccessCapability(account, "staff_management"), true);
  assert.equal(accountAccess.canAccessCapability(account, "billing"), true);
  assert.equal(accountAccess.canAccessCapability(account, "classrooms"), false);
  assert.equal(accountAccess.canAccessCapability(account, "families"), false);
  assert.equal(accountAccess.canAccessCapability(account, "enrollment"), false);
  assert.equal(accountAccess.canAccessCapability(account, "daily_logs"), true);
});

test("teacher cannot access billing, staff, or enrollment", () => {
  const account = { accountType: "center", role: "teacher" };
  assert.equal(accountAccess.canAccessCapability(account, "daily_logs"), true);
  assert.equal(accountAccess.canAccessCapability(account, "documentation_helpers"), true);
  assert.equal(accountAccess.canAccessCapability(account, "billing"), false);
  assert.equal(accountAccess.canAccessCapability(account, "staff_management"), false);
  assert.equal(accountAccess.canAccessCapability(account, "enrollment"), false);
  assert.equal(accountAccess.canAccessCapability(account, "classrooms"), false);
});

test("center director can manage staff/enrollment but not billing", () => {
  const account = { accountType: "center", role: "director" };
  assert.equal(accountAccess.canAccessCapability(account, "staff_management"), true);
  assert.equal(accountAccess.canAccessCapability(account, "enrollment"), true);
  assert.equal(accountAccess.canAccessCapability(account, "families"), true);
  assert.equal(accountAccess.canAccessCapability(account, "classrooms"), true);
  assert.equal(accountAccess.canAccessCapability(account, "billing"), false);
});

test("assistant gets core tools only", () => {
  const account = { accountType: "home_daycare", role: "assistant" };
  assert.equal(accountAccess.canAccessCapability(account, "calendar"), true);
  assert.equal(accountAccess.canAccessCapability(account, "staff_management"), false);
  assert.equal(accountAccess.canAccessCapability(account, "billing"), false);
});

test("adminOverride bypasses role checks", () => {
  const account = { accountType: "home_daycare", role: "assistant" };
  assert.equal(accountAccess.canAccessCapability(account, "billing", { adminOverride: true }), true);
});

test("summarizeAccountAccess lists expected home daycare owner capabilities", () => {
  const summary = accountAccess.summarizeAccountAccess({ accountType: "home_daycare", role: "owner" });
  assert.equal(summary.accountType, "home_daycare");
  assert.equal(summary.role, "owner");
  assert.ok(summary.capabilities.includes("staff_management"));
  assert.ok(summary.capabilities.includes("billing"));
  assert.ok(!summary.capabilities.includes("enrollment"));
});

test("role aliases normalize co-teacher and family helper", () => {
  assert.equal(accountAccess.normalizeUserRole("Co-Teacher"), "teacher");
  assert.equal(accountAccess.normalizeUserRole("Family Helper"), "assistant");
  assert.equal(accountAccess.normalizeUserRole("Substitute"), "assistant");
});

test("Phase 23: curriculum_only now persists as its own account type (no longer resets to home_daycare)", () => {
  assert.equal(accountAccess.FUTURE_ACCOUNT_TYPES.CURRICULUM_ONLY, "curriculum_only");
  assert.equal(accountAccess.normalizeAccountType("curriculum_only"), "curriculum_only");
  // A real login/boot migration must not clobber it back to home_daycare/owner defaults.
  const migration = accountAccess.migrateAccountAccessFields({ accountType: "curriculum_only", role: "owner" });
  assert.equal(migration.changed, false, "curriculum_only should not be treated as a migration-worthy unknown value");
  assert.equal(migration.accountType, "curriculum_only");
});

test("curriculum_only gets curriculum/billing tools, never center-management/staff/paperwork tools", () => {
  const account = { accountType: "curriculum_only", role: "owner" };
  assert.equal(accountAccess.canAccessCapability(account, "calendar"), true);
  assert.equal(accountAccess.canAccessCapability(account, "lesson_plans"), true);
  assert.equal(accountAccess.canAccessCapability(account, "activity_library"), true);
  assert.equal(accountAccess.canAccessCapability(account, "billing"), true);
  assert.equal(accountAccess.canAccessCapability(account, "settings"), true);
  assert.equal(accountAccess.canAccessCapability(account, "forms"), false);
  assert.equal(accountAccess.canAccessCapability(account, "staff_management"), false);
  assert.equal(accountAccess.canAccessCapability(account, "permissions"), false);
  assert.equal(accountAccess.canAccessCapability(account, "reports"), false);
  assert.equal(accountAccess.canAccessCapability(account, "classrooms"), false);
  assert.equal(accountAccess.canAccessCapability(account, "families"), false);
  assert.equal(accountAccess.canAccessCapability(account, "enrollment"), false);
});

if (!process.exitCode) {
  console.log("\nAll account-access tests passed.");
}
