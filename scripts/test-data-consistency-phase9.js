#!/usr/bin/env node
/**
 * Phase 9 — Data consistency contracts (authoritative display sources).
 * Run: npm run test:data-consistency-phase9
 *
 * Does not touch curriculum inventory.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase9";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

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

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

test("AI usage uses server resetDate from one helper path", () => {
  assert.match(appJs, /let serverAiResetDate = null/);
  assert.match(appJs, /function applyServerAiUsage\(usage = \{\}\)/);
  assert.match(appJs, /Prefer the server calendar-month reset/);
  assert.match(serverJs, /function nextAiCycleResetDate\(\)/);
  assert.match(serverJs, /resetDate: nextAiCycleResetDate\(\)/);
});

test("Notification bell prefers server unreadCount", () => {
  assert.match(appJs, /Server unreadCount is authoritative across the full inbox/);
  assert.match(appJs, /const serverUnread = Number\(data\.unreadCount\)/);
});

test("Membership displays use membershipDisplayStatus", () => {
  assert.match(appJs, /membershipDisplayStatus\(currentAccount\(\)\)/);
  assert.match(appJs, /const status = currentUser \? membershipDisplayStatus\(account\) : null/);
  assert.match(appJs, /const productStatus = membershipDisplayStatus\(account\)/);
  assert.match(appJs, /const membershipStatus = membershipDisplayStatus\(account\)/);
});

test("Child and goal counts exclude archived records", () => {
  assert.match(appJs, /const activeChildren = getActiveChildren\(records\)/);
  assert.match(appJs, /!goal\.archived && goalProgressPercent\(goal\.progress\) < 100/);
  assert.match(appJs, /const liveGoals = portfolio\.goals\.filter\(\(goal\) => !goal\.archived\)/);
  assert.match(appJs, /activeChildren\.map\(\(child\) => \[child\.id, 0\]\)/);
});

test("Plan/activity marketing counts use live library stats", () => {
  assert.match(appJs, /const freePlans = Number\(stats\.freePlans \|\| 0\)/);
  assert.match(appJs, /const freeActivities = Number\(activityStats\.freeTotal \|\| 0\)/);
  assert.doesNotMatch(appJs, /const freePlans = 10;/);
  assert.match(appJs, /`Unlimited lesson plans\$\{totalPlans > 0 \? ` \(\$\{totalPlans\} ready now\)` : ""\}`/);
});

test("Lesson activity counts prefer server activityCount", () => {
  assert.match(appJs, /const declared = Number\(plan\?\.activityCount \|\| 0\)/);
});

test("Subscription sync preserves server membership summary fields", () => {
  assert.match(appJs, /membershipPlan: subscription\.membershipPlan \|\| undefined/);
  assert.match(appJs, /accessEndLabel: subscription\.accessEndLabel \|\| undefined/);
  assert.match(appJs, /never invent "now"/);
  assert.match(appJs, /subscriptionStartedAt: subscription\.subscriptionStartedAt \|\| ""/);
});

fs.writeFileSync(path.join(ARTIFACT_DIR, "phase9-report.json"), JSON.stringify({
  suite: "data-consistency-phase9",
  generatedAt: new Date().toISOString(),
  curriculumUntouched: true,
}, null, 2));

if (!process.exitCode) console.log("\nAll Phase 9 data consistency checks passed.");
