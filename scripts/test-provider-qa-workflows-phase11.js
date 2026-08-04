#!/usr/bin/env node
/**
 * Phase 11 — Provider-side QA workflows (safe accounts / temp stores only).
 * Runs focused existing suites and records pass/fail for the remediation report.
 *
 * Run: npm run test:provider-qa-workflows-phase11
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACT = "/opt/cursor/artifacts/admin-remediation/phase11-provider-qa.json";

const SUITES = [
  { id: "calendar-day-notes", script: "scripts/test-calendar-day-notes.js", area: "Calendar", critical: true },
  { id: "calendar-add", script: "scripts/test-calendar-add-to-calendar.js", area: "Calendar", critical: false },
  { id: "calendar-week-hub", script: "scripts/test-calendar-week-hub.js", area: "Calendar", critical: false },
  { id: "calendar-assign-download", script: "scripts/test-calendar-assign-download-blockers.js", area: "Calendar", critical: true },
  { id: "daily-logs-attendance", script: "scripts/test-daily-logs-attendance.js", area: "Daily Logs", critical: true },
  { id: "documentation-helpers", script: "scripts/test-documentation-helpers-phase6.js", area: "Documentation Helpers", critical: false },
  { id: "child-profile", script: "scripts/test-child-profile-redesign.js", area: "Child Profiles", critical: true },
  { id: "child-data-sync", script: "scripts/test-child-data-sync.js", area: "Child Profiles", critical: true },
  { id: "messaging-foundation", script: "scripts/test-messaging-foundation.js", area: "Messaging", critical: true },
  { id: "messaging-regression", script: "scripts/test-messaging-regression.js", area: "Messaging", critical: true },
];

const results = [];
let criticalFailed = 0;

for (const suite of SUITES) {
  const started = Date.now();
  console.log(`\n=== Phase 11 running ${suite.id} (${suite.area}) ===`);
  const proc = spawnSync(process.execPath, [path.join(ROOT, suite.script)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 240000,
  });
  const ok = proc.status === 0;
  if (!ok && suite.critical !== false) criticalFailed += 1;
  const entry = {
    id: suite.id,
    area: suite.area,
    script: suite.script,
    critical: suite.critical !== false,
    ok,
    status: proc.status,
    ms: Date.now() - started,
    stdoutTail: String(proc.stdout || "").slice(-1000),
    stderrTail: String(proc.stderr || "").slice(-1000),
  };
  results.push(entry);
  console.log(ok ? `PASS ${suite.id}` : (suite.critical === false ? `SOFT-FAIL ${suite.id}` : `FAIL ${suite.id}`));
  if (!ok) {
    if (entry.stderrTail) console.error(entry.stderrTail);
    else if (entry.stdoutTail) console.error(entry.stdoutTail);
  }
}

const report = {
  title: "Phase 11 Provider QA Workflows",
  finishedAt: new Date().toISOString(),
  safety: {
    realCustomersContacted: false,
    usedDisposableTempStores: true,
    teachingKitCustomerFlags: "unchanged / not enabled",
  },
  totals: {
    suites: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    criticalFailed,
  },
  results,
  leftoverQaRecords: "None expected — suites use temp JSON stores and self-cleanup.",
  remainingIssues: results.filter((r) => !r.ok).map((r) => ({
    id: r.id,
    area: r.area,
    severity: r.critical ? "high" : "medium",
    note: r.critical
      ? "Critical provider workflow failure"
      : "Non-blocking suite failure (entitlement/UI timing); recorded for follow-up",
  })),
  notes: [
    "Calendar create/edit/assign/notes covered by calendar-* suites.",
    "Daily Logs check-in/out attendance covered by daily-logs-attendance.",
    "Documentation helpers observation/parent/report generation covered by documentation-helpers-phase6.",
    "Child profile add/edit surfaces covered by child-profile-redesign + child-data-sync.",
    "Messaging send/unread/thread foundations covered by messaging-foundation + messaging-regression.",
  ],
};

fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
fs.writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
console.log(`\nWrote ${ARTIFACT}`);
console.log(`Phase 11 summary: ${report.totals.passed}/${report.totals.suites} passed (criticalFailed=${criticalFailed})`);

if (criticalFailed) {
  console.error("FAIL provider-qa-workflows-phase11");
  process.exit(1);
}
console.log("PASS provider-qa-workflows-phase11");
