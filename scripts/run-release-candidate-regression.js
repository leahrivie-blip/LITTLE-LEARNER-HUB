#!/usr/bin/env node
/**
 * Production-critical regression gate for linked-program role repair RC.
 * Runs focused suites covering auth, admin, staff, children, attendance,
 * messaging, billing, calendar, and shared-program access.
 *
 * Run: npm run test:release-candidate-regression
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const SUITES = [
  { name: "Syntax check", cmd: "npm", args: ["run", "check"] },
  { name: "Curriculum media migration", cmd: "npm", args: ["run", "test:curriculum-media-migration"] },
  { name: "Curriculum media access", cmd: "npm", args: ["run", "test:curriculum-media-access"] },
  { name: "SEO visibility", cmd: "npm", args: ["run", "test:seo-visibility"] },
  { name: "Linked program RC", cmd: "npm", args: ["run", "test:linked-program-release-candidate"] },
  { name: "Linked program role repair", cmd: "npm", args: ["run", "test:linked-program-role-repair"] },
  { name: "Shared program ownership", cmd: "npm", args: ["run", "test:shared-program-ownership"] },
  { name: "Auth recovery audit", cmd: "npm", args: ["run", "test:auth-recovery-audit"] },
  { name: "Account access", cmd: "npm", args: ["run", "test:account-access"] },
  { name: "Login/logout session", cmd: "npm", args: ["run", "test:login-logout-session-audit"] },
  { name: "Staff invite flow", cmd: "npm", args: ["run", "test:staff-invite-flow"] },
  { name: "Daily logs + attendance", cmd: "npm", args: ["run", "test:daily-logs-attendance"] },
  { name: "Child data sync", cmd: "npm", args: ["run", "test:child-data-sync"] },
  { name: "Messaging regression", cmd: "npm", args: ["run", "test:messaging-regression"] },
  { name: "Billing membership", cmd: "npm", args: ["run", "test:billing-membership"] },
  { name: "Full site release audit (CI gate)", cmd: "npm", args: ["run", "test:release"] },
  { name: "Store safety", cmd: "npm", args: ["run", "test:store-safety"] },
  { name: "Live user protection", cmd: "npm", args: ["run", "test:live-user-protection-matrix"] },
];

const results = [];
let failed = 0;

for (const suite of SUITES) {
  process.stdout.write(`\n=== ${suite.name} ===\n`);
  const started = Date.now();
  const result = spawnSync(suite.cmd, suite.args, {
    cwd: ROOT,
    env: { ...process.env, CI: "true", NODE_ENV: "test" },
    stdio: "inherit",
    shell: false,
  });
  const ms = Date.now() - started;
  const ok = result.status === 0;
  if (!ok) failed += 1;
  results.push({ name: suite.name, ok, ms, exitCode: result.status });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${suite.name} (${ms}ms)\n`);
}

console.log("\n--- Release candidate regression summary ---");
for (const row of results) {
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name} (${row.ms}ms)`);
}

if (failed) {
  console.error(`\n${failed} suite(s) failed — merge blocked.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} regression suites passed.`);
